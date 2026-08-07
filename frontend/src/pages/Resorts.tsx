import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  ApiError,
  imageUrl,
  type Resort,
  type AltitudePointWeather,
  type AltitudePointDailyForecast,
  type AltitudeDailyEntry,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { snowSum, dayScores, bestDayIndex, dayShort } from '../utils/weather'
import PageHead from '../components/PageHead'
import TrailPills from '../components/TrailPills'

type SortKey = 'snow' | 'rating' | 'track_length_km' | 'elevation_drop_m'
type FilterKey = 'snow20' | 'hard' | 'drop1000' | 'freeride4' | 'favorites'

/** Погоду тянем только для первых карточек — на каждый курорт два запроса */
const WEATHER_LIMIT = 12
const CARDS = 6

type Wx = { top?: AltitudePointWeather; bottom?: AltitudePointWeather; days: AltitudeDailyEntry[] }

const FILTERS: { key: FilterKey; label: string; dot?: string }[] = [
  { key: 'snow20', label: 'Свежий снег 20+ см' },
  { key: 'hard', label: 'Красные и чёрные', dot: 'var(--danger)' },
  { key: 'drop1000', label: 'Перепад 1000+ м' },
  { key: 'freeride4', label: 'Фрирайд 4+' },
  { key: 'favorites', label: 'Только избранные' },
]

export default function Resorts() {
  const [resorts, setResorts] = useState<Resort[]>([])
  const [wx, setWx] = useState<Record<number, Wx>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('snow')
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())
  const [compareIds, setCompareIds] = useState<number[]>([])
  const toast = useToast()
  const navigate = useNavigate()
  const { user, token, refreshProfile } = useAuth()

  const favoriteIds = useMemo(() => new Set(user?.favorite_resorts ?? []), [user])

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

  // Снег и температуры по высотам — для карточек и фильтра «свежий снег»
  const requested = useRef(new Set<number>())
  useEffect(() => {
    resorts.slice(0, WEATHER_LIMIT).forEach((r) => {
      if (requested.current.has(r.id)) return
      requested.current.add(r.id)
      void Promise.all([
        api.get<AltitudePointWeather[]>(`/weather/${r.id}/altitudes/current`).catch(() => []),
        api.get<AltitudePointDailyForecast[]>(`/weather/${r.id}/altitudes/daily?days=7`).catch(() => []),
      ]).then(([cur, daily]) => {
        const sorted = [...cur].sort((a, b) => a.altitude_m - b.altitude_m)
        setWx((p) => ({
          ...p,
          [r.id]: {
            top: sorted[sorted.length - 1],
            bottom: sorted[0],
            days: daily.length ? daily[daily.length - 1].days : [],
          },
        }))
      })
    })
  }, [resorts])

  const snow48 = (id: number) => {
    const d = wx[id]?.days
    return d?.length ? snowSum(d, 2) : null
  }

  const best = (id: number) => {
    const days = wx[id]?.days ?? []
    const b = bestDayIndex(days)
    if (b < 0) return null
    return { date: days[b].date, score: dayScores(days)[b] }
  }

  const toggleFilter = (k: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const visibleResorts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hardCount = (r: Resort) => (r.trails_red ?? 0) + (r.trails_black ?? 0)
    return resorts
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .filter((r) => !filters.has('snow20') || (snow48(r.id) ?? 0) >= 20)
      .filter((r) => !filters.has('hard') || hardCount(r) > 0)
      .filter((r) => !filters.has('drop1000') || (r.elevation_drop_m ?? 0) >= 1000)
      .filter((r) => !filters.has('freeride4') || (r.freeride_rating ?? 0) >= 4)
      .filter((r) => !filters.has('favorites') || favoriteIds.has(String(r.id)))
      .sort((a, b) => {
        if (sortKey === 'snow') return (snow48(b.id) ?? -1) - (snow48(a.id) ?? -1)
        return (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resorts, search, sortKey, filters, favoriteIds, wx])

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 6) {
        toast.show('Можно сравнить не больше 6 курортов', 'info')
        return prev
      }
      return [...prev, id]
    })
  }

  const toggleFavorite = async (resortId: number) => {
    if (!token) {
      toast.show('Войдите, чтобы добавлять курорты в избранное', 'info')
      return
    }
    const favs = user?.favorite_resorts ?? []
    const idStr = String(resortId)
    const next = favs.includes(idStr) ? favs.filter((id) => id !== idStr) : [...favs, idStr]
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

  if (loading) return <div className="page"><div className="loading">Загрузка курортов...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state">
        <p>{error}</p>
        {error.includes('авторизоваться') && <Link to="/login" className="btn btn-primary">Войти</Link>}
      </div>
    </div>
  )

  const cards = visibleResorts.slice(0, CARDS)
  const rest = visibleResorts.slice(CARDS)

  const meta = (r: Resort) =>
    [
      r.track_length_km != null ? `${r.track_length_km} КМ ТРАСС` : null,
      r.elevation_drop_m != null ? `ПЕРЕПАД ${r.elevation_drop_m.toLocaleString('ru-RU')} М` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="pb-resorts">
      <PageHead
        kicker={`${resorts.length} курортов · погода по высотам`}
        title="Курорты"
        right={
          <>
            <input
              type="search"
              className="pb-head-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="⌕  Название курорта…"
            />
            <select
              className="pb-cmp-add"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="snow">Больше всего снега</option>
              <option value="rating">По рейтингу</option>
              <option value="track_length_km">По длине трасс</option>
              <option value="elevation_drop_m">По перепаду высот</option>
            </select>
          </>
        }
      />

      <div className="pb-page">
        <div className="pb-filterbar">
          <span className="mono-label">ФИЛЬТРЫ</span>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`pb-filter ${filters.has(f.key) ? 'active' : ''}`}
              onClick={() => toggleFilter(f.key)}
            >
              {f.dot && <span className="pb-filter-dot" style={{ background: f.dot }} />}
              {f.label}
            </button>
          ))}
          <span className="pb-filter-count">
            Найдено <strong>{visibleResorts.length}</strong> курортов
          </span>
        </div>

        {visibleResorts.length === 0 ? (
          <div className="empty-state">
            <p>{resorts.length === 0 ? 'Курортов пока нет.' : 'Ничего не найдено — попробуйте изменить фильтры.'}</p>
          </div>
        ) : (
          <>
            <div className="pb-resorts-grid">
              {cards.map((r) => {
                const w = wx[r.id]
                const cm = snow48(r.id)
                const b = best(r.id)
                const fav = favoriteIds.has(String(r.id))
                return (
                  <div key={r.id} className="pb-rcard">
                    <Link to={`/resorts/${r.id}`} className="pb-rcard-hit" aria-label={r.name} />
                    <div className="pb-rcard-photo">
                      {r.image_url ? (
                        <img src={imageUrl(r.image_url)} alt={r.name} loading="lazy" />
                      ) : (
                        <span className="pb-rcard-photo-empty">ФОТО КУРОРТА</span>
                      )}
                      {cm != null && cm > 0 && <span className="pb-rcard-snowbadge">+{cm} СМ ЗА 48 Ч</span>}
                    </div>
                    <button
                      type="button"
                      className={`pb-rcard-fav ${fav ? 'active' : ''}`}
                      onClick={() => toggleFavorite(r.id)}
                      title={fav ? 'Удалить из избранного' : 'Добавить в избранное'}
                    >
                      {fav ? '★' : '☆'}
                    </button>
                    <div className="pb-rcard-body">
                      <div className="pb-rcard-head">
                        <span className="pb-rcard-name">{r.name}</span>
                        {r.rating != null && <span className="pb-rcard-rating">★ {r.rating.toFixed(1)}</span>}
                      </div>
                      <div className="pb-rcard-meta">{meta(r) || 'НЕТ ДАННЫХ О ТРАССАХ'}</div>
                      <div className="pb-rcard-temps">
                        {w?.top ? (
                          <>
                            <span className="pb-rcard-temp">{Math.round(w.top.temperature)}°</span>
                            {w.bottom && (
                              <span className="pb-rcard-temp-sub">
                                верх / низ {Math.round(w.bottom.temperature)}°
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="pb-rcard-temp-sub">погода загружается…</span>
                        )}
                        {b && (
                          <span className={`pb-cmp-bestpill ${b.score >= 8 ? 'top' : ''}`}>
                            <span className="pb-cmp-bestday">{dayShort(b.date)}</span>
                            <span className="pb-cmp-bestscore">{b.score}</span>
                          </span>
                        )}
                      </div>
                      <div className="pb-rcard-foot">
                        <TrailPills r={r} />
                        <button
                          type="button"
                          className={`pb-rcard-compare ${compareIds.includes(r.id) ? 'active' : ''}`}
                          onClick={() => toggleCompare(r.id)}
                        >
                          {compareIds.includes(r.id) ? '✓ В сравнении' : 'Сравнить'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {rest.length > 0 && (
              <div className="pb-resorts-list">
                <div className="mono-label">СПИСКОМ · ЕЩЁ {rest.length}</div>
                {rest.map((r) => {
                  const w = wx[r.id]
                  const cm = snow48(r.id)
                  const b = best(r.id)
                  return (
                    <Link key={r.id} to={`/resorts/${r.id}`} className="pb-rrow">
                      <span className="pb-rrow-name">
                        {r.name}
                        {r.track_length_km != null && <span className="pb-rrow-sub">{r.track_length_km} КМ</span>}
                      </span>
                      <span className="pb-rrow-snow">{cm != null ? `+${cm} см` : '—'}</span>
                      <span className="pb-rrow-temp">
                        {w?.top && w?.bottom
                          ? `${Math.round(w.top.temperature)}° / ${Math.round(w.bottom.temperature)}°`
                          : '—'}
                      </span>
                      <TrailPills r={r} />
                      <span className={`pb-rrow-best ${b && b.score >= 8 ? 'top' : ''}`}>
                        {b ? `${dayShort(b.date)} · ${b.score}` : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </>
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
