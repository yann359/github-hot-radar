import type { LearningEntry, LearningStore, Repo } from './types'

const STORAGE_KEY = 'github-hot-radar:learning:v1'
const BACKUP_KEY = 'github-hot-radar:learning:pre-import-backup:v1'
const MAX_IMPORT_BYTES = 5_000_000

export function emptyStore(): LearningStore {
  return { schemaVersion: 1, entries: {} }
}

function validEntry(value: unknown, key: string): value is LearningEntry {
  if (typeof value !== 'object' || value === null) return false
  const item = value as LearningEntry
  const repo = item.snapshot
  return Number.isSafeInteger(item.id) && item.id > 0 && String(item.id) === key &&
    typeof item.savedAt === 'string' && Number.isFinite(Date.parse(item.savedAt)) &&
    typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) &&
    typeof item.saved === 'boolean' && typeof item.read === 'boolean' && typeof item.note === 'string' && item.note.length <= 2_000 &&
    typeof repo === 'object' && repo !== null && repo.id === item.id &&
    typeof repo.fullName === 'string' && /^[^/\s]+\/[^/\s]+$/.test(repo.fullName) &&
    typeof repo.htmlUrl === 'string' && repo.htmlUrl.startsWith('https://github.com/') &&
    typeof repo.stars === 'number' && typeof repo.createdAt === 'string'
}

export function parseStore(value: unknown): LearningStore {
  if (typeof value !== 'object' || value === null) throw new Error('文件内容不是学习记录。')
  const object = value as LearningStore
  if (object.schemaVersion !== 1 || typeof object.entries !== 'object' || object.entries === null || Array.isArray(object.entries)) {
    throw new Error('学习记录版本不受支持。')
  }
  const entries = Object.entries(object.entries)
  if (entries.length > 10_000 || entries.some(([key, item]) => !validEntry(item, key))) {
    throw new Error('学习记录包含无效或过多的项目。')
  }
  return { schemaVersion: 1, entries: Object.fromEntries(entries) }
}

export function loadStore(): LearningStore {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? parseStore(JSON.parse(saved)) : emptyStore()
}

export function saveStore(store: LearningStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function upsertEntry(store: LearningStore, repo: Repo, patch: Partial<Pick<LearningEntry, 'saved' | 'read' | 'note'>>): LearningStore {
  const key = String(repo.id)
  const old = store.entries[key]
  const now = new Date().toISOString()
  const entry: LearningEntry = {
    id: repo.id,
    savedAt: old?.savedAt ?? now,
    updatedAt: now,
    saved: patch.saved ?? old?.saved ?? false,
    read: patch.read ?? old?.read ?? false,
    note: (patch.note ?? old?.note ?? '').slice(0, 2_000),
    snapshot: repo,
  }
  return { schemaVersion: 1, entries: { ...store.entries, [key]: entry } }
}

export function removeEntry(store: LearningStore, id: number): LearningStore {
  const entries = { ...store.entries }
  delete entries[String(id)]
  return { schemaVersion: 1, entries }
}

export function mergeStores(current: LearningStore, incoming: LearningStore): LearningStore {
  const entries = { ...current.entries }
  for (const [key, candidate] of Object.entries(incoming.entries)) {
    const existing = entries[key]
    if (!existing || Date.parse(candidate.updatedAt) > Date.parse(existing.updatedAt)) entries[key] = candidate
  }
  return { schemaVersion: 1, entries }
}

export function importJsonText(current: LearningStore, text: string): LearningStore {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('导入文件超过 5 MB。')
  let incoming: LearningStore
  try {
    incoming = parseStore(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('文件不是有效的 JSON。')
    throw error
  }
  // Keep the exact old data before the merge. If storage is full, leave the original untouched.
  const original = localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(current)
  localStorage.setItem(BACKUP_KEY, original)
  const merged = mergeStores(current, incoming)
  saveStore(merged)
  return merged
}

export function backupJson(): string | null {
  return localStorage.getItem(BACKUP_KEY)
}
