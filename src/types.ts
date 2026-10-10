export type Period = 1 | 7 | 10 | 30
export type Board = 'hot' | 'new'
export type Category = 'ai' | 'tools' | 'web' | 'data' | 'learning' | 'other'

export interface LearningCard {
  purpose: string
  learn: string[]
  audience: string
  sourceUrl: string
  generatedAt: string
  model: string
}

export interface Repo {
  id: number
  fullName: string
  name: string
  owner: string
  description: string
  htmlUrl: string
  language: string | null
  topics: string[]
  stars: number
  createdAt: string
  pushedAt: string
  defaultBranch: string
  category: Category
  sources: string[]
  lastFetchedAt: string
  history: Array<{ bucket: number; count: number }> | null
  historyFetchedAt: string | null
  historyEnd: string | null
  periodStars: Record<string, number | null>
  card: LearningCard | null
  cardReadmeSha: string | null
}

export interface RadarData {
  schemaVersion: 1
  demo?: boolean
  generatedAt: string
  lastSuccessfulAt: string | null
  candidateCount: number
  source: {
    repositorySearch: string
    trending: string
    history: string
    note: string
  }
  warnings: string[]
  repos: Repo[]
}

export interface LearningEntry {
  id: number
  savedAt: string
  updatedAt: string
  saved: boolean
  read: boolean
  note: string
  snapshot: Repo
}

export interface LearningStore {
  schemaVersion: 1
  entries: Record<string, LearningEntry>
}
