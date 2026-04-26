import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { user, token, isAdmin, logout } = useAuth()
  const loc = useLocation()

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
      <div className="nav-links">
        {navLink('/', 'Главная')}
        {navLink('/resorts', 'Курорты')}
        {token && navLink('/hotels', 'Отели')}
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
    </nav>
  )
}
