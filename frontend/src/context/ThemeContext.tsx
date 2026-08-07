import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeCtx {
  theme: Theme
  /** true только пока проигрывается переход — при обычном заходе на страницу солнце не едет */
  toggled: boolean
  toggle: () => void
}

const SUN_ANIM_MS = 1900 // чуть больше --dur-sky (1.8s)

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggled: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  // index.html уже выставил data-theme до загрузки React
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.dataset.theme as Theme) || 'light',
  )
  const [toggled, setToggled] = useState(false)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.theme = next
    setTheme(next)
    setToggled(true)
    // Снимаем флаг после проигрывания дуги, иначе анимация повторялась бы
    // при каждом монтировании hero (возврат на главную)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToggled(false), SUN_ANIM_MS)
  }

  return <Ctx.Provider value={{ theme, toggled, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
