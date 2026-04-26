import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  api,
  imageUrl,
  IMG_PLACEHOLDER,
  type Resort,
  type ResortReview,
  type UserProfile,
  type AltitudePointWeather,
  type AltitudePointHourlyForecast,
  type AltitudePointDailyForecast,
  type SkipassTariff,
  type SkipassPriceResponse,
  type Hotel,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800'
type WeatherMode = 'current' | 'today_hourly' | 'tomorrow_hourly' | 'week'

export default function ResortDetail() {
  const { id } = useParams<{ id: string }>()
  const [resort, setResort] = useState<Resort | null>(null)
  const [reviews, setReviews] = useState<ResortReview[]>([])
  const [altitudeWeather, setAltitudeWeather] = useState<AltitudePointWeather[]>([])
  const [altitudeHourly, setAltitudeHourly] = useState<AltitudePointHourlyForecast[]>([])
  const [altitudeDaily, setAltitudeDaily] = useState<AltitudePointDailyForecast[]>([])
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('current')
  const [weatherLoading, setWeatherLoading] = useState(false)
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
      await loadResortData()
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
      await loadResortData()
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

  useEffect(() => {
    if (resortId == null) return
    setWeatherLoading(true)
    const load = async () => {
      if (weatherMode === 'current') {
        const current = await api.get<AltitudePointWeather[]>(`/weather/${resortId}/altitudes/current`).catch(() => [])
        setAltitudeWeather(current)
        setAltitudeHourly([])
        setAltitudeDaily([])
        return
      }
      if (weatherMode === 'today_hourly' || weatherMode === 'tomorrow_hourly') {
        const day = weatherMode === 'today_hourly' ? 'today' : 'tomorrow'
        const hourly = await api
          .get<AltitudePointHourlyForecast[]>(`/weather/${resortId}/altitudes/hourly?day=${day}`)
          .catch(() => [])
        setAltitudeHourly(hourly)
        setAltitudeWeather([])
        setAltitudeDaily([])
        return
      }
      const daily = await api.get<AltitudePointDailyForecast[]>(`/weather/${resortId}/altitudes/daily?days=7`).catch(() => [])
      setAltitudeDaily(daily)
      setAltitudeWeather([])
      setAltitudeHourly([])
    }
    void load().finally(() => setWeatherLoading(false))
  }, [resortId, weatherMode])

  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>
  if (error || !resort) return <div className="page"><div className="error">{error || 'Курорт не найден'}</div></div>

  return (
    <div className="page">
      <Link to="/resorts" className="back-link">← Назад к курортам</Link>

      <div className="resort-detail-hero">
        <img
          src={imageUrl(resort.image_url) || PLACEHOLDER_IMG}
          onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          alt={resort.name}
          className="resort-detail-image"
        />
        <header className="page-header resort-detail-header">
          <h1>{resort.name}</h1>
          {resort.rating != null && (
            <span className="rating-badge">
              ★ {resort.rating.toFixed(1)} ({resort.review_count || 0})
            </span>
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
          {resort.description && <p>{resort.description}</p>}
        </header>
      </div>

      {(resort.track_length_km != null || resort.elevation_drop_m != null || resort.trails_green != null || resort.freeride_rating != null) && (
        <section className="resort-stats">
          <h2>Характеристики</h2>
          <div className="resort-stats-grid">
            {resort.track_length_km != null && (
              <div className="resort-stat">
                <span className="resort-stat-value">{resort.track_length_km} км</span>
                <span className="resort-stat-label">Протяжённость трасс</span>
              </div>
            )}
            {resort.elevation_drop_m != null && (
              <div className="resort-stat">
                <span className="resort-stat-value">{resort.elevation_drop_m} м</span>
                <span className="resort-stat-label">Перепад высот</span>
              </div>
            )}
            {(resort.trails_green != null || resort.trails_blue != null || resort.trails_red != null || resort.trails_black != null) && (
              <div className="resort-stat resort-stat-trails">
                <span className="resort-stat-label">Трассы</span>
                <div className="trails-list">
                  {resort.trails_green != null && <span className="trail trail-green">🟢 {resort.trails_green}</span>}
                  {resort.trails_blue != null && <span className="trail trail-blue">🔵 {resort.trails_blue}</span>}
                  {resort.trails_red != null && <span className="trail trail-red">🔴 {resort.trails_red}</span>}
                  {resort.trails_black != null && <span className="trail trail-black">⚫ {resort.trails_black}</span>}
                </div>
              </div>
            )}
            {resort.freeride_rating != null && (
              <div className="resort-stat">
                <span className="resort-stat-value">{resort.freeride_rating}/5</span>
                <span className="resort-stat-label">Фрирайд</span>
              </div>
            )}
            {resort.beginner_friendly != null && (
              <div className="resort-stat">
                <span className="resort-stat-value">{resort.beginner_friendly ? 'Да' : 'Нет'}</span>
                <span className="resort-stat-label">Подходит для новичков</span>
              </div>
            )}
          </div>
        </section>
      )}
      {/* 
      {weather && (
        <section className="weather-card">
          <h2>Погода сейчас</h2>
          <div className="weather-grid">
            <div className="weather-item">
              <span className="weather-value">{weather.temperature}°C</span>
              <span className="weather-label">Температура</span>
            </div>
            <div className="weather-item">
              <span className="weather-value">{weather.windSpeed} м/с</span>
              <span className="weather-label">Ветер</span>
            </div>
            <div className="weather-item">
              <span className="weather-value">{weather.humidity}%</span>
              <span className="weather-label">Влажность</span>
            </div>
            <div className="weather-item">
              <span className="weather-value">{weather.condition}</span>
              <span className="weather-label">Условия</span>
            </div>
          </div>
        </section>
      )} */}

      <section className="weather-card">
        <h2>Погода по высотам</h2>
        <div className="weather-mode-switch">
          <button type="button" className={`btn btn-sm ${weatherMode === 'current' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setWeatherMode('current')}>Сейчас</button>
          <button type="button" className={`btn btn-sm ${weatherMode === 'today_hourly' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setWeatherMode('today_hourly')}>Сегодня по часам</button>
          <button type="button" className={`btn btn-sm ${weatherMode === 'tomorrow_hourly' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setWeatherMode('tomorrow_hourly')}>Завтра по часам</button>
          <button type="button" className={`btn btn-sm ${weatherMode === 'week' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setWeatherMode('week')}>Неделя</button>
        </div>

        {weatherLoading && <div className="loading">Загрузка прогноза...</div>}

        {!weatherLoading && weatherMode === 'current' && (
          altitudeWeather.length === 0 ? (
            <div className="empty-state"><p>Точки высот еще не добавлены.</p></div>
          ) : (
            <div className="altitude-weather-grid">
              {altitudeWeather.slice(0, 4).map((point) => (
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
                  <p className="weather-label">{point.condition}</p>
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
                        <strong>{h.temperature}°C</strong>
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
          altitudeDaily.length === 0 ? (
            <div className="empty-state"><p>Недельный прогноз недоступен.</p></div>
          ) : (
            <div className="altitude-forecast-list">
              {altitudeDaily.slice(0, 4).map((point) => (
                <article key={point.point_id} className="altitude-weather-card">
                  <div className="altitude-weather-header">
                    <strong>{point.point_name}</strong>
                    <span>{point.altitude_m} м</span>
                  </div>
                  <div className="daily-grid">
                    {point.days.map((d) => (
                      <div key={`${point.point_id}-${d.date}`} className="daily-item">
                        <span>{new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                        <strong>{d.minTemperature}° / {d.maxTemperature}°</strong>
                        <span>Осадки: {d.precipitation} мм</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </section>

      <section className="weather-card">
        <h2>Скипассы</h2>
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
        <section className="weather-card">
          <h2>Отели рядом</h2>
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

      <section className="resort-reviews">
        <h2>Отзывы и оценки</h2>
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
                  <strong>{reviewAuthors[review.user_id] || `Пользователь #${review.user_id}`}</strong>
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
  )
}
