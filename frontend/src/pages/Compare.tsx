import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api,
  type Resort,
  type Hotel,
  type AltitudePointWeather,
  type SkipassTariff,
} from '../api/client'
import { weatherIcon } from '../utils/weather'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

type ResortExtras = {
  weather?: AltitudePointWeather
  maxAltitude?: number
  minSkipass?: { price: number; currency: string }
  hotels?: { from: number | null; count: number }
}

type Row = {
  label: string
  render: (r: Resort, x: ResortExtras) => React.ReactNode
  /** Числовое значение для подсветки лучшего; null — не участвует */
  value?: (r: Resort, x: ResortExtras) => number | null
  dir?: 'max' | 'min'
}

export default function Compare() {
  const [searchParams] = useSearchParams()
  const [resorts, setResorts] = useState<Resort[]>([])
  // Стартовый выбор приходит со страницы курортов через ?ids=1,2,3
  const [selected, setSelected] = useState<(number | '')[]>(() => {
    const ids = (searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 3)
    return [ids[0] ?? '', ids[1] ?? '', ids[2] ?? '']
  })
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
          merge(id, { weather: points[0], maxAltitude: points[points.length - 1].altitude_m })
        }
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
      if (id !== '' && !extras[id]) loadExtras(id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (slot: number, value: number | '') => {
    setSelected((prev) => prev.map((v, i) => (i === slot ? value : v)))
    if (value !== '' && !extras[value]) loadExtras(value)
  }

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
    .filter((id): id is number => id !== '')
    .map((id) => resorts.find((r) => r.id === id))
    .filter((r): r is Resort => r != null)

  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>

  const trails = (r: Resort) => (
    <div className="trails-list">
      {r.trails_green != null && <span className="trail">🟢 {r.trails_green}</span>}
      {r.trails_blue != null && <span className="trail">🔵 {r.trails_blue}</span>}
      {r.trails_red != null && <span className="trail">🔴 {r.trails_red}</span>}
      {r.trails_black != null && <span className="trail">⚫ {r.trails_black}</span>}
    </div>
  )

  const totalTrails = (r: Resort) => {
    const parts = [r.trails_green, r.trails_blue, r.trails_red, r.trails_black].filter((n): n is number => n != null)
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null
  }

  const rows: Row[] = [
    {
      label: 'Рейтинг',
      render: (r) => (r.rating != null ? `★ ${r.rating.toFixed(1)} (${r.review_count || 0})` : '—'),
      value: (r) => r.rating ?? null,
      dir: 'max',
    },
    {
      label: 'Протяжённость трасс',
      render: (r) => (r.track_length_km != null ? `${r.track_length_km} км` : '—'),
      value: (r) => r.track_length_km ?? null,
      dir: 'max',
    },
    {
      label: 'Перепад высот',
      render: (r) => (r.elevation_drop_m != null ? `${r.elevation_drop_m} м` : '—'),
      value: (r) => r.elevation_drop_m ?? null,
      dir: 'max',
    },
    {
      label: 'Верхняя точка',
      render: (_, x) => (x.maxAltitude != null ? `${x.maxAltitude} м` : '—'),
      value: (_, x) => x.maxAltitude ?? null,
      dir: 'max',
    },
    {
      label: 'Всего трасс',
      render: (r) => totalTrails(r) ?? '—',
      value: (r) => totalTrails(r),
      dir: 'max',
    },
    { label: 'Трассы', render: trails },
    {
      label: 'Фрирайд',
      render: (r) => (r.freeride_rating != null ? `${r.freeride_rating}/5` : '—'),
      value: (r) => r.freeride_rating ?? null,
      dir: 'max',
    },
    {
      label: 'Погода сейчас',
      render: (_, x) => (x.weather ? `${weatherIcon(x.weather.condition)} ${x.weather.temperature}°C, ${x.weather.condition}` : '—'),
    },
    {
      label: 'Скипасс от',
      render: (_, x) => (x.minSkipass ? `${x.minSkipass.price} ${x.minSkipass.currency}` : '—'),
      value: (_, x) => x.minSkipass?.price ?? null,
      dir: 'min',
    },
    {
      label: 'Отели',
      render: (_, x) =>
        x.hotels && x.hotels.count > 0
          ? x.hotels.from != null ? `${x.hotels.count} шт., от ${x.hotels.from} ₽/ночь` : `${x.hotels.count} шт.`
          : '—',
      value: (_, x) => x.hotels?.from ?? null,
      dir: 'min',
    },
    { label: '', render: (r) => <Link to={`/resorts/${r.id}`}>Подробнее →</Link> },
  ]

  // Лучшее значение в строке: только если заполнено минимум у двух и значения различаются
  const bestId = (row: Row): number | null => {
    if (!row.value || !row.dir) return null
    const vals = chosen
      .map((r) => ({ id: r.id, v: row.value!(r, extras[r.id] ?? {}) }))
      .filter((e): e is { id: number; v: number } => e.v != null)
    if (vals.length < 2) return null
    const best = vals.reduce((a, b) => (row.dir === 'max' ? (b.v > a.v ? b : a) : (b.v < a.v ? b : a)))
    if (vals.every((e) => e.v === best.v)) return null
    return best.id
  }

  return (
    <div className="page">
      <Link to="/resorts" className="back-link">← Назад к курортам</Link>

      <header className="page-header">
        <h1>Сравнение курортов</h1>
        <p>Выберите 2-3 курорта, чтобы сравнить условия катания. Лучшее значение подсвечено.</p>
      </header>

      <div className="compare-selects">
        {selected.map((value, slot) => (
          <select
            key={slot}
            value={value}
            onChange={(e) => pick(slot, e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{slot === 2 ? 'Курорт (необязательно)' : `Курорт ${slot + 1}`}</option>
            {resorts
              .filter((r) => r.id === value || !selected.includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </select>
        ))}
      </div>

      {chosen.length < 2 ? (
        <div className="empty-state"><p>Выберите минимум два курорта для сравнения.</p></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                {chosen.map((r) => (
                  <th key={r.id}>
                    <div className="compare-head">
                      {r.name}
                      <button
                        type="button"
                        className={`btn btn-sm ${favIds.has(String(r.id)) ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => toggleFavorite(r.id)}
                        title={favIds.has(String(r.id)) ? 'Удалить из избранного' : 'Добавить в избранное'}
                      >
                        {favIds.has(String(r.id)) ? '★ В избранном' : '+ В избранное'}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const best = bestId(row)
                return (
                  <tr key={row.label || 'link'}>
                    <td>{row.label}</td>
                    {chosen.map((r) => (
                      <td key={r.id} className={r.id === best ? 'compare-best' : ''} title={r.id === best ? 'Лучшее значение' : undefined}>
                        {row.render(r, extras[r.id] ?? {})}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
