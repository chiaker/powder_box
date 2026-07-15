import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api,
  type Resort,
  type AltitudePointWeather,
  type SkipassTariff,
} from '../api/client'
import { weatherIcon } from '../utils/weather'

type ResortExtras = {
  weather?: AltitudePointWeather
  minSkipass?: { price: number; currency: string }
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

  useEffect(() => {
    api.get<Resort[]>('/resorts')
      .then(setResorts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadExtras = (id: number) => {
    // Догружаем погоду и мин. цену скипасса один раз на курорт
    api.get<AltitudePointWeather[]>(`/weather/${id}/altitudes/current`)
      .then((points) => {
        if (points.length) {
          setExtras((prev) => ({ ...prev, [id]: { ...prev[id], weather: points[0] } }))
        }
      })
      .catch(() => {})
    api.get<SkipassTariff[]>(`/skipasses?resort_id=${id}`)
      .then((tariffs) => {
        const active = tariffs.filter((t) => t.is_active)
        if (active.length) {
          const cheapest = active.reduce((a, b) => (a.price <= b.price ? a : b))
          setExtras((prev) => ({
            ...prev,
            [id]: { ...prev[id], minSkipass: { price: cheapest.price, currency: cheapest.currency } },
          }))
        }
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

  const chosen = selected.filter((id): id is number => id !== '').map((id) => resorts.find((r) => r.id === id)).filter((r): r is Resort => r != null)

  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>

  const trails = (r: Resort) => (
    <div className="trails-list">
      {r.trails_green != null && <span className="trail">🟢 {r.trails_green}</span>}
      {r.trails_blue != null && <span className="trail">🔵 {r.trails_blue}</span>}
      {r.trails_red != null && <span className="trail">🔴 {r.trails_red}</span>}
      {r.trails_black != null && <span className="trail">⚫ {r.trails_black}</span>}
    </div>
  )

  const rows: [string, (r: Resort) => React.ReactNode][] = [
    ['Рейтинг', (r) => (r.rating != null ? `★ ${r.rating.toFixed(1)} (${r.review_count || 0})` : '—')],
    ['Протяжённость трасс', (r) => (r.track_length_km != null ? `${r.track_length_km} км` : '—')],
    ['Перепад высот', (r) => (r.elevation_drop_m != null ? `${r.elevation_drop_m} м` : '—')],
    ['Трассы', trails],
    ['Фрирайд', (r) => (r.freeride_rating != null ? `${r.freeride_rating}/5` : '—')],
    ['Погода сейчас', (r) => {
      const w = extras[r.id]?.weather
      return w ? `${weatherIcon(w.condition)} ${w.temperature}°C, ${w.condition}` : '—'
    }],
    ['Скипасс от', (r) => {
      const s = extras[r.id]?.minSkipass
      return s ? `${s.price} ${s.currency}` : '—'
    }],
    ['', (r) => <Link to={`/resorts/${r.id}`}>Подробнее →</Link>],
  ]

  return (
    <div className="page">
      <header className="page-header">
        <h1>Сравнение курортов</h1>
        <p>Выберите 2-3 курорта, чтобы сравнить условия катания</p>
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
                {chosen.map((r) => <th key={r.id}>{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, render]) => (
                <tr key={label || 'link'}>
                  <td>{label}</td>
                  {chosen.map((r) => <td key={r.id}>{render(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
