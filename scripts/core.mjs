export const PERIODS = [1, 7, 10, 30]
export const CATEGORY_KEYS = ['ai', 'tools', 'web', 'data', 'learning', 'other']

export function quotaAllows({ requestCount, maxRequests, coreRemaining, searchRemaining, search }) {
  return requestCount < maxRequests && coreRemaining >= 100 &&
    (!search || searchRemaining >= 2)
}

export const CATEGORY_LABELS = {
  ai: 'AI',
  tools: '开发工具',
  web: 'Web / 移动',
  data: '数据与科学',
  learning: '学习资源',
  other: '其他',
}

const CATEGORY_PATTERNS = {
  ai: /artificial.intelligence|machine.learning|llm|generative.ai|agent|deep.learning|chatbot/i,
  tools: /developer.tool|devtool|cli|terminal|editor|ide|code.quality|testing|workflow/i,
  web: /web.development|frontend|react|vue|svelte|mobile|android|ios|flutter|website/i,
  data: /data.science|data.analysis|database|visualization|scientific|analytics|statistics/i,
  learning: /learning|tutorial|education|awesome|course|example|interview|roadmap/i,
}

export function categoryFor(repository, hint) {
  if (hint && hint !== 'other' && CATEGORY_KEYS.includes(hint)) return hint
  const searchable = [repository.name, repository.description, ...(repository.topics ?? [])]
    .filter(Boolean).join(' ').toLowerCase()
  for (const key of CATEGORY_KEYS) {
    if (CATEGORY_PATTERNS[key]?.test(searchable)) return key
  }
  return hint && CATEGORY_KEYS.includes(hint) ? hint : 'other'
}

export function validRepository(raw) {
  return Number.isSafeInteger(raw?.id) && raw.id > 0 &&
    typeof raw.full_name === 'string' && /^[^/\s]+\/[^/\s]+$/.test(raw.full_name) &&
    !raw.private && !raw.fork && !raw.archived && !raw.disabled
}

export function normalizeRepository(raw, previous = null, hint = null, source = 'search', now = new Date()) {
  if (!validRepository(raw)) return null
  return {
    id: raw.id,
    fullName: raw.full_name,
    name: raw.name,
    owner: raw.owner?.login ?? raw.full_name.split('/')[0],
    description: typeof raw.description === 'string' ? raw.description : '',
    htmlUrl: raw.html_url ?? `https://github.com/${raw.full_name}`,
    language: raw.language ?? null,
    topics: Array.isArray(raw.topics) ? raw.topics.filter(value => typeof value === 'string').slice(0, 12) : [],
    stars: Number.isSafeInteger(raw.stargazers_count) ? raw.stargazers_count : 0,
    createdAt: raw.created_at,
    pushedAt: raw.pushed_at,
    defaultBranch: raw.default_branch ?? 'main',
    category: previous?.category ?? categoryFor(raw, hint),
    sources: [...new Set([...(previous?.sources ?? []), source])],
    lastFetchedAt: now.toISOString(),
    history: previous?.history ?? null,
    historyFetchedAt: previous?.historyFetchedAt ?? null,
    historyEnd: previous?.historyEnd ?? null,
    periodStars: previous?.periodStars ?? Object.fromEntries(PERIODS.map(days => [days, null])),
    card: previous?.card ?? null,
    cardReadmeSha: previous?.cardReadmeSha ?? null,
  }
}

export function flattenHistory(weeks, nowSeconds) {
  if (!Array.isArray(weeks)) return []
  const seen = new Map()
  for (const week of weeks) {
    if (!Number.isFinite(week?.week) || !Array.isArray(week.days) || week.days.length !== 7) continue
    week.days.forEach((count, index) => {
      const bucket = week.week + index * 86_400
      if (bucket <= nowSeconds && Number.isSafeInteger(count) && count >= 0) {
        seen.set(bucket, count)
      }
    })
  }
  return [...seen].sort(([a], [b]) => b - a).map(([bucket, count]) => ({ bucket, count }))
}

export function periodMetrics(weeks, createdAt, nowSeconds) {
  const history = flattenHistory(weeks, nowSeconds)
  const result = Object.fromEntries(PERIODS.map(days => [days, null]))
  const first = history[0]?.bucket
  if (first === undefined || first < nowSeconds - 2 * 86_400) return { history, periodStars: result, historyEnd: null }

  for (const days of PERIODS) {
    const lastIncluded = first - (days - 1) * 86_400
    const hasWholePeriod = history.some(item => item.bucket <= lastIncluded)
    const createdDuringPeriod = Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt) / 1000 >= lastIncluded
    if (!hasWholePeriod && !createdDuringPeriod) continue
    result[days] = history.filter(item => item.bucket >= lastIncluded && item.bucket <= first)
      .reduce((sum, item) => sum + item.count, 0)
  }
  return {
    history: history.slice(0, 42),
    periodStars: result,
    historyEnd: new Date(first * 1000).toISOString().slice(0, 10),
  }
}

export function roundRobinByCategory(items, limit, excluded = new Set()) {
  const queues = Object.fromEntries(CATEGORY_KEYS.map(key => [key, []]))
  const seen = new Set(excluded)
  for (const item of items) {
    const identity = item.id ?? item.fullName
    if (seen.has(identity)) continue
    seen.add(identity)
    queues[CATEGORY_KEYS.includes(item.category) ? item.category : 'other'].push(item)
  }
  const picked = []
  while (picked.length < limit) {
    let advanced = false
    for (const key of CATEGORY_KEYS) {
      if (queues[key].length && picked.length < limit) {
        picked.push(queues[key].shift())
        advanced = true
      }
    }
    if (!advanced) break
  }
  return picked
}

export function selectCandidates(previous, discovered, limit = 300) {
  const old = [...previous].sort((a, b) =>
    (b.periodStars?.[7] ?? -1) - (a.periodStars?.[7] ?? -1) ||
    b.stars - a.stars || a.fullName.localeCompare(b.fullName))
  const retained = roundRobinByCategory(old, Math.min(200, limit))
  const ids = new Set(retained.map(item => item.id))
  const newItems = discovered.filter(item => !ids.has(item.id))
  const fresh = roundRobinByCategory(newItems, Math.min(100, limit - retained.length), ids)
  const fillIds = new Set([...ids, ...fresh.map(item => item.id)])
  const fill = roundRobinByCategory([...old, ...discovered], limit - retained.length - fresh.length, fillIds)
  return [...retained, ...fresh, ...fill]
}

export function parseTrendingRepos(html) {
  if (typeof html !== 'string') return []
  const repos = new Set()
  const articles = html.match(/<article\b[^>]*class=["'][^"']*Box-row[^"']*["'][\s\S]*?<\/article>/gi) ?? []
  for (const article of articles) {
    const heading = article.match(/<h2\b[\s\S]*?<\/h2>/i)?.[0] ?? ''
    const href = heading.match(/href=["']\s*\/([^/\s"'?#]+)\/([^/\s"'?#]+)["']/i)
    if (href) repos.add(`${href[1]}/${href[2]}`)
  }
  return [...repos]
}

export function monthKeyShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  }).formatToParts(date)
  return `${parts.find(x => x.type === 'year').value}-${parts.find(x => x.type === 'month').value}`
}

export function dayKeyShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(x => x.type === type).value).join('-')
}

export function hourShanghai(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(date))
}
