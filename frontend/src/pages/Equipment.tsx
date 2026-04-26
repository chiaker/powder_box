import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, imageUrl, IMG_PLACEHOLDER, type EquipmentItem, type EquipmentCategory } from '../api/client'

export default function Equipment() {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [categories, setCategories] = useState<EquipmentCategory[]>([])
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (categoryFilter) params.set('category_id', String(categoryFilter))
    if (equipmentTypeFilter) params.set('equipment_type', equipmentTypeFilter)
    const query = params.toString()
    Promise.all([
      api.get<EquipmentItem[]>(`/equipment/items${query ? `?${query}` : ''}`),
      api.get<EquipmentCategory[]>('/equipment/categories'),
    ])
      .then(([i, c]) => {
        setItems(i)
        setCategories(c)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [categoryFilter, equipmentTypeFilter])

  if (loading) return <div className="page"><div className="loading">Загрузка объявлений...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state"><p>{error}</p></div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1>Аренда снаряжения</h1>
        <p>Объявления от собственников — лыжи, сноуборды и экипировка рядом с курортами</p>
      </header>

      <div className="filter-bar equipment-filter-bar">
        <div className="filter-bar-filters">
          <label>
            Категория
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Все</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Тип
            <select value={equipmentTypeFilter} onChange={(e) => setEquipmentTypeFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="ski">Лыжи</option>
              <option value="snowboard">Сноуборд</option>
            </select>
          </label>
        </div>
        <Link to="/equipment/new" className="btn btn-primary">+ Разместить объявление</Link>
      </div>

      <div className="equipment-grid">
        {items.length === 0 ? (
          <div className="empty-state">
            <p>Объявлений пока нет. Будьте первым!</p>
            {/* <Link to="/equipment/new" className="btn btn-primary">Разместить объявление</Link> */}
          </div>
        ) : (
          items.map((item) => (
            <Link key={item.id} to={`/equipment/${item.id}`} className="equipment-card equipment-card-link">
              <img
                src={imageUrl(item.image_url) || IMG_PLACEHOLDER}
                onError={(e) => { (e.target as HTMLImageElement).src = IMG_PLACEHOLDER }}
                alt={item.name}
                className="equipment-card-image"
              />
              <div className="equipment-card-body">
                <h3 className="equipment-card-title">{item.name}</h3>
                {(item.price_per_day != null || item.price != null) && (
                  <p className="equipment-price">
                    {item.price_per_day != null ? `${item.price_per_day} ₽/день` : item.price != null ? `${item.price} ₽` : ''}
                  </p>
                )}
                {item.address && (
                  <span className="equipment-address">{item.address}</span>
                )}
                {item.condition && (
                  <span className="equipment-condition">Состояние: {item.condition}</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
