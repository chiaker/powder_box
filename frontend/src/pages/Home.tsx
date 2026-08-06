import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  api,
  type Resort,
  type AltitudePointWeather,
  type AltitudePointDailyForecast,
} from '../api/client'
import { snowSum, dayScores, bestDayIndex, dayShort, dayName } from '../utils/weather'
import HeroSky from '../components/HeroSky'
import SkiIndexChart from '../components/SkiIndexChart'
import SnowMail from '../components/SnowMail'

const ROTATE_MS = 30_000
const MAX_SET = 6

type Wx = { current: AltitudePointWeather[]; daily: AltitudePointDailyForecast[] }

const trailsTotal = (r: Resort) =>
  (r.trails_green ?? 0) + (r.trails_blue ?? 0) + (r.trails_red ?? 0) + (r.trails_black ?? 0)

export default function Home() {
  const { user, token } = useAuth()
  const [resorts, setResorts] = useState<Resort[]>([])
  const [wx, setWx] = useState<Record<number, Wx>>({})
  const [heroIdx, setHeroIdx] = useState(0)
  const [shownId, setShownId] = useState<number | null>(null)
  const wxRef = useRef(wx)
  wxRef.current = wx

  const favKey = (user?.favorite_resorts ?? []).join(',')

  // Набор ротации: избранные пользователя, иначе все курорты по рейтингу
  useEffect(() => {
    let cancelled = false
    const favIds = favKey
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n))
    if (token && favIds.length) {
      Promise.all(favIds.slice(0, MAX_SET).map((id) => api.get<Resort>(`/resorts/${id}`).catch(() => null)))
        .then((rs) => {
          if (!cancelled) setResorts(rs.filter((r): r is Resort => r != null))
        })
    } else {
      api
        .get<Resort[]>('/resorts')
        .then((rs) => {
          if (!cancelled)
            setResorts([...rs].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, MAX_SET))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [token, favKey])

  // Погода по всем курортам набора (нужна списку снегопадов и карточкам), с кэшем
  useEffect(() => {
    resorts.forEach((r) => {
      if (wxRef.current[r.id]) return
      Promise.all([
        api.get<AltitudePointWeather[]>(`/weather/${r.id}/altitudes/current`),
        api.get<AltitudePointDailyForecast[]>(`/weather/${r.id}/altitudes/daily?days=7`),
      ])
        .then(([current, daily]) =>
          setWx((prev) => (prev[r.id] ? prev : { ...prev, [r.id]: { current, daily } })),
        )
        .catch(() => {})
    })
  }, [resorts])

  // Ротация каждые 30 секунд
  useEffect(() => {
    if (resorts.length < 2) return
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % resorts.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [resorts.length])

  // Показываем целевой курорт, как только его данные загружены (иначе держим предыдущий)
  const target = resorts.length ? resorts[heroIdx % resorts.length] : null
  useEffect(() => {
    if (target && wx[target.id]) setShownId(target.id)
    else if (target && shownId == null) setShownId(target.id)
  }, [target, wx, shownId])

  const shown = resorts.find((r) => r.id === shownId) ?? target
  const data = shown ? wx[shown.id] : undefined

  // Точки по высоте: низ → вершина
  const pts = useMemo(
    () => (data ? [...data.current].sort((a, b) => a.altitude_m - b.altitude_m) : []),
    [data],
  )
  const dailyByPoint = useMemo(() => {
    const m: Record<number, AltitudePointDailyForecast> = {}
    data?.daily.forEach((p) => {
      m[p.point_id] = p
    })
    return m
  }, [data])

  const top = pts[pts.length - 1]
  const topDays = top ? dailyByPoint[top.point_id]?.days ?? [] : []
  const scores = dayScores(topDays)
  const best = bestDayIndex(topDays)

  const fmtTime = (ts?: string) =>
    ts ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  // Заголовок в две строки: первое слово тонкое, остальное жирное (как «Шамони / Монблан»)
  const titleParts = shown ? shown.name.split(' ') : []
  const titleHead = titleParts[0] ?? ''
  const titleTail = titleParts.slice(1).join(' ')

  // Топ снегопадов за 5 дней по набору
  const snowTop = useMemo(() => {
    return resorts
      .map((r) => {
        const d = wx[r.id]
        if (!d) return null
        const point = d.daily[d.daily.length - 1]
        if (!point) return null
        const days = point.days
        const b = bestDayIndex(days)
        const s = dayScores(days)
        return { r, cm: snowSum(days, 5), score: s[b] ?? 0, bestDate: days[b]?.date }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.cm - a.cm)
      .slice(0, 3)
  }, [resorts, wx])

  const heroGroup = (p: AltitudePointWeather, idx: number) => {
    const days = dailyByPoint[p.point_id]?.days ?? []
    const snow48 = snowSum(days, 2)
    const rainy = p.temperature > 0 && /дождь|ливень|морось/i.test(p.condition)
    return (
      <div key={p.point_id} className={idx > 0 ? 'pb-alt-group pb-alt-gap' : 'pb-alt-group'}>
        <div className="pb-alt-label">
          {p.point_name.toUpperCase()} — {p.altitude_m.toLocaleString('ru-RU')} М
        </div>
        <div className="pb-alt-value">
          <span className="pb-alt-temp">{Math.round(p.temperature)}°</span>
          {rainy ? (
            <span className="pb-alt-snow pb-alt-rain">дождь</span>
          ) : (
            <span className="pb-alt-snow">+{snow48} см</span>
          )}
        </div>
        {p.windSpeed >= 15 ? (
          <div className="pb-alt-note pb-alt-warn">⚠ ПОРЫВЫ {Math.round(p.windSpeed)} М/С</div>
        ) : (
          <div className="pb-alt-note">{p.condition.toUpperCase()}</div>
        )}
      </div>
    )
  }

  // В hero показываем максимум 3 группы: низ / середина / вершина
  const heroPts =
    pts.length <= 3 ? pts : [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]]

  return (
    <div className="pb-home">
      {/* Высоты и «лучший день» — соседи hero: на десктопе лежат поверх него,
          на мобильном (дизайн 9a) становятся карточками под ним */}
      <div className="pb-hero-block">
      <section className="pb-hero">
        <HeroSky />
        {shown && (
          <div className="pb-hero-inner" key={shown.id}>
          <div className="pb-hero-content">
            <div className="pb-hero-left">
              <div className="pb-hero-kicker">
                {shown.rating != null && <>★ {shown.rating.toFixed(1)} · </>}
                ОБНОВЛЕНО {fmtTime(top?.timestamp) || '—'}
              </div>
              <Link to={`/resorts/${shown.id}`} className="pb-hero-title-link">
                <h1 className="pb-hero-title">
                  {titleHead}
                  {titleTail && (
                    <>
                      <br />
                      <span>{titleTail}</span>
                    </>
                  )}
                </h1>
              </Link>
              <div className="pb-hero-status">
                <span className="pulse-dot pulse-dot-green" />
                {trailsTotal(shown) > 0 ? `${trailsTotal(shown)} трасс` : 'открыт'}
                {top ? ` · ${top.condition.toLowerCase()}` : ''}
              </div>
            </div>
          </div>
          </div>
        )}
      </section>
      {shown && (
        <div className="pb-hero-side" key={`side-${shown.id}`}>
          <div className="pb-hero-right">{[...heroPts].reverse().map(heroGroup)}</div>
          {best >= 0 && topDays[best] && (
            <div className="pb-bestday">
              <span className="pb-bestday-label">ЛУЧШИЙ ДЕНЬ</span>
              <span className="pb-bestday-day">{dayName(topDays[best].date)}</span>
              <span className="pb-bestday-score">
                {scores[best]}
                <span className="pb-bestday-of">ИЗ 10</span>
              </span>
              <span className="pb-bestday-note">
                {topDays[best].snowfall > 0 ? `+${Math.round(topDays[best].snowfall)} см снега · ` : ''}
                ветер {Math.round(topDays[best].windSpeed)} м/с · {topDays[best].condition.toLowerCase()}
              </span>
            </div>
          )}
        </div>
      )}
      </div>

      <div className="pb-wrap">
      <div className="pb-strip">
        <div className="pb-strip-col">
          <div className="mono-label pb-strip-label">ИНДЕКС КАТАНИЯ · 7 ДНЕЙ</div>
          {topDays.length > 0 ? <SkiIndexChart days={topDays} /> : <div className="pb-strip-empty">нет прогноза</div>}
        </div>
        <div className="pb-strip-col">
          <div className="mono-label pb-strip-label">СНЕГОПАДЫ · 5 ДНЕЙ</div>
          <div className="pb-snowlist">
            {snowTop.map(({ r, cm, score, bestDate }) => {
              const today = bestDate && dayName(bestDate) === 'Сегодня'
              return (
                <div key={r.id} className="pb-snowlist-row">
                  <Link to={`/resorts/${r.id}`} className="pb-snowlist-name">{r.name}</Link>
                  <span className="pb-snowlist-cm">+{cm} см</span>
                  <span className={`pb-snowlist-score ${today ? 'today' : ''}`}>
                    {score} {bestDate ? (today ? 'СЕГОДНЯ' : dayShort(bestDate)) : ''}
                  </span>
                </div>
              )
            })}
            {snowTop.length === 0 && <div className="pb-strip-empty">загрузка…</div>}
          </div>
        </div>
        <SnowMail variant="plate" />
      </div>

      <div className="pb-myresorts">
        <div className="pb-myresorts-head">
          <h3>{token && favKey ? 'Мои курорты' : 'Топ курортов'}</h3>
          <span className="pb-myresorts-count">{resorts.length} В СПИСКЕ</span>
          <Link to={`/compare?ids=${resorts.map((r) => r.id).join(',')}`} className="pb-myresorts-cta">
            Сравнить все →
          </Link>
        </div>
        <div className="pb-myresorts-grid">
          {resorts.map((r) => {
            const d = wx[r.id]
            const point = d?.daily[d.daily.length - 1]
            const days = point?.days ?? []
            const b = bestDayIndex(days)
            const s = dayScores(days)
            const today = b >= 0 && dayName(days[b].date) === 'Сегодня'
            return (
              <Link
                key={r.id}
                to={`/resorts/${r.id}`}
                className={`pb-resort-card ${r.id === shown?.id ? 'active' : ''}`}
              >
                <div className="pb-resort-card-top">
                  <span className="pb-resort-card-name">{r.name}</span>
                  <span className="pb-resort-card-meta">
                    {point ? `${point.altitude_m.toLocaleString('ru-RU')} М` : r.rating != null ? `★ ${r.rating.toFixed(1)}` : ''}
                  </span>
                </div>
                <div className="pb-resort-card-snow">{days.length ? `+${snowSum(days, 3)} см` : '—'}</div>
                <div className={`pb-resort-card-best ${today ? 'today' : ''}`}>
                  {b >= 0 ? `ЛУЧШИЙ ДЕНЬ · ${today ? 'СЕГОДНЯ' : dayShort(days[b].date)} ${s[b]}` : 'НЕТ ПРОГНОЗА'}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}
