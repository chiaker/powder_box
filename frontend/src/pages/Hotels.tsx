import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, imageUrl, type Hotel, type Resort } from '../api/client'
import { useAuth } from '../context/AuthContext'
import PageHead from '../components/PageHead'

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
    Promise.all([api.get<Hotel[]>('/hotels'), api.get<Resort[]>('/resorts')])
      .then(([h, r]) => {
        setHotels(h)
        setResorts(r)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [])

  const favIds = useMemo(
    () => new Set((user?.favorite_resorts ?? []).map((id) => Number(id)).filter((n) => !Number.isNaN(n))),
    [user?.favorite_resorts],
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
  if (error) return <div className="page"><div className="error-state"><p>{error}</p></div></div>

  return (
    <div className="pb-resorts">
      <PageHead
        kicker={`${hotels.length} отелей рядом с курортами`}
        title="Отели"
        right={
          <select
            className="pb-cmp-add"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="">Без сортировки</option>
            <option value="price_asc">Сначала дешевле</option>
            <option value="price_desc">Сначала дороже</option>
            <option value="rating">По рейтингу</option>
          </select>
        }
      />

      <div className="pb-page">
        <div className="pb-filterbar">
          <span className="mono-label">КУРОРТ</span>
          <button
            type="button"
            className={`pb-filter ${resortFilter === '' ? 'active' : ''}`}
            onClick={() => setResortFilter('')}
          >
            Все
          </button>
          {resorts.slice(0, 6).map((r) => (
            <button
              key={r.id}
              type="button"
              className={`pb-filter ${resortFilter === r.id ? 'active' : ''}`}
              onClick={() => setResortFilter(resortFilter === r.id ? '' : r.id)}
            >
              {r.name}
            </button>
          ))}
          {token && (
            <button
              type="button"
              className={`pb-filter ${favOnly ? 'active' : ''}`}
              onClick={() => setFavOnly((v) => !v)}
            >
              Только мои курорты
            </button>
          )}
          <span className="pb-filter-count">
            Найдено <strong>{visibleHotels.length}</strong> отелей
          </span>
        </div>

        {visibleHotels.length === 0 ? (
          <div className="pb-page-pad">
            <div className="empty-state">
              <p>{hotels.length === 0 ? 'Отелей пока нет.' : 'Ничего не найдено — попробуйте изменить фильтры.'}</p>
            </div>
          </div>
        ) : (
          <div className="pb-resorts-grid">
            {visibleHotels.map((h) => (
              <div key={h.id} className="pb-rcard">
                <Link to={`/hotels/${h.id}`} className="pb-rcard-photo">
                  {h.image_url ? (
                    <img src={imageUrl(h.image_url)} alt={h.name} loading="lazy" />
                  ) : (
                    <span className="pb-rcard-photo-empty">ФОТО ОТЕЛЯ</span>
                  )}
                  {h.price_from != null && (
                    <span className="pb-rcard-snowbadge">ОТ {h.price_from} {h.currency || '₽'}</span>
                  )}
                </Link>
                <div className="pb-rcard-body">
                  <div className="pb-rcard-head">
                    <Link to={`/hotels/${h.id}`} className="pb-rcard-name">{h.name}</Link>
                    {h.rating != null && <span className="pb-rcard-rating">★ {h.rating.toFixed(1)}</span>}
                  </div>
                  {h.resort_id != null && (
                    <div className="pb-rcard-meta">{getResortName(h.resort_id).toUpperCase()}</div>
                  )}
                  {h.description && <p className="pb-rcard-desc">{h.description}</p>}
                  <div className="pb-rcard-foot">
                    <Link to={`/hotels/${h.id}`} className="pb-rcard-compare">Подробнее →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
