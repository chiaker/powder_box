import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, imageUrl, IMG_PLACEHOLDER, type Hotel, type Resort } from '../api/client'

export default function HotelDetail() {
  const { id } = useParams<{ id: string }>()
  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [resort, setResort] = useState<Resort | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const hotelId = id ? parseInt(id, 10) : null

  const galleryUrls = hotel?.gallery_urls?.filter(Boolean) ?? []
  const roomUrls = hotel?.room_photo_urls?.filter(Boolean) ?? []
  const mainImage = hotel?.image_url || galleryUrls[0]
  const allImages = hotel
    ? [mainImage, ...galleryUrls.filter((u) => u !== mainImage), ...roomUrls].filter(Boolean) as string[]
    : []

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), [])
  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const imgCount = Math.max(1, allImages.length)
  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i == null ? null : (i - 1 + imgCount) % imgCount))
  }, [imgCount])
  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i == null ? null : (i + 1) % imgCount))
  }, [imgCount])

  useEffect(() => {
    if (!hotelId || Number.isNaN(hotelId)) {
      setError('Неверный ID отеля')
      setLoading(false)
      return
    }
    api
      .get<Hotel>(`/hotels/${hotelId}`)
      .then(async (h) => {
        setHotel(h)
        if (h.resort_id) {
          try {
            const r = await api.get<Resort>(`/resorts/${h.resort_id}`)
            setResort(r)
          } catch {
            setResort(null)
          }
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [hotelId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIndex == null) return
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, closeLightbox, goPrev, goNext])

  if (loading) return <div className="page"><div className="loading">Загрузка отеля...</div></div>
  if (error || !hotel) return (
    <div className="page">
      <div className="error-state">
        <p>{error || 'Отель не найден'}</p>
        <Link to="/hotels" className="btn btn-primary">← К отелям</Link>
      </div>
    </div>
  )

  return (
    <div className="page">
      <Link to="/hotels" className="back-link">← Назад к отелям</Link>

      <div className="hotel-detail-hero">
        <img
          src={imageUrl(mainImage) || IMG_PLACEHOLDER}
          onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
          alt={hotel.name}
          className="hotel-detail-image hotel-photo-clickable"
          onClick={() => mainImage && openLightbox(0)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && mainImage && openLightbox(0)}
        />
        <header className="page-header hotel-detail-header">
          <h1>{hotel.name}</h1>
          {hotel.rating != null && (
            <span className="hotel-rating">★ {hotel.rating.toFixed(1)}</span>
          )}
          {resort && (
            <Link to={`/resorts/${hotel.resort_id}`} className="hotel-resort-link">
              {resort.name}
            </Link>
          )}
          {hotel.price_from != null && (
            <div className="hotel-price-block">
              <p className="hotel-detail-price">
                от {hotel.price_from} {hotel.currency || '₽'} за ночь
              </p>
              <span className="hotel-price-disclaimer">Цены могут отличаться</span>
            </div>
          )}
          {hotel.booking_url && (
            <a href={hotel.booking_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary hotel-book-btn">
              Забронировать
            </a>
          )}
        </header>
      </div>

      {hotel.description && (
        <section className="weather-card">
          <h2>Описание</h2>
          <p className="hotel-detail-description">{hotel.description}</p>
        </section>
      )}

      {galleryUrls.length > 0 && (
        <section className="weather-card">
          <h2>Фотографии</h2>
          <div className="hotel-gallery">
            {galleryUrls.map((url, i) => {
              const idx = allImages.indexOf(url)
              if (idx < 0) return null
              return (
                <img
                  key={i}
                  src={imageUrl(url) || IMG_PLACEHOLDER}
                  onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
                  alt={`${hotel.name} — фото ${i + 1}`}
                  className="hotel-gallery-img hotel-photo-clickable"
                  onClick={() => openLightbox(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openLightbox(idx)}
                />
              )
            })}
          </div>
        </section>
      )}

      {roomUrls.length > 0 && (
        <section className="weather-card">
          <h2>Фото номеров</h2>
          <div className="hotel-gallery hotel-room-gallery">
            {roomUrls.map((url, i) => {
              const idx = allImages.indexOf(url)
              if (idx < 0) return null
              return (
                <img
                  key={i}
                  src={imageUrl(url) || IMG_PLACEHOLDER}
                  onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
                  alt={`${hotel.name} — номер ${i + 1}`}
                  className="hotel-gallery-img hotel-photo-clickable"
                  onClick={() => openLightbox(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openLightbox(idx)}
                />
              )
            })}
          </div>
        </section>
      )}

      {lightboxIndex != null && allImages.length > 0 && (
        <div className="hotel-lightbox-overlay" onClick={closeLightbox} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && closeLightbox()}>
          <button type="button" className="hotel-lightbox-close" onClick={closeLightbox} aria-label="Закрыть">
            ×
          </button>
          {allImages.length > 1 && (
            <button type="button" className="hotel-lightbox-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Предыдущее фото">
              ‹
            </button>
          )}
          <img
            src={imageUrl(allImages[lightboxIndex]) || IMG_PLACEHOLDER}
            onClick={(e) => e.stopPropagation()}
            alt={`${hotel.name} — фото ${lightboxIndex + 1}`}
            className="hotel-lightbox-img"
          />
          {allImages.length > 1 && (
            <button type="button" className="hotel-lightbox-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Следующее фото">
              ›
            </button>
          )}
        </div>
      )}
    </div>
  )
}
