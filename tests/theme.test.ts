import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemePreference, THEME_STORAGE_KEY } from '../src/theme'

let stored: string | null
let systemDark: boolean
let root: { dataset: Record<string, string>; style: Record<string, string> }
let setMeta: ReturnType<typeof vi.fn>

beforeEach(() => {
  stored = null
  systemDark = false
  root = { dataset: {}, style: {} }
  setMeta = vi.fn()
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => stored) })
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: systemDark })) })
  vi.stubGlobal('document', { documentElement: root, querySelector: () => ({ setAttribute: setMeta }) })
})

describe('page appearance', () => {
  it('follows the system when the saved preference is missing or invalid', () => {
    expect(readThemePreference()).toBe('system')
    stored = 'invalid'
    systemDark = true
    applyTheme(readThemePreference())
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(setMeta).toHaveBeenCalledWith('content', '#1c1c1e')
  })

  it('keeps an explicit choice when the system uses the other appearance', () => {
    stored = 'light'
    systemDark = true
    applyTheme(readThemePreference())
    expect(root.dataset.theme).toBe('light')
    expect(setMeta).toHaveBeenCalledWith('content', '#f7f9ff')
    stored = 'dark'
    systemDark = false
    applyTheme(readThemePreference())
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
  })

  it('still opens and resolves the system theme when browser storage is disabled', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage disabled') } })
    systemDark = true
    expect(() => applyTheme(readThemePreference())).not.toThrow()
    expect(root.dataset.theme).toBe('dark')
  })
})
