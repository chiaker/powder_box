import { Outlet, Link, useLocation } from 'react-router-dom'

const adminLinks = [
  { to: '/admin/resorts', label: 'Курорты' },
  { to: '/admin/weather-points', label: 'Погода по высотам' },
  { to: '/admin/skipasses', label: 'Скипассы' },
  { to: '/admin/lessons', label: 'Уроки' },
  { to: '/admin/equipment', label: 'Снаряжение' },
  { to: '/admin/hotels', label: 'Отели' },
]

export default function AdminLayout() {
  const loc = useLocation()

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h2 className="admin-sidebar-title">Админка</h2>
        <nav className="admin-nav">
          {adminLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`admin-nav-link ${loc.pathname.startsWith(to) ? 'active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link to="/" className="admin-back">← На сайт</Link>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
