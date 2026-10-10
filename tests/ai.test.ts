import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichCards, normalizedLedger } from '../scripts/ai.mjs'

const now = new Date('2026-10-10T00:17:00Z') // Beijing 08:17
const makeRepo = (id: number) => ({
  id, fullName: `owner/repo-${id}`, name: `repo-${id}`, owner: 'owner',
  description: 'Demo library', language: 'TypeScript', topics: [],
  htmlUrl: `https://github.com/owner/repo-${id}`,
  periodStars: { 7: 100 - id }, stars: 100 - id, card: null, cardReadmeSha: null,
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('AI limits', () => {
  it('resets accounting on a new Shanghai day and month', () => {
    const ledger = normalizedLedger({
      month: '2026-09', spentCny: 24, day: '2026-10-09',
      successesToday: 20, attemptsToday: 24, lastAiDay: '2026-10-09',
    }, now)
    expect(ledger).toMatchObject({ month: '2026-10', day: '2026-10-10', spentCny: 0, successesToday: 0, attemptsToday: 0 })
  })

  it('stops at 20 daily cards and does not repeat on the same day', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-only')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ purpose: '工具', learn: ['学习 API'], audience: '初学者' }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 30 },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const githubJson = vi.fn(async () => ({
      encoding: 'base64', content: Buffer.from('# README').toString('base64'), sha: 'abc',
      html_url: 'https://github.com/owner/repo-1/blob/main/README.md',
    }))
    const repos = Array.from({ length: 21 }, (_, index) => makeRepo(index + 1))
    const warnings: string[] = []
    const ledger = await enrichCards(repos, null, githubJson, warnings, now)
    expect(ledger.successesToday).toBe(20)
    expect(fetchMock).toHaveBeenCalledTimes(20)
    expect(repos.filter(repo => repo.card)).toHaveLength(20)
    await enrichCards(repos, ledger, githubJson, warnings, now)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  it('never calls the provider after the monthly stop threshold', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-only')
    const fetchMock = vi.fn()
    const githubJson = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ledger = await enrichCards([makeRepo(1)], {
      month: '2026-10', spentCny: 25, day: '2026-10-10',
      successesToday: 0, attemptsToday: 0, lastAiDay: null,
    }, githubJson, [], now)
    expect(ledger.spentCny).toBe(25)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(githubJson).not.toHaveBeenCalled()
  })
})
