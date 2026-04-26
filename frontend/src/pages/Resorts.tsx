import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, imageUrl, IMG_PLACEHOLDER, type Resort } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

export default function Resorts() {
  const [resorts, setResorts] = useState<Resort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { user, token, refreshProfile } = useAuth()

  useEffect(() => {
    api
      .get<Resort[]>('/resorts')
      .then(setResorts)
      .catch((e) => {
        const msg = e instanceof ApiError && e.status === 401
          ? 'Вам нужно авторизоваться для просмотра'
          : e instanceof Error ? e.message : 'Ошибка загрузки'
        setError(msg)
        if (e instanceof ApiError && e.status === 401) {
          toast.show('Вам нужно авторизоваться для просмотра курортов', 'info')
        }
      })
      .finally(() => setLoading(false))
  }, [toast])

  const toggleFavorite = async (resortId: number) => {
    if (!token) return
    const favs = user?.favorite_resorts ?? []
    const idStr = String(resortId)
    const next = favs.includes(idStr)
      ? favs.filter((id) => id !== idStr)
      : [...favs, idStr]
    try {
      await api.put('/users/me', {
        nickname: user?.nickname,
        level: user?.level,
        equipment_type: user?.equipment_type,
        favorite_resorts: next,
      })
      await refreshProfile()
      toast.show(favs.includes(idStr) ? 'Удалено из избранного' : 'Добавлено в избранное', 'success')
    } catch {
      toast.show('Ошибка обновления избранного', 'error')
    }
  }

  const favoriteIds = new Set(user?.favorite_resorts ?? [])

  if (loading) return <div className="page"><div className="loading">Загрузка курортов...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state">
        <p>{error}</p>
        {error.includes('авторизоваться') && (
          <Link to="/login" className="btn btn-primary">Войти</Link>
        )}
      </div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1>Курорты</h1>
        <p>Выберите горнолыжный курорт для просмотра погоды и условий</p>
      </header>

      <div className="resort-grid">
        {resorts.length === 0 ? (
          <div className="empty-state">
            <p>Курортов пока нет. Добавьте данные через API.</p>
          </div>
        ) : (
          resorts.map((r) => (
            <div key={r.id} className="resort-card-wrapper">
              <Link to={`/resorts/${r.id}`} className="resort-card">
                <img
                  src={imageUrl(r.image_url) || IMG_PLACEHOLDER}
                  onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
                  alt={r.name}
                  className="resort-card-image"
                />
                <div className="resort-card-body">
                  <div className="resort-card-header">
                    <h3>{r.name}</h3>
                    {r.rating != null && (
                      <span className="rating">★ {r.rating.toFixed(1)} ({r.review_count || 0})</span>
                    )}
                  </div>
                  {(r.track_length_km != null || r.elevation_drop_m != null) && (
                    <div className="resort-card-meta">
                      {r.track_length_km != null && <span>{r.track_length_km} км трасс</span>}
                      {r.elevation_drop_m != null && <span>{r.elevation_drop_m} м перепад</span>}
                    </div>
                  )}
                  {r.description && <p className="resort-desc">{r.description}</p>}
                </div>
              </Link>
              {token && (
                <button
                  type="button"
                  className={`resort-fav-btn ${favoriteIds.has(String(r.id)) ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); toggleFavorite(r.id) }}
                  title={favoriteIds.has(String(r.id)) ? 'Удалить из избранного' : 'Добавить в избранное'}
                >
                  ★
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
