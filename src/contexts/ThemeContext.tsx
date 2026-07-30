import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  cycle: () => void
}

const STORAGE_KEY = 'gabino-theme'

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const getSystemPreference = (): ResolvedTheme =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

const readStoredMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

const applyResolved = (resolved: ResolvedTheme) => {
  const root = window.document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

function useSystemPreference(): ResolvedTheme {
  const [pref, setPref] = useState<ResolvedTheme>(getSystemPreference)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handle = (e: MediaQueryListEvent) => setPref(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])
  return pref
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const systemPref = useSystemPreference()

  const resolved: ResolvedTheme = mode === 'system' ? systemPref : mode

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  useEffect(() => {
    applyResolved(resolved)
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
  }, [])

  const cycle = useCallback(() => {
    setModeState((current) => {
      if (current === 'system') return 'light'
      if (current === 'light') return 'dark'
      return 'system'
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, cycle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
