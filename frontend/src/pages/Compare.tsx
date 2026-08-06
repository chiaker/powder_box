import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api,
  type Resort,
  type Hotel,
  type AltitudePointWeather,
  type AltitudePointDailyForecast,
  type AltitudeDailyEntry,
  type SkipassTariff,
} from '../api/client'
import { snowSum, dayScores, bestDayIndex, dayName } from '../utils/weather'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHead from '../components/PageHead'
import TrailPills from '../components/TrailPills'
import SnowMail from '../components/SnowMail'

const MAX_COMPARE = 6

type ResortExtras = {
  top?: AltitudePointWeather
  bottom?: AltitudePointWeather
  maxAltitude?: number
  days?: AltitudeDailyEntry[]
  minSkipass?: { price: number; currency: string }
  hotels?: { from: number | null; count: number }
}

const totalTrails = (r: Resort) => {
  const parts = [r.trails_green, r.trails_blue, r.trails_red, r.trails_black].filter(
    (n): n is number => n != null,
  )
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null
}

export default function Compare() {
  const [searchParams] = useSearchParams()
  const [resorts, setResorts] = useState<Resort[]>([])
  // Стартовый выбор приходит через ?ids=1,2,3
  const [selected, setSelected] = useState<number[]>(() =>
    (searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_COMPARE),
  )
  const [extras, setExtras] = useState<Record<number, ResortExtras>>({})
  const [loading, setLoading] = useState(true)
  const { user, token, refreshProfile } = useAuth()
  const toast = useToast()

  useEffect(() => {
    api.get<Resort[]>('/resorts')
      .then(setResorts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const merge = (id: number, patch: Partial<ResortExtras>) =>
    setExtras((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const loadExtras = (id: number) => {
    // Догружаем данные один раз на курорт (кэшируются в extras)
    api.get<AltitudePointWeather[]>(`/weather/${id}/altitudes/current`)
      .then((points) => {
        if (points.length) {
          // Точки отсортированы по высоте: первая — низ, последняя — верхняя точка
          merge(id, {
            bottom: points[0],
            top: points[points.length - 1],
            maxAltitude: points[points.length - 1].altitude_m,
          })
        }
      })
      .catch(() => {})
    api.get<AltitudePointDailyForecast[]>(`/weather/${id}/altitudes/daily?days=7`)
      .then((points) => {
        if (points.length) merge(id, { days: points[points.length - 1].days })
      })
      .catch(() => {})
    api.get<SkipassTariff[]>(`/skipasses?resort_id=${id}`)
      .then((tariffs) => {
        const active = tariffs.filter((t) => t.is_active)
        if (active.length) {
          const cheapest = active.reduce((a, b) => (a.price <= b.price ? a : b))
          merge(id, { minSkipass: { price: cheapest.price, currency: cheapest.currency } })
        }
      })
      .catch(() => {})
    api.get<Hotel[]>(`/hotels?resort_id=${id}`)
      .then((hotels) => {
        const prices = hotels.map((h) => h.price_from).filter((p): p is number => p != null)
        merge(id, { hotels: { from: prices.length ? Math.min(...prices) : null, count: hotels.length } })
      })
      .catch(() => {})
  }

  // Для курортов, пришедших через URL
  useEffect(() => {
    selected.forEach((id) => {
      if (!extras[id]) loadExtras(id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addResort = (id: number) => {
    if (!id || selected.includes(id) || selected.length >= MAX_COMPARE) return
    setSelected((prev) => [...prev, id])
    if (!extras[id]) loadExtras(id)
  }

  const removeResort = (id: number) => setSelected((prev) => prev.filter((x) => x !== id))

  const favIds = new Set(user?.favorite_resorts ?? [])

  const toggleFavorite = async (resortId: number) => {
    if (!token) {
      toast.show('Войдите, чтобы добавлять курорты в избранное', 'info')
      return
    }
    const favs = user?.favorite_resorts ?? []
    const idStr = String(resortId)
    const next = favs.includes(idStr) ? favs.filter((x) => x !== idStr) : [...favs, idStr]
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

  const chosen = selected
    .map((id) => resorts.find((r) => r.id === id))
    .filter((r): r is Resort => r != null)

  // «Домашний» курорт — первый избранный среди выбранных, его колонка подсвечена
  const homeId = chosen.find((r) => favIds.has(String(r.id)))?.id

  const gridStyle = { gridTemplateColumns: `170px repeat(${Math.max(chosen.length, 1)}, 1fr)` }
  const cellCls = (r: Resort, extra = '') =>
    `pb-cmp-cell ${r.id === homeId ? 'home' : ''} ${extra}`.trim()

  const snow48 = (r: Resort) => {
    const days = extras[r.id]?.days
    return days?.length ? snowSum(days, 2) : null
  }
  const maxSnow = Math.max(...chosen.map((r) => snow48(r) ?? 0), 0)

  const bestOf = (r: Resort) => {
    const days = extras[r.id]?.days ?? []
    const b = bestDayIndex(days)
    if (b < 0) return null
    return { day: dayName(days[b].date), score: dayScores(days)[b] }
  }
  const maxScore = Math.max(...chosen.map((r) => bestOf(r)?.score ?? 0), 0)

  return (
    <div className="pb-compare">
      <PageHead
        title="Сравнение курортов"
        right={
          <>
            <span className="pb-cmp-counter">
              {chosen.length} ИЗ {MAX_COMPARE}
            </span>
            {chosen.length < MAX_COMPARE && (
              <select
                className="pb-cmp-add"
                value=""
                onChange={(e) => addResort(Number(e.target.value))}
              >
                <option value="">+ Добавить курорт</option>
                {resorts
                  .filter((r) => !selected.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            )}
          </>
        }
      />
      <div className="pb-page">
        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : chosen.length < 2 ? (
          <div className="empty-state">
            <p>Выберите минимум два курорта для сравнения.</p>
          </div>
        ) : (
          <>
            {/* Мобильный вариант (дизайн 9b): карточка на курорт вместо таблицы */}
            <div className="pb-cmp-cards">
              {chosen.map((r) => {
                const x = extras[r.id] ?? {}
                const cm = snow48(r)
                const b = bestOf(r)
                const wind = x.top?.windSpeed
                const total = totalTrails(r)
                return (
                  <div key={r.id} className={`pb-cmp-card ${r.id === homeId ? 'home' : ''}`}>
                    <div className="pb-cmp-card-head">
                      <Link to={`/resorts/${r.id}`} className="pb-cmp-name">
                        {r.name}
                      </Link>
                      {x.maxAltitude != null && (
                        <span className="pb-cmp-sub">{x.maxAltitude.toLocaleString('ru-RU')} М</span>
                      )}
                      {cm != null && cm === maxSnow && maxSnow > 0 ? (
                        <span className="pb-cmp-max">МАКС</span>
                      ) : r.id === homeId ? (
                        <span className="pb-cmp-mine">МОЙ КУРОРТ</span>
                      ) : null}
                      <button type="button" className="pb-cmp-x" onClick={() => removeResort(r.id)} title="Убрать">
                        ✕
                      </button>
                    </div>
                    <div className="pb-cmp-card-main">
                      <span className="pb-cmp-snow-val">{cm != null ? `+${cm} см` : '—'}</span>
                      {x.top && x.bottom && (
                        <span className="pb-cmp-card-temps">
                          {Math.round(x.top.temperature)}° / {Math.round(x.bottom.temperature)}°
                        </span>
                      )}
                    </div>
                    <div className="pb-cmp-bar">
                      <div
                        className="pb-cmp-bar-fill"
                        style={{ width: `${maxSnow && cm != null ? Math.round((cm / maxSnow) * 100) : 0}%` }}
                      />
                    </div>
                    <div className="pb-cmp-card-foot">
                      {b && (
                        <span className={`pb-cmp-bestpill ${b.score === maxScore && maxScore > 0 ? 'top' : ''}`}>
                          <span className="pb-cmp-bestday">{b.day}</span>
                          <span className="pb-cmp-bestscore">{b.score}</span>
                        </span>
                      )}
                      {wind != null && wind >= 15 ? (
                        <span className="pb-cmp-note danger">⚠ ВЕТЕР {Math.round(wind)} М/С</span>
                      ) : (
                        total != null && (
                          <span className="pb-cmp-card-trails">
                            <span className="pulse-dot pulse-dot-cmp" />
                            {total} трасс
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Шапка колонок */}
            <div className="pb-cmp-row pb-cmp-head-row" style={gridStyle}>
              <div className="pb-cmp-label" />
              {chosen.map((r) => (
                <div key={r.id} className={cellCls(r, 'pb-cmp-head')}>
                  <div className="pb-cmp-head-top">
                    <Link to={`/resorts/${r.id}`} className="pb-cmp-name">
                      {r.name}
                    </Link>
                    <button
                      type="button"
                      className={`pb-cmp-star ${favIds.has(String(r.id)) ? 'on' : ''}`}
                      onClick={() => toggleFavorite(r.id)}
                      title={favIds.has(String(r.id)) ? 'Удалить из избранного' : 'Добавить в избранное'}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      className="pb-cmp-x"
                      onClick={() => removeResort(r.id)}
                      title="Убрать из сравнения"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="pb-cmp-sub">
                    {extras[r.id]?.maxAltitude != null
                      ? `${extras[r.id].maxAltitude!.toLocaleString('ru-RU')} М`
                      : ''}
                    {r.track_length_km != null ? ` · ${r.track_length_km} КМ` : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* СНЕГ · 48Ч */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">СНЕГ · 48 Ч</div>
              {chosen.map((r) => {
                const cm = snow48(r)
                return (
                  <div key={r.id} className={cellCls(r)}>
                    {cm != null ? (
                      <>
                        <div className="pb-cmp-snow-top">
                          <span className="pb-cmp-snow-val">+{cm} см</span>
                          {cm === maxSnow && maxSnow > 0 && <span className="pb-cmp-max">МАКС</span>}
                        </div>
                        <div className="pb-cmp-bar">
                          <div
                            className="pb-cmp-bar-fill"
                            style={{ width: `${maxSnow ? Math.round((cm / maxSnow) * 100) : 0}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                )
              })}
            </div>

            {/* ВЕРШИНА / НИЗ */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">ВЕРШИНА / НИЗ</div>
              {chosen.map((r) => {
                const x = extras[r.id] ?? {}
                const rainy =
                  x.bottom &&
                  x.bottom.temperature > 0 &&
                  /дождь|ливень|морось/i.test(x.bottom.condition)
                return (
                  <div key={r.id} className={cellCls(r)}>
                    {x.top && x.bottom ? (
                      <span className="pb-cmp-temps">
                        <strong>{Math.round(x.top.temperature)}°</strong>
                        <span className="pb-cmp-sep">/</span>
                        {Math.round(x.bottom.temperature)}°
                        {rainy && <span className="pb-cmp-note warn"> ДОЖДЬ ВНИЗУ</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                )
              })}
            </div>

            {/* ВЕТЕР НАВЕРХУ */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">ВЕТЕР НАВЕРХУ</div>
              {chosen.map((r) => {
                const w = extras[r.id]?.top?.windSpeed
                const danger = w != null && w >= 15
                const calm = w != null && w < 8
                return (
                  <div key={r.id} className={cellCls(r, 'pb-cmp-wind')}>
                    {w != null ? (
                      <>
                        <span className={danger ? 'pb-cmp-wind-val danger' : 'pb-cmp-wind-val'}>
                          {Math.round(w)} м/с
                        </span>
                        <span className="pb-cmp-windbar">
                          <span
                            style={{
                              width: `${Math.min(100, Math.round((w / 20) * 100))}%`,
                              background: danger ? 'var(--danger)' : calm ? 'var(--green)' : 'var(--text-3)',
                            }}
                          />
                        </span>
                        {danger && <span className="pb-cmp-note danger">⚠ РИСК ЗАКРЫТИЙ</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                )
              })}
            </div>

            {/* ТРАССЫ ВСЕГО (реальные данные вместо «подъёмников») */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">ТРАССЫ ВСЕГО</div>
              {chosen.map((r) => {
                const total = totalTrails(r)
                return (
                  <div key={r.id} className={cellCls(r, 'pb-cmp-lifts')}>
                    {total != null ? (
                      <>
                        <span className="pulse-dot pulse-dot-cmp" />
                        <span className="pb-cmp-lifts-val">{total}</span>
                        {r.rating != null && (
                          <span className="pb-cmp-note">★ {r.rating.toFixed(1)}</span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                )
              })}
            </div>

            {/* ТРАССЫ по сложности */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">ТРАССЫ</div>
              {chosen.map((r) => (
                <div key={r.id} className={cellCls(r)}>
                  <TrailPills r={r} />
                </div>
              ))}
            </div>

            {/* СКИПАСС ОТ */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">СКИПАСС ОТ</div>
              {chosen.map((r) => {
                const s = extras[r.id]?.minSkipass
                return (
                  <div key={r.id} className={cellCls(r)}>
                    {s ? `${s.price} ${s.currency}` : '—'}
                  </div>
                )
              })}
            </div>

            {/* ОТЕЛИ */}
            <div className="pb-cmp-row" style={gridStyle}>
              <div className="pb-cmp-label">ОТЕЛИ</div>
              {chosen.map((r) => {
                const h = extras[r.id]?.hotels
                return (
                  <div key={r.id} className={cellCls(r)}>
                    {h && h.count > 0
                      ? h.from != null
                        ? `${h.count} шт. · от ${h.from} ₽`
                        : `${h.count} шт.`
                      : '—'}
                  </div>
                )
              })}
            </div>

            {/* ЛУЧШИЙ ДЕНЬ */}
            <div className="pb-cmp-row pb-cmp-last-row" style={gridStyle}>
              <div className="pb-cmp-label">ЛУЧШИЙ ДЕНЬ</div>
              {chosen.map((r) => {
                const b = bestOf(r)
                const top = b != null && b.score === maxScore && maxScore > 0
                return (
                  <div key={r.id} className={cellCls(r)}>
                    {b ? (
                      <span className={`pb-cmp-bestpill ${top ? 'top' : ''}`}>
                        <span className="pb-cmp-bestday">{b.day}</span>
                        <span className="pb-cmp-bestscore">{b.score}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                )
              })}
            </div>

            <SnowMail
              variant="strip"
              message={`Подпишитесь на алерты по этим ${chosen.length} курортам — письмо придёт за 48 часов до снегопада.`}
            />
          </>
        )}
      </div>
    </div>
  )
}
