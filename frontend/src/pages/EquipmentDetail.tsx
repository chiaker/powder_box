import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, imageUrl, IMG_PLACEHOLDER, type EquipmentItem, type EquipmentCategory } from '../api/client'
import { useAuth } from '../context/AuthContext'

/** Превращает контакт в ссылку: @ник → t.me, телефон → tel:, url → как есть */
function contactHref(contact: string): string | null {
  const c = contact.trim()
  if (c.startsWith('@')) return `https://t.me/${c.slice(1)}`
  if (c.startsWith('http')) return c
  if (/^\+?[\d\s()-]{6,}$/.test(c)) return `tel:${c.replace(/[^+\d]/g, '')}`
  return null
}

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<EquipmentItem | null>(null)
  const [category, setCategory] = useState<EquipmentCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, token } = useAuth()

  const itemId = id ? parseInt(id, 10) : null

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      setError('Неверный ID')
      setLoading(false)
      return
    }
    api
      .get<EquipmentItem>(`/equipment/items/${itemId}`)
      .then(async (i) => {
        setItem(i)
        if (i.category_id) {
          try {
            const cats = await api.get<EquipmentCategory[]>('/equipment/categories')
            setCategory(cats.find((c) => c.id === i.category_id) ?? null)
          } catch {
            setCategory(null)
          }
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [itemId])

  const isOwner = token && item && user && Number(user.user_id) === item.owner_id

  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>
  if (error || !item) return (
    <div className="page">
      <div className="error-state">
        <p>{error || 'Объявление не найдено'}</p>
        <Link to="/equipment" className="btn btn-primary">← К объявлениям</Link>
      </div>
    </div>
  )

  return (
    <div className="page">
      <Link to="/equipment" className="back-link">← Назад к объявлениям</Link>

      <div className="equipment-detail">
        <img
          src={imageUrl(item.image_url) || IMG_PLACEHOLDER}
          onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
          alt={item.name}
          className="equipment-detail-image"
        />
        <div className="equipment-detail-body">
          <h1>{item.name}</h1>
          {(item.price_per_day != null || item.price != null) && (
            <p className="equipment-detail-price">
              {item.price_per_day != null ? `${item.price_per_day} ₽/день` : `${item.price} ₽`}
            </p>
          )}
          {category && <span className="equipment-meta">{category.name}</span>}
          {item.address && (
            <p className="equipment-address">Адрес: {item.address}</p>
          )}
          {item.condition && (
            <p className="equipment-meta">Состояние: {item.condition}</p>
          )}
          {item.equipment_type && (
            <p className="equipment-meta">Тип: {item.equipment_type === 'ski' ? 'Лыжи' : 'Сноуборд'}</p>
          )}
          {item.created_at && (
            <p className="equipment-meta">
              Размещено: {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {item.contact && (
            contactHref(item.contact) ? (
              <a
                href={contactHref(item.contact)!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary equipment-contact-btn"
              >
                💬 Написать владельцу
              </a>
            ) : (
              <p className="equipment-meta">Контакт: {item.contact}</p>
            )
          )}
          {item.description && (
            <div className="equipment-description">
              <h2>Описание</h2>
              <p>{item.description}</p>
            </div>
          )}
          {isOwner && (
            <Link to={`/equipment/${item.id}/edit`} className="btn btn-outline equipment-detail-edit-btn">Редактировать</Link>
          )}
        </div>
      </div>
    </div>
  )
}
