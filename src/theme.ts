import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export const THEME_STORAGE_KEY = 'github-radar-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia(DARK_QUERY).matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1c1e' : '#f7f9ff')
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference)

  useEffect(() => {
    applyTheme(preference)
    const media = window.matchMedia(DARK_QUERY)
    const onSystemChange = () => { if (preference === 'system') applyTheme(preference) }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [preference])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreference(readThemePreference())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const changeTheme = (next: ThemePreference) => {
    setPreference(next)
    applyTheme(next)
    // Storage may be disabled; switching still works for this visit.
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* Keep the in-memory preference. */ }
  }

  return [preference, changeTheme] as const
}
