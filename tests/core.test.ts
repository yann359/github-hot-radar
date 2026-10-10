import { describe, expect, it } from 'vitest'
import { categoryFor, flattenHistory, normalizeRepository, parseTrendingRepos, periodMetrics, selectCandidates } from '../scripts/core.mjs'
import { rankRepos } from '../src/data'
import type { RadarData, Repo } from '../src/types'

const now = Date.UTC(2026, 9, 10, 12) / 1000
const week = Date.UTC(2026, 9, 4) / 1000
const raw = (id: number, extra: Record<string, unknown> = {}) => ({
  id, full_name: `studio/repo-${id}`, name: `repo-${id}`, owner: { login: 'studio' },
  description: 'Open source developer tools', html_url: `https://github.com/studio/repo-${id}`,
  language: 'TypeScript', topics: ['developer-tools'], stargazers_count: 100,
  created_at: '2026-01-01T00:00:00Z', pushed_at: '2026-10-09T00:00:00Z',
  default_branch: 'main', private: false, fork: false, archived: false, disabled: false,
  ...extra,
})

describe('GitHub day buckets', () => {
  it('ignores future buckets and keeps the latest partial day', () => {
    const history = [
      { week: week + 7 * 86_400, days: [99, 0, 0, 0, 0, 0, 0] },
      { week, days: [1, 2, 3, 4, 5, 6, 7] },
      ...Array.from({ length: 5 }, (_, index) => ({ week: week - (index + 1) * 7 * 86_400, days: [0, 0, 0, 0, 0, 0, 0] })),
    ]
    const metrics = periodMetrics(history, '2020-01-01T00:00:00Z', now)
    expect(metrics.periodStars[1]).toBe(7)
    expect(metrics.periodStars[7]).toBe(28)
    expect(metrics.periodStars[10]).toBe(28)
    expect(metrics.periodStars[30]).toBe(28)
    expect(metrics.historyEnd).toBe('2026-10-10')
    expect(metrics.history.every(item => item.bucket <= now)).toBe(true)
    expect(flattenHistory(history, now).some(item => item.count === 99)).toBe(false)
  })

  it('treats missing older history as unknown for an older repository', () => {
    const metrics = periodMetrics([{ week, days: [1, 2, 3, 4, 5, 6, 7] }], '2020-01-01T00:00:00Z', now)
    expect(metrics.periodStars[1]).toBe(7)
    expect(metrics.periodStars[7]).toBe(28)
    expect(metrics.periodStars[10]).toBeNull()
    expect(metrics.periodStars[30]).toBeNull()
  })

  it('allows zeros before a newly created repository existed', () => {
    const metrics = periodMetrics([{ week, days: [0, 0, 0, 2, 3, 4, 5] }], '2026-10-07T09:00:00Z', now)
    expect(metrics.periodStars[1]).toBe(5)
    expect(metrics.periodStars[30]).toBe(14)
  })
})

describe('candidate discovery', () => {
  it('excludes forks and archived repositories', () => {
    expect(normalizeRepository(raw(1, { fork: true }))).toBeNull()
    expect(normalizeRepository(raw(2, { archived: true }))).toBeNull()
    expect(categoryFor(raw(3))).toBe('tools')
  })

  it('extracts repository links only from Trending cards', () => {
    const html = '<article class="Box-row"><h2><a href="/a/alpha">A</a></h2></article><a href="/b/not-a-card">x</a><article class="Box-row"><h2><a href="/b/beta">B</a></h2></article>'
    expect(parseTrendingRepos(html)).toEqual(['a/alpha', 'b/beta'])
    expect(parseTrendingRepos('<div>changed markup</div>')).toEqual([])
  })

  it('limits the pool and reserves capacity for new candidates', () => {
    const previous = Array.from({ length: 300 }, (_, index) => ({ id: index + 1, fullName: `old/${index}`, category: 'tools', stars: 300 - index, periodStars: { 7: 300 - index } }))
    const discovered = Array.from({ length: 150 }, (_, index) => ({ id: index + 301, fullName: `new/${index}`, category: 'ai', stars: 150 - index, periodStars: { 7: 150 - index } }))
    const selected = selectCandidates(previous, discovered)
    expect(selected).toHaveLength(300)
    expect(selected.filter(item => item.id > 300)).toHaveLength(100)
  })
})

describe('board ranking', () => {
  const make = (id: number, metric: number | null, stars: number, createdAt = '2025-01-01T00:00:00Z'): Repo => ({
    id, fullName: `owner/${id}`, name: `${id}`, owner: 'owner', description: 'demo',
    htmlUrl: `https://github.com/owner/${id}`, language: 'TypeScript', topics: [],
    stars, createdAt, pushedAt: createdAt, defaultBranch: 'main', category: 'tools',
    sources: [], lastFetchedAt: '2026-10-10T12:00:00Z', history: null,
    historyFetchedAt: null, historyEnd: null, periodStars: { 1: metric, 7: metric, 10: metric, 30: metric },
    card: null, cardReadmeSha: null,
  })
  const data: RadarData = {
    schemaVersion: 1, generatedAt: '2026-10-10T12:00:00Z', lastSuccessfulAt: null,
    candidateCount: 5, source: { repositorySearch: '', trending: '', history: '', note: '' }, warnings: [],
    repos: [make(4, 2, 9), make(3, null, 500), make(1, 8, 10), make(2, 8, 20), make(5, 3, 1, '2026-10-09T12:00:00Z')],
  }
  it('ranks by recent stars, then total stars and stable name', () => {
    expect(rankRepos(data, 'hot', 7, 'all', 'all', '').map(item => item.id)).toEqual([2, 1, 5, 4])
  })
  it('filters new repositories by creation time and excludes unknown history', () => {
    expect(rankRepos(data, 'new', 1, 'all', 'all', '').map(item => item.id)).toEqual([5])
  })
  it('supports category, language and keyword filtering', () => {
    expect(rankRepos(data, 'hot', 7, 'tools', 'TypeScript', 'OWNER/1').map(item => item.id)).toEqual([1])
  })
})
