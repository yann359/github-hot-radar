import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  CATEGORY_KEYS, categoryFor, normalizeRepository, parseTrendingRepos,
  periodMetrics, selectCandidates,
} from './core.mjs'
import { enrichCards, normalizedLedger } from './ai.mjs'

const STATE_DIR = resolve(process.env.RADAR_STATE_DIR ?? '.radar-data')
const OUTPUT_FILE = resolve(process.env.RADAR_OUTPUT_FILE ?? 'public/data/radar.v1.json')
const MAX_REQUESTS = 750
const API_VERSION = '2026-03-10'
const NOW = new Date()
const githubToken = process.env.GITHUB_TOKEN?.trim()
const warnings = []
let requestCount = 0
let searchCount = 0
let remaining = Number.POSITIVE_INFINITY
let stopped = false
let lastSearchAt = 0

class StopCollectionError extends Error {}

async function githubJson(path, { search = false } = {}) {
  if (stopped || requestCount >= MAX_REQUESTS || remaining < 100) {
    stopped = true
    throw new StopCollectionError('达到 GitHub 请求或剩余配额限制')
  }
  if (search) {
    if (searchCount >= 20) throw new StopCollectionError('达到本轮搜索次数上限')
    const wait = (githubToken ? 2_100 : 6_100) - (Date.now() - lastSearchAt)
    if (wait > 0) await new Promise(done => setTimeout(done, wait))
    lastSearchAt = Date.now()
    searchCount += 1
  }
  const url = new URL(path, 'https://api.github.com')
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (requestCount >= MAX_REQUESTS || remaining < 100) {
      stopped = true
      throw new StopCollectionError('达到 GitHub 请求或剩余配额限制')
    }
    requestCount += 1
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': API_VERSION,
          'user-agent': 'github-hot-radar',
          ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      })
      const header = response.headers.get('x-ratelimit-remaining')
      if (header !== null && Number.isFinite(Number(header))) remaining = Number(header)
      if (response.ok) return response.json()
      if (response.status === 404 || response.status === 422) throw new Error(`GitHub HTTP ${response.status}`)
      if (response.status === 403 || response.status === 429) {
        if (remaining < 100 || response.status === 429) {
          stopped = true
          throw new StopCollectionError(`GitHub 限流 HTTP ${response.status}`)
        }
      }
      lastError = new Error(`GitHub HTTP ${response.status}`)
      if (attempt === 0) {
        const retryAfter = Math.min(20, Math.max(1, Number(response.headers.get('retry-after')) || 2))
        await new Promise(done => setTimeout(done, retryAfter * 1000))
      }
    } catch (error) {
      if (error instanceof StopCollectionError) throw error
      if (/GitHub HTTP (404|422)/.test(error.message)) throw error
      lastError = error
      if (attempt === 0) await new Promise(done => setTimeout(done, 1_500))
    }
  }
  throw lastError ?? new Error('GitHub 请求失败')
}

async function loadState() {
  try {
    const data = JSON.parse(await readFile(join(STATE_DIR, 'state.json'), 'utf8'))
    return data?.schemaVersion === 1 && Array.isArray(data.repos)
      ? data : { schemaVersion: 1, repos: [], ledger: null, lastSuccessfulAt: null }
  } catch (error) {
    if (error.code !== 'ENOENT') warnings.push('旧采集状态无法读取，已从空状态开始。')
    return { schemaVersion: 1, repos: [], ledger: null, lastSuccessfulAt: null }
  }
}

async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await rename(temp, file)
}

function topicsFor(category) {
  return {
    ai: 'artificial-intelligence', tools: 'developer-tools',
    web: 'web-development', data: 'data-science',
    learning: 'learning', other: null,
  }[category]
}

async function discover(previousMap) {
  const found = new Map()
  const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const querySpecs = []
  for (const category of CATEGORY_KEYS) {
    const topic = topicsFor(category)
    const base = `${topic ? `topic:${topic} ` : ''}stars:>=10`
    querySpecs.push({ category, query: `${base} pushed:>=${thirtyDaysAgo}`, sort: 'updated' })
    querySpecs.push({ category, query: `${base} created:>=${thirtyDaysAgo}`, sort: 'stars' })
  }

  let searchSucceeded = false
  for (const { category, query, sort } of querySpecs) {
    if (stopped) break
    try {
      const url = `/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=30`
      const response = await githubJson(url, { search: true })
      searchSucceeded = true
      if (response.incomplete_results) warnings.push(`搜索结果可能不完整：${category}`)
      for (const raw of response.items ?? []) {
        const normalized = normalizeRepository(raw, previousMap.get(raw.id), category, 'github-search', NOW)
        if (normalized && !found.has(normalized.id)) found.set(normalized.id, normalized)
      }
    } catch (error) {
      warnings.push(`搜索暂不可用：${category} (${error.message})`)
      if (error instanceof StopCollectionError) break
    }
  }

  const trendingNames = new Set()
  for (const since of ['daily', 'weekly', 'monthly']) {
    try {
      const response = await fetch(`https://github.com/trending?since=${since}`, {
        headers: { 'user-agent': 'Mozilla/5.0 GitHubHotRadar/1.0' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      parseTrendingRepos(await response.text()).slice(0, 20).forEach(name => trendingNames.add(name))
    } catch (error) {
      warnings.push(`Trending ${since} 暂不可用：${error.message}`)
    }
  }
  if (!trendingNames.size) warnings.push('Trending 页面结构可能已变化，本轮仅使用官方搜索。')
  const foundNames = new Set([...found.values()].map(repo => repo.fullName.toLowerCase()))
  for (const name of [...trendingNames].slice(0, 24)) {
    const existing = [...found.values()].find(repo => repo.fullName.toLowerCase() === name.toLowerCase())
    if (existing) {
      existing.sources = [...new Set([...existing.sources, 'github-trending'])]
      continue
    }
    if (stopped) break
    if (foundNames.has(name.toLowerCase())) continue
    try {
      const raw = await githubJson(`/repos/${name}`)
      const normalized = normalizeRepository(raw, previousMap.get(raw.id), null, 'github-trending', NOW)
      if (normalized) {
        found.set(normalized.id, normalized)
        foundNames.add(normalized.fullName.toLowerCase())
      }
    } catch (error) {
      warnings.push(`Trending 候选暂不可用：${name} (${error.message})`)
      if (error instanceof StopCollectionError) break
    }
  }
  return { discovered: [...found.values()], searchSucceeded, trendingNames }
}

async function collect() {
  const previous = await loadState()
  const previousMap = new Map(previous.repos.map(repo => [repo.id, repo]))
  const { discovered, searchSucceeded, trendingNames } = await discover(previousMap)
  const trendingLower = new Set([...trendingNames].map(name => name.toLowerCase()))
  const prioritized = [...discovered].sort((a, b) =>
    Number(trendingLower.has(b.fullName.toLowerCase())) - Number(trendingLower.has(a.fullName.toLowerCase())))
  const selected = selectCandidates(previous.repos, prioritized, 300)
  if (!selected.length) throw new Error('没有可发布的候选项目；检查 GitHub 访问和配额后重试。')
  const discoveredMap = new Map(discovered.map(repo => [repo.id, repo]))
  let refreshed = 0
  for (let index = 0; index < selected.length; index += 1) {
    const old = previousMap.get(selected[index].id)
    let repo = discoveredMap.get(selected[index].id) ?? selected[index]
    if (stopped) break
    try {
      if (!discoveredMap.has(repo.id)) {
        const raw = await githubJson(`/repos/${repo.fullName}`)
        const fresh = normalizeRepository(raw, old, null, 'tracked', NOW)
        if (!fresh) {
          warnings.push(`已排除失效仓库：${repo.fullName}`)
          selected[index] = null
          continue
        }
        repo = fresh
      }
      const weeks = await githubJson(`/repos/${repo.fullName}/stargazers/history?per_page=6`)
      const metrics = periodMetrics(weeks, repo.createdAt, NOW.getTime() / 1000)
      if (!metrics.history.length) throw new Error('历史数据暂不可用')
      repo.history = metrics.history
      repo.historyEnd = metrics.historyEnd
      repo.periodStars = metrics.periodStars
      repo.historyFetchedAt = NOW.toISOString()
      selected[index] = repo
      refreshed += 1
    } catch (error) {
      selected[index] = old ?? repo
      warnings.push(`项目暂未刷新：${repo.fullName} (${error.message})`)
      if (error instanceof StopCollectionError) break
    }
  }

  const repos = selected.filter(Boolean)
  const currentEnough = refreshed >= Math.ceil(repos.length * 0.8) && searchSucceeded
  const ledger = currentEnough && !stopped
    ? await enrichCards(repos, previous.ledger, githubJson, warnings, NOW)
    : normalizedLedger(previous.ledger, NOW)
  const lastSuccessfulAt = currentEnough ? NOW.toISOString() : previous.lastSuccessfulAt
  const state = {
    schemaVersion: 1, repos, ledger, lastSuccessfulAt,
    lastAttemptAt: NOW.toISOString(),
  }
  const publicData = {
    schemaVersion: 1,
    generatedAt: NOW.toISOString(),
    lastSuccessfulAt,
    candidateCount: repos.length,
    source: {
      repositorySearch: 'https://github.com/search?type=repositories',
      trending: 'https://github.com/trending',
      history: 'https://docs.github.com/en/rest/activity/starring#get-repository-star-history',
      note: '榜单仅覆盖已发现并追踪的候选仓库。近 N 天按 GitHub 日级数据桶统计，最新日仍在统计中；日界线不保证与 UTC 或北京时间一致。',
    },
    warnings: warnings.slice(0, 30),
    repos,
  }
  // Public JSON never includes the spending ledger or any credential.
  await atomicJson(join(STATE_DIR, 'state.json'), state)
  await atomicJson(OUTPUT_FILE, publicData)
  console.log(JSON.stringify({
    candidates: repos.length, refreshed, requests: requestCount,
    warnings: warnings.length, lastSuccessfulAt,
  }))
}

collect().catch(error => {
  console.error(`采集失败：${error.message}`)
  process.exitCode = 1
})
