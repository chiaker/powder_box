import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="theme-toggle" onClick={toggle} title="Сменить тему" aria-label="Сменить тему">
      <span className="theme-toggle-icon" style={{ transform: `rotate(${dark ? 360 : 0}deg)` }}>
        {dark ? '☾' : '☀'}
      </span>
    </button>
  )
}
