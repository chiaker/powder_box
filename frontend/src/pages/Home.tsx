import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  api,
  imageUrl,
  IMG_PLACEHOLDER,
  type Resort,
  type CurrentWeather,
  type EquipmentItem,
  type Lesson,
  type AltitudePointDailyForecast,
} from '../api/client'
import { weatherIcon, snowSum } from '../utils/weather'

export default function Home() {
  const { user, token } = useAuth()
  const [favoriteResorts, setFavoriteResorts] = useState<Resort[]>([])
  const [weatherByResort, setWeatherByResort] = useState<Record<number, CurrentWeather>>({})
  const [snowByResort, setSnowByResort] = useState<Record<number, number>>({})
  const [topResorts, setTopResorts] = useState<Resort[]>([])
  const [freshItems, setFreshItems] = useState<EquipmentItem[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])

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
      // days=7 — тот же кэш-ключ на бэке, что у страницы курорта; суммируем первые 3 дня
      api.get<AltitudePointDailyForecast[]>(`/weather/${id}/altitudes/daily?days=7`).then((points) => {
        if (!points.length) return
        const cm = snowSum(points[points.length - 1].days, 3)
        if (cm >= 1) setSnowByResort((prev) => ({ ...prev, [id]: cm }))
      }).catch(() => {})
    })
  }, [token, user?.favorite_resorts])

  // Секции для гостей: топ курортов, свежие объявления, уроки
  useEffect(() => {
    if (token) return
    api.get<Resort[]>('/resorts')
      .then((rs) => setTopResorts(
        [...rs].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3)
      ))
      .catch(() => {})
    // Сервис отдаёт по id desc — первые 4 и есть свежие
    api.get<EquipmentItem[]>('/equipment/items?limit=4')
      .then(setFreshItems)
      .catch(() => {})
    api.get<Lesson[]>('/lessons?limit=3')
      .then(setLessons)
      .catch(() => {})
  }, [token])

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
                <img src={imageUrl(r.image_url) || IMG_PLACEHOLDER} alt={r.name} />
                <div className="favorite-card-content">
                  <h3>{r.name}</h3>
                  {weatherByResort[r.id] && (
                    <div className="favorite-weather">
                      {weatherIcon(weatherByResort[r.id].condition)} {weatherByResort[r.id].temperature}°C · {weatherByResort[r.id].condition}
                    </div>
                  )}
                  {snowByResort[r.id] != null && (
                    <span className="powder-badge">❄ {snowByResort[r.id]} см за 3 дня</span>
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
      ) : (
        <>
          {topResorts.length > 0 && (
            <section className="favorites-section">
              <h2>Топ курортов</h2>
              <p className="section-hint">Лучшие по оценкам райдеров</p>
              <div className="favorites-grid-home">
                {topResorts.map((r) => (
                  <Link key={r.id} to={`/resorts/${r.id}`} className="favorite-card-home">
                    <img src={imageUrl(r.image_url) || IMG_PLACEHOLDER} alt={r.name} />
                    <div className="favorite-card-content">
                      <h3>{r.name}</h3>
                      <div className="favorite-weather">
                        {r.rating != null && <>★ {r.rating.toFixed(1)}</>}
                        {r.track_length_km != null && <> · {r.track_length_km} км трасс</>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {freshItems.length > 0 && (
            <section className="favorites-section">
              <h2>Свежие объявления</h2>
              <p className="section-hint">Аренда снаряжения от райдеров</p>
              <div className="favorites-grid-home">
                {freshItems.map((i) => (
                  <Link key={i.id} to={`/equipment/${i.id}`} className="favorite-card-home">
                    <img src={imageUrl(i.image_url) || IMG_PLACEHOLDER} alt={i.name} />
                    <div className="favorite-card-content">
                      <h3>{i.name}</h3>
                      {(i.price_per_day ?? i.price) != null && (
                        <div className="favorite-weather">
                          {i.price_per_day != null ? `${i.price_per_day} ₽/день` : `${i.price} ₽`}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <Link to="/equipment" className="btn btn-outline">Вся аренда</Link>
            </section>
          )}

          {lessons.length > 0 && (
            <section className="favorites-section">
              <h2>Уроки катания</h2>
              <p className="section-hint">Видео-уроки от инструкторов — бесплатно</p>
              <div className="favorites-grid-home">
                {lessons.map((l) => (
                  <a key={l.id} href={l.lesson_url} target="_blank" rel="noreferrer" className="favorite-card-home">
                    {l.preview_url && <img src={imageUrl(l.preview_url)} alt={l.title} />}
                    <div className="favorite-card-content">
                      <h3>{l.title}</h3>
                    </div>
                  </a>
                ))}
              </div>
              <Link to="/lessons" className="btn btn-outline">Все уроки</Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}
