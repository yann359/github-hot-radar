import type { Board, Category, Period, RadarData, Repo } from './types'

export const PERIODS: Period[] = [1, 7, 10, 30]
export const CATEGORIES: Array<{ key: Category | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'ai', label: 'AI' },
  { key: 'tools', label: '开发工具' },
  { key: 'web', label: 'Web / 移动' },
  { key: 'data', label: '数据与科学' },
  { key: 'learning', label: '学习资源' },
  { key: 'other', label: '其他' },
]

export const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map(item => [item.key, item.label])) as Record<Category | 'all', string>

export function rankRepos(
  data: RadarData,
  board: Board,
  period: Period,
  category: Category | 'all',
  language: string,
  query: string,
): Repo[] {
  const asOf = Number.isFinite(Date.parse(data.generatedAt)) ? Date.parse(data.generatedAt) : Date.now()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return data.repos.filter(repo => {
    const metric = repo.periodStars?.[period]
    if (metric == null || !Number.isFinite(metric)) return false
    if (category !== 'all' && repo.category !== category) return false
    if (language !== 'all' && repo.language !== language) return false
    if (board === 'new') {
      const age = asOf - Date.parse(repo.createdAt)
      if (!Number.isFinite(age) || age < 0 || age > period * 86_400_000) return false
    }
    if (normalizedQuery) {
      const haystack = [repo.fullName, repo.description, repo.language ?? '', ...repo.topics, repo.card?.purpose ?? '']
        .join(' ').toLocaleLowerCase()
      if (!haystack.includes(normalizedQuery)) return false
    }
    return true
  }).sort((a, b) =>
    (b.periodStars[period] ?? 0) - (a.periodStars[period] ?? 0) ||
    b.stars - a.stars || a.fullName.localeCompare(b.fullName))
}

export function availableLanguages(data: RadarData): string[] {
  return [...new Set(data.repos.map(repo => repo.language).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
}

export function compactNumber(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(value % 10_000 >= 1_000 ? 1 : 0)}万`
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function timeLabel(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '等待首次更新'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}
