import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, imageUrl, IMG_PLACEHOLDER, type Hotel, type Resort } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Hotels() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [resorts, setResorts] = useState<Resort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, token, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    const favIds = (user?.favorite_resorts ?? []).map((id) => Number(id)).filter((n) => !Number.isNaN(n))
    if (favIds.length === 0) {
      setHotels([])
      setResorts([])
      setLoading(false)
      return
    }
    const query = `resort_ids=${favIds.join(',')}`
    Promise.all([
      api.get<Hotel[]>(`/hotels?${query}`),
      api.get<Resort[]>('/resorts'),
    ])
      .then(([h, r]) => {
        setHotels(h)
        setResorts(r)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
  }, [token, user?.favorite_resorts, authLoading, navigate])

  const getResortName = (resortId: number | undefined) =>
    resorts.find((r) => r.id === resortId)?.name ?? '—'

  if (authLoading || !token) return <div className="page"><div className="loading">Загрузка...</div></div>
  if (loading) return <div className="page"><div className="loading">Загрузка отелей...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state">
        <p>{error}</p>
      </div>
    </div>
  )

  const favIds = (user?.favorite_resorts ?? []).map((id) => Number(id)).filter((n) => !Number.isNaN(n))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Отели</h1>
        <p>Отели на ваших избранных курортах</p>
      </header>

      {favIds.length === 0 ? (
        <div className="empty-state">
          <p>Добавьте курорты в избранное в профиле, чтобы видеть отели.</p>
          <Link to="/profile" className="btn btn-primary">Перейти в профиль</Link>
        </div>
      ) : (
        <div className="hotel-grid">
          {hotels.length === 0 ? (
            <div className="empty-state">
              <p>На избранных курортах пока нет отелей.</p>
            </div>
          ) : (
            hotels.map((h) => (
              <Link key={h.id} to={`/hotels/${h.id}`} className="hotel-card hotel-card-link">
                <img
                  src={imageUrl(h.image_url) || IMG_PLACEHOLDER}
                  onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
                  alt={h.name}
                  className="hotel-card-image"
                />
                <div className="hotel-card-body">
                  <h3 className="hotel-card-title">{h.name}</h3>
                  {h.rating != null && (
                    <span className="hotel-rating">★ {h.rating.toFixed(1)}</span>
                  )}
                  {h.resort_id && (
                    <span className="hotel-resort-name">{getResortName(h.resort_id)}</span>
                  )}
                  {h.price_from != null && (
                    <p className="hotel-price-hint">от {h.price_from} {h.currency || '₽'}/ночь</p>
                  )}
                  {h.description && <p className="hotel-card-desc">{h.description}</p>}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
