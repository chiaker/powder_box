import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { user, token, isAdmin, logout } = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)

  // Закрываем бургер-меню при любом переходе
  useEffect(() => {
    setOpen(false)
  }, [loc.pathname])

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`nav-link ${loc.pathname === to ? 'active' : ''}`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <span className="brand-icon">⛷</span>
        PowderBox
      </Link>

      <button
        type="button"
        className="nav-burger"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>

      <div className={`nav-menu ${open ? 'open' : ''}`}>
        <div className="nav-links">
          {navLink('/', 'Главная')}
          {navLink('/resorts', 'Курорты')}
          {navLink('/hotels', 'Отели')}
          {navLink('/equipment', 'Аренда')}
          {navLink('/lessons', 'Уроки')}
          {token && navLink('/stats', 'Моя статистика')}
        </div>
        <div className="nav-auth">
          {token ? (
            <>
              {isAdmin && <Link to="/admin/resorts" className="nav-link">Админка</Link>}
              <Link to="/profile" className="nav-link">
                {user?.nickname || 'Профиль'}
              </Link>
              <button onClick={() => void logout()} className="btn btn-ghost">
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">Вход</Link>
              <Link to="/register" className="btn btn-primary">Регистрация</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
