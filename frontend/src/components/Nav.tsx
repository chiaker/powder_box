import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'

export default function Nav() {
  const { user, token, isAdmin, logout } = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)

  // Закрываем бургер-меню при любом переходе
  useEffect(() => {
    setOpen(false)
  }, [loc.pathname])

  const navLink = (to: string, label: string) => (
    <Link to={to} className={`nav-link ${loc.pathname === to ? 'active' : ''}`}>
      {label}
    </Link>
  )

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        powderbox<span className="brand-star">*</span>
      </Link>

      {/* На мобильном переключатель темы виден в шапке, а не внутри бургер-меню */}
      <div className="nav-mobile-actions">
        <ThemeToggle />
        <button
          type="button"
          className="nav-burger"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      <div className={`nav-menu ${open ? 'open' : ''}`}>
        <div className="nav-links">
          {navLink('/resorts', 'Курорты')}
          {navLink('/compare', 'Сравнение')}
          {navLink('/hotels', 'Отели')}
          {navLink('/lessons', 'Уроки')}
          {token && navLink('/stats', 'Статистика')}
        </div>
        <div className="nav-auth">
          {token ? (
            <>
              {isAdmin && <Link to="/admin/resorts" className="nav-link">Админка</Link>}
              <Link to="/profile" className={`nav-link ${loc.pathname === '/profile' ? 'active' : ''}`}>
                {user?.nickname || 'Профиль'}
              </Link>
              <button onClick={() => void logout()} className="nav-link nav-link-btn">
                Выйти
              </button>
            </>
          ) : (
            <>
              {navLink('/login', 'Войти')}
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
