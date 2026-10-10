import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyStore, importJsonText, loadStore, mergeStores, saveStore, upsertEntry, backupJson } from '../src/storage'
import type { Repo } from '../src/types'

const repo: Repo = {
  id: 42, fullName: 'owner/repo', name: 'repo', owner: 'owner', description: 'A project',
  htmlUrl: 'https://github.com/owner/repo', language: 'TypeScript', topics: [], stars: 4,
  createdAt: '2026-01-01T00:00:00Z', pushedAt: '2026-01-01T00:00:00Z',
  defaultBranch: 'main', category: 'tools', sources: [], lastFetchedAt: '2026-10-10T00:00:00Z',
  history: null, historyFetchedAt: null, historyEnd: null,
  periodStars: { 1: null, 7: null, 10: null, 30: null }, card: null, cardReadmeSha: null,
}

beforeEach(() => {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
  })
})

describe('local learning records', () => {
  it('keeps saved, read and notes across a reload', () => {
    const store = upsertEntry(emptyStore(), repo, { saved: true, read: true, note: '读源码' })
    saveStore(store)
    expect(loadStore().entries['42']).toMatchObject({ saved: true, read: true, note: '读源码' })
  })

  it('keeps the newer record when importing duplicates', () => {
    const current = upsertEntry(emptyStore(), repo, { saved: true, note: '新版' })
    const older = upsertEntry(emptyStore(), repo, { note: '旧版' })
    older.entries['42'].updatedAt = '2025-01-01T00:00:00Z'
    expect(mergeStores(current, older).entries['42'].note).toBe('新版')
  })

  it('rejects damaged imports without changing saved records', () => {
    const current = upsertEntry(emptyStore(), repo, { saved: true, note: '重要' })
    saveStore(current)
    expect(() => importJsonText(current, '{bad')).toThrow('有效的 JSON')
    expect(loadStore()).toEqual(current)
    expect(backupJson()).toBeNull()
  })

  it('backs up before a valid import and merges by update time', () => {
    const current = upsertEntry(emptyStore(), repo, { saved: true, note: '旧笔记' })
    saveStore(current)
    const incoming = upsertEntry(emptyStore(), repo, { saved: true, note: '新笔记' })
    incoming.entries['42'].updatedAt = '2027-01-01T00:00:00Z'
    const merged = importJsonText(current, JSON.stringify(incoming))
    expect(merged.entries['42'].note).toBe('新笔记')
    expect(JSON.parse(backupJson()!).entries['42'].note).toBe('旧笔记')
  })
})
