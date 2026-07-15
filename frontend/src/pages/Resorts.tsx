import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, imageUrl, IMG_PLACEHOLDER, type Resort } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

type SortKey = 'rating' | 'track_length_km' | 'elevation_drop_m'

export default function Resorts() {
  const [resorts, setResorts] = useState<Resort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rating')
  const [compareIds, setCompareIds] = useState<number[]>([])
  const toast = useToast()
  const navigate = useNavigate()
  const { user, token, refreshProfile } = useAuth()

  const visibleResorts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return resorts
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity))
  }, [resorts, search, sortKey])

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) {
        toast.show('Можно сравнить не больше 3 курортов', 'info')
        return prev
      }
      return [...prev, id]
    })
  }

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

      <div className="filter-bar">
        <label>
          Поиск
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название курорта"
          />
        </label>
        <label>
          Сортировка
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="rating">По рейтингу</option>
            <option value="track_length_km">По длине трасс</option>
            <option value="elevation_drop_m">По перепаду высот</option>
          </select>
        </label>
      </div>

      <div className="resort-grid">
        {visibleResorts.length === 0 ? (
          <div className="empty-state">
            <p>{resorts.length === 0 ? 'Курортов пока нет. Добавьте данные через API.' : 'Ничего не найдено — попробуйте изменить фильтры.'}</p>
          </div>
        ) : (
          visibleResorts.map((r) => (
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
                  <div className="resort-badges">
                    {r.freeride_rating != null && <span className="trail">🏔 Фрирайд {r.freeride_rating}/5</span>}
                    {r.trails_green != null && <span className="trail">🟢 {r.trails_green}</span>}
                    {r.trails_blue != null && <span className="trail">🔵 {r.trails_blue}</span>}
                    {r.trails_red != null && <span className="trail">🔴 {r.trails_red}</span>}
                    {r.trails_black != null && <span className="trail">⚫ {r.trails_black}</span>}
                  </div>
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
              <button
                type="button"
                className={`btn btn-sm compare-btn ${compareIds.includes(r.id) ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => toggleCompare(r.id)}
              >
                {compareIds.includes(r.id) ? '✓ В сравнении' : '⚖ Добавить к сравнению'}
              </button>
            </div>
          ))
        )}
      </div>

      {compareIds.length > 0 && (
        <div className="compare-bar">
          <span>
            Выбрано: {compareIds.map((id) => resorts.find((r) => r.id === id)?.name).filter(Boolean).join(', ')}
          </span>
          <div className="compare-bar-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={compareIds.length < 2}
              onClick={() => navigate(`/compare?ids=${compareIds.join(',')}`)}
            >
              Сравнить ({compareIds.length})
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompareIds([])}>
              Сбросить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
