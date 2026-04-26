import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, imageUrl, type Resort, type CurrentWeather } from '../api/client'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=400'

export default function Home() {
  const { user, token } = useAuth()
  const [favoriteResorts, setFavoriteResorts] = useState<Resort[]>([])
  const [weatherByResort, setWeatherByResort] = useState<Record<number, CurrentWeather>>({})

  useEffect(() => {
    if (!token || !user?.favorite_resorts?.length) return
    const ids = user.favorite_resorts.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))
    if (ids.length === 0) return

    Promise.all(ids.map((id) => api.get<Resort>(`/resorts/${id}`).catch(() => null)))
      .then((resorts) => setFavoriteResorts(resorts.filter((r): r is Resort => r != null)))

    ids.forEach((id) => {
      api.get<CurrentWeather>(`/weather/${id}/current`).then((w) => {
        setWeatherByResort((prev) => ({ ...prev, [id]: w }))
      }).catch(() => {})
    })
  }, [token, user?.favorite_resorts])

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <h1 className="hero-title">
            Добро пожаловать в <span className="accent">PowderBox</span>
          </h1>
          <p className="hero-subtitle">
            Всё для горнолыжников и сноубордистов: курорты, погода, уроки и многое другое
          </p>
          <div className="hero-actions">
            <Link to="/resorts" className="btn btn-primary btn-lg">
              Смотреть курорты
            </Link>
            <Link to="/hotels" className="btn btn-outline btn-lg">
              Отели
            </Link>
            <Link to="/equipment" className="btn btn-outline btn-lg">
              Аренда снаряжения
            </Link>
            <Link to="/lessons" className="btn btn-outline btn-lg">
              Уроки катания
            </Link>
          </div>
        </div>
      </section>

      {token && user?.favorite_resorts?.length ? (
        <section className="favorites-section">
          <h2>Ваши избранные курорты</h2>
          <p className="section-hint">
            {user.equipment_type ? (
              <>Погода для ваших курортов · Снаряжение: <strong>{user.equipment_type === 'ski' ? 'Лыжи' : 'Сноуборд'}</strong></>
            ) : (
              'Добавьте тип снаряжения в профиле для персонализированных уроков'
            )}
          </p>
          <div className="favorites-grid-home">
            {favoriteResorts.map((r) => (
              <Link key={r.id} to={`/resorts/${r.id}`} className="favorite-card-home">
                <img src={imageUrl(r.image_url) || PLACEHOLDER_IMG} alt={r.name} />
                <div className="favorite-card-content">
                  <h3>{r.name}</h3>
                  {weatherByResort[r.id] && (
                    <div className="favorite-weather">
                      {weatherByResort[r.id].temperature}°C · {weatherByResort[r.id].condition}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <Link to="/profile" className="btn btn-outline">Редактировать избранное</Link>
        </section>
      ) : token ? (
        <section className="favorites-section">
          <h2>Избранные курорты</h2>
          <p className="section-hint">Добавьте курорты в избранное для быстрого доступа к погоде</p>
          <Link to="/resorts" className="btn btn-primary">Выбрать курорты</Link>
        </section>
      ) : null}
    </div>
  )
}
