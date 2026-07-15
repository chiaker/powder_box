import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, imageUrl, IMG_PLACEHOLDER, type Hotel, type Resort } from '../api/client'
import { useAuth } from '../context/AuthContext'

type SortMode = '' | 'price_asc' | 'price_desc' | 'rating'

export default function Hotels() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [resorts, setResorts] = useState<Resort[]>([])
  const [resortFilter, setResortFilter] = useState<number | ''>('')
  const [sortMode, setSortMode] = useState<SortMode>('')
  const [favOnly, setFavOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, token } = useAuth()

  useEffect(() => {
    Promise.all([
      api.get<Hotel[]>('/hotels'),
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
  }, [])

  const favIds = useMemo(
    () => new Set((user?.favorite_resorts ?? []).map((id) => Number(id)).filter((n) => !Number.isNaN(n))),
    [user?.favorite_resorts]
  )

  const visibleHotels = useMemo(() => {
    const result = hotels
      .filter((h) => !resortFilter || h.resort_id === resortFilter)
      .filter((h) => !favOnly || (h.resort_id != null && favIds.has(h.resort_id)))
    if (sortMode === 'price_asc' || sortMode === 'price_desc') {
      result.sort((a, b) => {
        const pa = a.price_from ?? Infinity
        const pb = b.price_from ?? Infinity
        return sortMode === 'price_asc' ? pa - pb : (pb === Infinity ? -1 : pb) - (pa === Infinity ? -1 : pa)
      })
    } else if (sortMode === 'rating') {
      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    }
    return result
  }, [hotels, resortFilter, favOnly, favIds, sortMode])

  const getResortName = (resortId: number | undefined) =>
    resorts.find((r) => r.id === resortId)?.name ?? '—'

  if (loading) return <div className="page"><div className="loading">Загрузка отелей...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state">
        <p>{error}</p>
      </div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1>Отели</h1>
        <p>Отели рядом с горнолыжными курортами</p>
      </header>

      <div className="filter-bar">
        <label>
          Курорт
          <select value={resortFilter} onChange={(e) => setResortFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Все курорты</option>
            {resorts.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label>
          Сортировка
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="">Без сортировки</option>
            <option value="price_asc">Сначала дешевле</option>
            <option value="price_desc">Сначала дороже</option>
            <option value="rating">По рейтингу</option>
          </select>
        </label>
        {token && (
          <label className="filter-check">
            <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
            Только мои курорты
          </label>
        )}
      </div>

      <div className="hotel-grid">
        {visibleHotels.length === 0 ? (
          <div className="empty-state">
            <p>{hotels.length === 0 ? 'Отелей пока нет.' : 'Ничего не найдено — попробуйте изменить фильтры.'}</p>
          </div>
        ) : (
          visibleHotels.map((h) => (
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
    </div>
  )
}
