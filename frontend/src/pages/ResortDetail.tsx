import { FormEvent, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  api,
  imageUrl,
  IMG_PLACEHOLDER,
  type Resort,
  type ResortReview,
  type UserProfile,
  type AltitudePoint,
  type AltitudePointWeather,
  type AltitudePointHourlyForecast,
  type AltitudePointDailyForecast,
  type SkipassTariff,
  type SkipassPriceResponse,
  type Hotel,
} from '../api/client'
import { weatherIcon, snowSum, dayScores, bestDayIndex, dayName } from '../utils/weather'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHead from '../components/PageHead'
import SnowMail from '../components/SnowMail'

// three.js/leaflet тянутся только при открытии страницы курорта с картой
const ResortMap3D = lazy(() => import('../components/ResortMap3D'))
const ResortMap2D = lazy(() => import('../components/ResortMap2D'))

type MapMode = 'points' | 'solid' | 'flat' | 'original'
type WeatherMode = 'current' | 'today_hourly' | 'tomorrow_hourly' | 'week'

/** Цвет статус-точки высоты по ветру и условиям */
const pointStatus = (p: AltitudePointWeather): 'ok' | 'warn' | 'danger' => {
  if (p.windSpeed >= 15 || /гроза|шторм/i.test(p.condition)) return 'danger'
  if (p.windSpeed >= 8) return 'warn'
  return 'ok'
}

export default function ResortDetail() {
  const { id } = useParams<{ id: string }>()
  const [resort, setResort] = useState<Resort | null>(null)
  const [reviews, setReviews] = useState<ResortReview[]>([])
  // Текущая погода по высотам — используется и в шапке, и в сайдбаре, и в блоке «Сейчас»
  const [nowPoints, setNowPoints] = useState<AltitudePointWeather[]>([])
  // Недельный прогноз по всем точкам — сайдбар «снег по высотам» и режим «Неделя»
  const [dailyPoints, setDailyPoints] = useState<AltitudePointDailyForecast[]>([])
  const [altitudeHourly, setAltitudeHourly] = useState<AltitudePointHourlyForecast[]>([])
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('current')
  const [weatherLoading, setWeatherLoading] = useState(false)
  // Точки высот — центр 3D-карты
  const [altPoints, setAltPoints] = useState<AltitudePoint[]>([])
  // Режим карты запоминается между страницами и заходами
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    const saved = localStorage.getItem('map-mode') as MapMode | null
    return saved && ['points', 'solid', 'flat', 'original'].includes(saved) ? saved : 'points'
  })
  const [mapLightbox, setMapLightbox] = useState(false)

  const changeMapMode = (mode: MapMode) => {
    setMapMode(mode)
    localStorage.setItem('map-mode', mode)
  }

  const [skipassTariffs, setSkipassTariffs] = useState<SkipassTariff[]>([])
  const [skipassPrice, setSkipassPrice] = useState<SkipassPriceResponse | null>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [ageCategory, setAgeCategory] = useState<'child' | 'teen' | 'adult' | 'senior'>('adult')
  const [accessType, setAccessType] = useState<'day' | 'evening' | 'full'>('day')
  const [durationDays, setDurationDays] = useState(1)
  const [fastTrack, setFastTrack] = useState(false)
  const [seasonDate, setSeasonDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewAuthors, setReviewAuthors] = useState<Record<number, string>>({})
  const { user, token, refreshProfile } = useAuth()
  const toast = useToast()

  const resortId = useMemo(() => {
    if (!id) return null
    const parsed = Number(id)
    return Number.isNaN(parsed) ? null : parsed
  }, [id])

  const currentUserId = useMemo(() => {
    const asNumber = Number(user?.user_id)
    return Number.isNaN(asNumber) ? null : asNumber
  }, [user?.user_id])

  const userReview = useMemo(
    () => reviews.find((review) => currentUserId != null && review.user_id === currentUserId),
    [reviews, currentUserId]
  )

  const loadResortData = useCallback(async () => {
    if (resortId == null) {
      setError('Неверный ID курорта')
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const [r, rv, sp, ht] = await Promise.all([
        api.get<Resort>(`/resorts/${resortId}`),
        api.get<ResortReview[]>(`/resorts/${resortId}/reviews`).catch(() => []),
        api.get<SkipassTariff[]>(`/skipasses?resort_id=${resortId}`).catch(() => []),
        api.get<Hotel[]>(`/hotels?resort_id=${resortId}`).catch(() => []),
      ])
      setResort(r)
      setReviews(rv)
      setSkipassTariffs(sp)
      setHotels(ht)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки курорта')
    } finally {
      setLoading(false)
    }
  }, [resortId])

  useEffect(() => {
    void loadResortData()
  }, [loadResortData])

  useEffect(() => {
    if (!userReview) return
    setReviewRating(userReview.rating)
    setReviewText(userReview.review_text || '')
  }, [userReview])

  useEffect(() => {
    let cancelled = false
    const loadAuthors = async () => {
      if (!token || reviews.length === 0) {
        setReviewAuthors({})
        return
      }

      const uniqueUserIds = Array.from(new Set(reviews.map((r) => r.user_id)))
      const entries = await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const profile = await api.get<UserProfile>(`/users/${uid}`)
            return [uid, profile.nickname?.trim() || `Пользователь #${uid}`] as const
          } catch {
            return [uid, `Пользователь #${uid}`] as const
          }
        })
      )
      if (cancelled) return
      setReviewAuthors(
        entries.reduce<Record<number, string>>((acc, [uid, name]) => {
          acc[uid] = name
          return acc
        }, {})
      )
    }

    void loadAuthors()
    return () => {
      cancelled = true
    }
  }, [reviews, token])

  const toggleFavorite = async () => {
    if (!token || !resort) return
    const favs = user?.favorite_resorts ?? []
    const idStr = String(resort.id)
    const next = favs.includes(idStr)
      ? favs.filter((x) => x !== idStr)
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

  const isFavorite = user?.favorite_resorts?.includes(String(resort?.id))

  // Обновление после действий с отзывом: без setLoading, чтобы страница
  // не размонтировалась и скролл не улетал наверх
  const refreshReviews = async () => {
    if (resortId == null) return
    const [r, rv] = await Promise.all([
      api.get<Resort>(`/resorts/${resortId}`), // обновлённый рейтинг курорта
      api.get<ResortReview[]>(`/resorts/${resortId}/reviews`).catch(() => []),
    ])
    setResort(r)
    setReviews(rv)
  }

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.show('Войдите, чтобы оставить отзыв', 'info')
      return
    }
    if (resortId == null) return
    setSubmittingReview(true)
    try {
      await api.post<ResortReview>(`/resorts/${resortId}/reviews`, {
        rating: reviewRating,
        review_text: reviewText.trim() || undefined,
      })
      await refreshReviews()
      toast.show(userReview ? 'Отзыв обновлен' : 'Отзыв добавлен', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Не удалось сохранить отзыв', 'error')
    } finally {
      setSubmittingReview(false)
    }
  }

  const handleDeleteReview = async () => {
    if (!token || !userReview || resortId == null) return
    try {
      await api.delete<void>(`/resorts/${resortId}/reviews/${userReview.id}`)
      setReviewRating(5)
      setReviewText('')
      await refreshReviews()
      toast.show('Отзыв удален', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Не удалось удалить отзыв', 'error')
    }
  }

  useEffect(() => {
    if (resortId == null) return
    void api
      .get<SkipassPriceResponse>(
        `/skipasses/resort/${resortId}/price?duration_days=${durationDays}&age_group=${ageCategory}&time_type=${accessType}&fast_track=${fastTrack}&season_date=${seasonDate}`
      )
      .then(setSkipassPrice)
      .catch(() => setSkipassPrice(null))
  }, [resortId, durationDays, ageCategory, accessType, fastTrack, seasonDate, skipassTariffs.length])

  useEffect(() => {
    if (skipassTariffs.length === 0) return
    const inSeason = skipassTariffs.find(
      (t) => seasonDate >= t.season_start && seasonDate <= t.season_end && t.is_active
    )
    if (inSeason) {
      setAgeCategory(inSeason.age_category)
      setAccessType(inSeason.access_type)
      setDurationDays(inSeason.duration_days)
      setFastTrack(inSeason.is_fast_track)
      return
    }
    const firstActive = skipassTariffs.find((t) => t.is_active)
    if (firstActive) {
      setSeasonDate(firstActive.season_start)
      setAgeCategory(firstActive.age_category)
      setAccessType(firstActive.access_type)
      setDurationDays(firstActive.duration_days)
      setFastTrack(firstActive.is_fast_track)
    }
  }, [skipassTariffs])

  // Погода по высотам: текущая и недельная тянутся один раз на курорт
  useEffect(() => {
    if (resortId == null) return
    void api
      .get<AltitudePointWeather[]>(`/weather/${resortId}/altitudes/current`)
      .then(setNowPoints)
      .catch(() => setNowPoints([]))
    void api
      .get<AltitudePointDailyForecast[]>(`/weather/${resortId}/altitudes/daily?days=7`)
      .then(setDailyPoints)
      .catch(() => setDailyPoints([]))
  }, [resortId])

  // Почасовой прогноз — только когда его запросили
  useEffect(() => {
    if (resortId == null) return
    if (weatherMode !== 'today_hourly' && weatherMode !== 'tomorrow_hourly') return
    const day = weatherMode === 'today_hourly' ? 'today' : 'tomorrow'
    setWeatherLoading(true)
    void api
      .get<AltitudePointHourlyForecast[]>(`/weather/${resortId}/altitudes/hourly?day=${day}`)
      .then(setAltitudeHourly)
      .catch(() => setAltitudeHourly([]))
      .finally(() => setWeatherLoading(false))
  }, [resortId, weatherMode])

  // Прогноз самой высокой точки — паудер-бейдж и «лучший день»
  const powderDaily = useMemo(
    () => (dailyPoints.length ? dailyPoints[dailyPoints.length - 1].days : []),
    [dailyPoints]
  )
  const powderCm = useMemo(() => snowSum(powderDaily, 3), [powderDaily])
  const bestDay = useMemo(() => bestDayIndex(powderDaily), [powderDaily])
  const bestScore = useMemo(() => {
    const s = dayScores(powderDaily)
    return bestDay >= 0 ? s[bestDay] : null
  }, [powderDaily, bestDay])

  useEffect(() => {
    if (resortId == null) return
    void api
      .get<AltitudePoint[]>(`/weather/${resortId}/altitude-points`)
      .then((pts) => setAltPoints(pts.filter((p) => p.is_active)))
      .catch(() => setAltPoints([]))
  }, [resortId])

  const mapPoints = useMemo(
    () => altPoints.map((p) => ({ lat: p.latitude, lng: p.longitude })),
    [altPoints]
  )

  // Снег по каждой высотной точке за 3 дня — сайдбар
  const snowByPoint = useMemo(
    () =>
      dailyPoints.map((p) => ({
        id: p.point_id,
        name: p.point_name,
        altitude: p.altitude_m,
        cm: snowSum(p.days, 3),
      })),
    [dailyPoints]
  )
  const maxSnowPoint = Math.max(...snowByPoint.map((p) => p.cm), 0)

  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>
  if (error || !resort) return <div className="page"><div className="error">{error || 'Курорт не найден'}</div></div>

  const trailsTotal =
    (resort.trails_green ?? 0) + (resort.trails_blue ?? 0) + (resort.trails_red ?? 0) + (resort.trails_black ?? 0)

  // Три высоты для шапки: низ / середина / вершина
  const sorted = [...nowPoints].sort((a, b) => a.altitude_m - b.altitude_m)
  const headPts =
    sorted.length <= 3 ? sorted : [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]]
  const headLabels = ['НИЗ', 'СЕРЕДИНА', 'ВЕРШИНА']
  const updated = sorted.length
    ? new Date(sorted[sorted.length - 1].timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : ''

  const effMode: MapMode = mapMode === 'original' && !resort.trail_map_url ? 'points' : mapMode

  const snow48ByPoint = (pointId: number) => {
    const p = dailyPoints.find((d) => d.point_id === pointId)
    return p ? snowSum(p.days, 2) : null
  }

  return (
    <div className="pb-resort">
      <PageHead
        kicker={updated ? `ОБНОВЛЕНО ${updated}` : undefined}
        title={resort.name}
        right={
          <div className="pb-rd-metrics">
            {[...headPts].reverse().map((p, i) => {
              const label = headLabels[headPts.length - 1 - i] ?? p.point_name.toUpperCase()
              const cm = snow48ByPoint(p.point_id)
              const rainy = p.temperature > 0 && /дождь|ливень|морось/i.test(p.condition)
              return (
                <div key={p.point_id} className="pb-rd-metric">
                  <div className="pb-rd-metric-label">{label}</div>
                  <div className="pb-rd-metric-value">
                    {Math.round(p.temperature)}°{' '}
                    {rainy ? (
                      <span className="pb-rd-rain">дождь</span>
                    ) : (
                      cm != null && <span className="pb-rd-snow">+{cm} см</span>
                    )}
                  </div>
                </div>
              )
            })}
            {bestDay >= 0 && (
              <div className="pb-rd-metric pb-rd-best">
                <div className="pb-rd-metric-label">ЛУЧШИЙ ДЕНЬ</div>
                <div className="pb-rd-metric-value pb-rd-best-value">
                  {dayName(powderDaily[bestDay].date)} · {bestScore}
                </div>
              </div>
            )}
          </div>
        }
      />

      <div className="pb-page">
        <div className="pb-rd-grid">
          {/* Левая колонка: карта трасс */}
          <div className="pb-rd-main">
            <div className="pb-rd-maphead">
              <h3>Карта трасс</h3>
              <span className="pb-rd-maphead-count">
                {trailsTotal > 0 ? `${trailsTotal} ТРАСС` : ''}
                {resort.track_length_km != null ? ` · ${resort.track_length_km} КМ` : ''}
              </span>
              <div className="pb-rd-legend">
                <span><i className="pb-leg pb-leg-green" />Зелёные</span>
                <span><i className="pb-leg pb-leg-blue" />Синие</span>
                <span><i className="pb-leg pb-leg-red" />Красные</span>
                <span><i className="pb-leg pb-leg-black" />Чёрные</span>
              </div>
            </div>

            {mapPoints.length === 0 ? (
              <div className="pb-rd-mapbox-static">
                <span>карта появится, когда админ добавит точки высот</span>
              </div>
            ) : effMode === 'original' && resort.trail_map_url ? (
              <div className="pb-rd-mapbox-static">
                <img
                  src={imageUrl(resort.trail_map_url)}
                  alt={`Схема трасс: ${resort.name}`}
                  className="trail-map-img"
                  onClick={() => setMapLightbox(true)}
                  title="Нажмите для увеличения"
                />
              </div>
            ) : (
              <div className="pb-rd-mapbox">
                <Suspense fallback={<div className="loading">Загрузка карты...</div>}>
                  {(effMode === 'points' || effMode === 'solid') && resortId != null && (
                    <ResortMap3D resortId={resortId} points={mapPoints} variant={effMode} />
                  )}
                  {effMode === 'flat' && <ResortMap2D points={mapPoints} />}
                </Suspense>
              </div>
            )}

            {mapLightbox && resort.trail_map_url && (
              <div className="hotel-lightbox-overlay" onClick={() => setMapLightbox(false)}>
                <img src={imageUrl(resort.trail_map_url)} alt={`Схема трасс: ${resort.name}`} className="hotel-lightbox-img" />
                <button type="button" className="hotel-lightbox-close" onClick={() => setMapLightbox(false)}>✕</button>
              </div>
            )}

            {mapPoints.length > 0 && (
              <div className="pb-pills">
                <button type="button" className={`pb-pill ${effMode === 'points' ? 'active' : ''}`} onClick={() => changeMapMode('points')}>Точечная</button>
                <button type="button" className={`pb-pill ${effMode === 'solid' ? 'active' : ''}`} onClick={() => changeMapMode('solid')}>3D</button>
                <button type="button" className={`pb-pill ${effMode === 'flat' ? 'active' : ''}`} onClick={() => changeMapMode('flat')}>2D</button>
                {resort.trail_map_url && (
                  <button type="button" className={`pb-pill ${effMode === 'original' ? 'active' : ''}`} onClick={() => changeMapMode('original')}>Схема курорта</button>
                )}
              </div>
            )}

            {resort.description && <p className="pb-rd-desc">{resort.description}</p>}

            <div className="pb-rd-actions">
              {resort.rating != null && (
                <span className="pb-rd-rating">★ {resort.rating.toFixed(1)} · {resort.review_count || 0} отзывов</span>
              )}
              {powderCm >= 1 && (
                <span className="pb-rd-powder" title="Прогноз снегопадов на ближайшие 3 дня">❄ {powderCm} см за 3 дня</span>
              )}
              {token && (
                <button
                  type="button"
                  className={`btn btn-sm ${isFavorite ? 'btn-primary' : 'btn-outline'}`}
                  onClick={toggleFavorite}
                >
                  {isFavorite ? '★ В избранном' : '+ В избранное'}
                </button>
              )}
              <Link to={`/compare?ids=${resort.id}`} className="btn btn-sm btn-outline">Сравнить →</Link>
            </div>
          </div>

          {/* Правый сайдбар */}
          <aside className="pb-rd-side">
            <div className="pb-rd-block">
              <div className="mono-label pb-rd-block-label">ВЫСОТЫ · СЕЙЧАС</div>
              {sorted.length === 0 ? (
                <div className="pb-strip-empty">нет данных</div>
              ) : (
                <div className="pb-rd-list">
                  {[...sorted].reverse().map((p, i) => {
                    const st = pointStatus(p)
                    return (
                      <div key={p.point_id} className="pb-rd-list-row">
                        <span
                          className={`pb-status-dot pb-status-${st}`}
                          style={{ animationDelay: `${i * 0.6}s` }}
                        />
                        <span className="pb-rd-list-name">{p.point_name}</span>
                        <span className={`pb-rd-list-meta ${st === 'danger' ? 'danger' : st === 'warn' ? 'warn' : ''}`}>
                          {Math.round(p.temperature)}° · {Math.round(p.windSpeed)} м/с
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="pb-rd-block">
              <div className="mono-label pb-rd-block-label">СНЕГ ПО ВЫСОТАМ · 3 ДНЯ</div>
              {snowByPoint.length === 0 ? (
                <div className="pb-strip-empty">нет прогноза</div>
              ) : (
                <div className="pb-rd-bars">
                  {[...snowByPoint].reverse().map((p) => (
                    <div key={p.id} className="pb-rd-bar-row">
                      <span className="pb-rd-bar-name">{p.name}</span>
                      <div className="pb-rd-bar">
                        <div
                          className="pb-rd-bar-fill"
                          style={{
                            width: `${maxSnowPoint ? Math.round((p.cm / maxSnowPoint) * 100) : 0}%`,
                            background: p.cm >= 10 ? 'var(--green)' : p.cm >= 3 ? 'var(--accent)' : 'var(--warn)',
                          }}
                        />
                      </div>
                      <span className="pb-rd-bar-val">{p.cm} СМ</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SnowMail
              variant="plate"
              message={
                <>
                  <strong>{resort.name} в вашем списке.</strong> Напишем за 48 часов до снегопада.
                </>
              }
            />
          </aside>
        </div>

        {/* Погода по высотам */}
        <section className="pb-section">
          <div className="pb-section-head">
            <h3>Погода по высотам</h3>
            <div className="pb-pills pb-pills-right">
              <button type="button" className={`pb-pill ${weatherMode === 'current' ? 'active' : ''}`} onClick={() => setWeatherMode('current')}>Сейчас</button>
              <button type="button" className={`pb-pill ${weatherMode === 'today_hourly' ? 'active' : ''}`} onClick={() => setWeatherMode('today_hourly')}>Сегодня по часам</button>
              <button type="button" className={`pb-pill ${weatherMode === 'tomorrow_hourly' ? 'active' : ''}`} onClick={() => setWeatherMode('tomorrow_hourly')}>Завтра по часам</button>
              <button type="button" className={`pb-pill ${weatherMode === 'week' ? 'active' : ''}`} onClick={() => setWeatherMode('week')}>Неделя</button>
            </div>
          </div>

          {weatherLoading && <div className="loading">Загрузка прогноза...</div>}

          {!weatherLoading && weatherMode === 'current' && (
            nowPoints.length === 0 ? (
              <div className="empty-state"><p>Точки высот еще не добавлены.</p></div>
            ) : (
              <div className="altitude-weather-grid">
                {nowPoints.slice(0, 4).map((point) => (
                  <article key={point.point_id} className="altitude-weather-card">
                    <div className="altitude-weather-header">
                      <strong>{point.point_name}</strong>
                      <span>{point.altitude_m} м</span>
                    </div>
                    <div className="altitude-weather-values">
                      <div><span className="weather-value">{point.temperature}°C</span><span className="weather-label">Температура</span></div>
                      <div><span className="weather-value">{point.windSpeed} м/с</span><span className="weather-label">Ветер</span></div>
                      <div><span className="weather-value">{point.humidity}%</span><span className="weather-label">Влажность</span></div>
                    </div>
                    <p className="weather-current-condition">
                      <span className="weather-icon-lg">{weatherIcon(point.condition)}</span>
                      <span className="weather-label">{point.condition}</span>
                    </p>
                  </article>
                ))}
              </div>
            )
          )}

          {!weatherLoading && (weatherMode === 'today_hourly' || weatherMode === 'tomorrow_hourly') && (
            altitudeHourly.length === 0 ? (
              <div className="empty-state"><p>Почасовой прогноз недоступен.</p></div>
            ) : (
              <div className="altitude-forecast-list">
                {altitudeHourly.slice(0, 4).map((point) => (
                  <article key={point.point_id} className="altitude-weather-card">
                    <div className="altitude-weather-header">
                      <strong>{point.point_name}</strong>
                      <span>{point.altitude_m} м</span>
                    </div>
                    <div className="hourly-grid">
                      {point.hours.map((h) => (
                        <div key={`${point.point_id}-${h.timestamp}`} className="hourly-item">
                          <span>{new Date(h.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                          <strong>{weatherIcon(h.condition)} {h.temperature}°C</strong>
                          <span className="weather-label">Осадки: {h.precipitation} мм</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )
          )}

          {!weatherLoading && weatherMode === 'week' && (
            dailyPoints.length === 0 ? (
              <div className="empty-state"><p>Недельный прогноз недоступен.</p></div>
            ) : (
              <div className="altitude-forecast-list">
                {dailyPoints.slice(0, 4).map((point) => (
                  <article key={point.point_id} className="altitude-weather-card">
                    <div className="altitude-weather-header">
                      <strong>{point.point_name}</strong>
                      <span>{point.altitude_m} м</span>
                    </div>
                    <div className="daily-grid">
                      {point.days.map((d, i) => (
                        <div key={`${point.point_id}-${d.date}`} className={`daily-item ${i === bestDay ? 'daily-item-best' : ''}`}>
                          <span>{new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          <strong>{weatherIcon(d.condition)} {d.minTemperature}° / {d.maxTemperature}°</strong>
                          <span className="weather-label">{d.condition}</span>
                          {d.snowfall >= 0.5
                            ? <span>❄ Снег: {d.snowfall} см</span>
                            : <span>Осадки: {d.precipitation} мм</span>}
                          {i === bestDay && <span className="best-day-label">🏂 Лучший день</span>}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
        </section>

        {/* Скипассы */}
        <section className="pb-section">
          <div className="pb-section-head"><h3>Скипассы</h3></div>
          <div className="skipass-controls">
            <label>
              Дата катания
              <input type="date" value={seasonDate} onChange={(e) => setSeasonDate(e.target.value)} />
            </label>
            <label>
              Возраст
              <select value={ageCategory} onChange={(e) => setAgeCategory(e.target.value as typeof ageCategory)}>
                <option value="child">Ребенок</option>
                <option value="teen">Подросток</option>
                <option value="adult">Взрослый</option>
                <option value="senior">Пенсионер</option>
              </select>
            </label>
            <label>
              Тип
              <select value={accessType} onChange={(e) => setAccessType(e.target.value as typeof accessType)}>
                <option value="day">Дневной</option>
                <option value="evening">Вечерний</option>
                <option value="full">Полный день</option>
              </select>
            </label>
            <label>
              Дней
              <input type="number" min={1} max={30} value={durationDays} onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="skipass-check">
              <input type="checkbox" checked={fastTrack} onChange={(e) => setFastTrack(e.target.checked)} />
              Fast Track
            </label>
          </div>

          <div className="skipass-price-box">
            {skipassPrice && skipassPrice.price > 0 ? (
              <p>
                Итоговая цена: <strong>{skipassPrice.price} {skipassPrice.currency}</strong>
                {skipassPrice.season_name ? ` (${skipassPrice.season_name})` : ''}
              </p>
            ) : (
              <p>Под этот набор условий активный тариф не найден.</p>
            )}
          </div>

          {skipassTariffs.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Сезон</th>
                    <th>Категория</th>
                    <th>Тип</th>
                    <th>Дней</th>
                    <th>Fast</th>
                    <th>Цена</th>
                  </tr>
                </thead>
                <tbody>
                  {skipassTariffs
                    .filter((t) => t.is_active)
                    .map((tariff) => (
                      <tr key={tariff.id}>
                        <td>{tariff.season_name}</td>
                        <td>{tariff.age_category}</td>
                        <td>{tariff.access_type}</td>
                        <td>{tariff.duration_days}</td>
                        <td>{tariff.is_fast_track ? 'Да' : 'Нет'}</td>
                        <td>{tariff.price} {tariff.currency}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {hotels.length > 0 && (
          <section className="pb-section">
            <div className="pb-section-head"><h3>Отели рядом</h3></div>
            <div className="hotel-grid">
              {hotels.map((h) => (
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
                    {h.description && <p className="hotel-card-desc">{h.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="pb-section resort-reviews">
          <div className="pb-section-head"><h3>Отзывы и оценки</h3></div>
          <p className="section-hint">
            Средняя оценка рассчитывается на основе отзывов пользователей.
          </p>
          {token ? (
            <form className="review-form" onSubmit={handleReviewSubmit}>
              <label>Ваша оценка</label>
              <div className="review-rating-picker" role="radiogroup" aria-label="Оценка курорта">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`star-btn ${value <= (hoverRating || reviewRating) ? 'active' : ''}`}
                    onClick={() => setReviewRating(value)}
                    onMouseEnter={() => setHoverRating(value)}
                    onMouseLeave={() => setHoverRating(0)}
                    disabled={submittingReview}
                    aria-pressed={value === reviewRating}
                    title={`Оценка ${value} из 5`}
                  >
                    ★
                  </button>
                ))}
                <span className="review-rating-value">{reviewRating}/5</span>
              </div>

              <label htmlFor="review-text">Комментарий</label>
              <textarea
                id="review-text"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Опишите впечатления о трассах, сервисе и условиях катания"
                rows={4}
                maxLength={3000}
                disabled={submittingReview}
              />

              <div className="review-form-actions">
                <button type="submit" className="btn btn-primary" disabled={submittingReview}>
                  {submittingReview ? 'Сохранение...' : userReview ? 'Обновить отзыв' : 'Оставить отзыв'}
                </button>
                {userReview && (
                  <button type="button" className="btn btn-outline" onClick={handleDeleteReview}>
                    Удалить мой отзыв
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p className="section-hint">
              <Link to="/login">Войдите</Link>, чтобы поставить оценку и оставить отзыв.
            </p>
          )}

          <div className="reviews-list">
            {reviews.length === 0 ? (
              <div className="empty-state"><p>Пока нет отзывов. Будьте первым!</p></div>
            ) : (
              reviews.map((review) => (
                <article key={review.id} className="review-card">
                  <div className="review-header">
                    <span>
                      <strong>{reviewAuthors[review.user_id] || `Пользователь #${review.user_id}`}</strong>
                      {review.updated_at && (
                        <span className="review-date">
                          {new Date(review.updated_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                    </span>
                    <span className="rating-stars" aria-label={`Оценка: ${review.rating} из 5`}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <span key={value} className={value <= Math.round(review.rating) ? 'star-filled' : 'star-empty'}>
                          ★
                        </span>
                      ))}
                    </span>
                  </div>
                  {review.review_text && <p>{review.review_text}</p>}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
