import { createContext, useContext, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeCtx {
  theme: Theme
  /** false до первого клика — солнце не анимируется при первой загрузке */
  toggled: boolean
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggled: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  // index.html уже выставил data-theme до загрузки React
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.dataset.theme as Theme) || 'light',
  )
  const [toggled, setToggled] = useState(false)

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.theme = next
    setTheme(next)
    setToggled(true)
  }

  return <Ctx.Provider value={{ theme, toggled, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
