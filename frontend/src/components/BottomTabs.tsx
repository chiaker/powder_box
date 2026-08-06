import { Link, useLocation } from 'react-router-dom'

/** Нижняя таб-панель мобильной версии (экраны 9a–9c) */
const TABS = [
  { to: '/', icon: '❄', label: 'Условия' },
  { to: '/resorts', icon: '◭', label: 'Курорты' },
  { to: '/compare', icon: '⇄', label: 'Сравнение' },
  { to: '/profile', icon: '✉', label: 'Алерты' },
]

export default function BottomTabs() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-tabs">
      {TABS.map((t) => {
        const active = t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)
        return (
          <Link key={t.to} to={t.to} className={`bottom-tab ${active ? 'active' : ''}`}>
            <span className="bottom-tab-icon">{t.icon}</span>
            <span className="bottom-tab-label">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
