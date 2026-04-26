import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, imageUrl, type EquipmentItem, type EquipmentCategory } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function EquipmentForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<EquipmentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    category_id: '',
    price: '',
    image_url: '',
    imagePreview: '' as string,
    imageFile: null as File | null,
    address: '',
    price_per_day: '',
    condition: '',
    equipment_type: '',
  })

  const itemId = id && id !== 'new' ? parseInt(id, 10) : null

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    api.get<EquipmentCategory[]>('/equipment/categories')
      .then(setCategories)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false))
  }, [token, navigate])

  useEffect(() => {
    if (!itemId || !token) return
    setLoading(true)
    api
      .get<EquipmentItem>(`/equipment/items/${itemId}`)
      .then((i) => {
        setForm({
          name: i.name,
          description: i.description ?? '',
          category_id: i.category_id ?? '',
          price: i.price ?? '',
          image_url: i.image_url ?? '',
          imagePreview: i.image_url ? imageUrl(i.image_url) : '',
          imageFile: null,
          address: i.address ?? '',
          price_per_day: i.price_per_day ?? '',
          condition: i.condition ?? '',
          equipment_type: i.equipment_type ?? '',
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false))
  }, [itemId, token])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setForm({
      ...form,
      imageFile: file,
      imagePreview: URL.createObjectURL(file),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let image_url = form.image_url
      if (form.imageFile) {
        const data = await api.upload('/equipment/upload', form.imageFile)
        image_url = data.image_url
      }
      const body = {
        name: form.name,
        description: form.description || undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        image_url: image_url || undefined,
        address: form.address || undefined,
        price_per_day: form.price_per_day ? parseFloat(form.price_per_day) : undefined,
        condition: form.condition || undefined,
        equipment_type: form.equipment_type || undefined,
      }
      if (itemId) {
        await api.patch(`/equipment/items/${itemId}`, body)
        navigate(`/equipment/${itemId}`)
      } else {
        const created = await api.post<EquipmentItem>('/equipment/items', body)
        navigate(`/equipment/${created.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (!token) return null
  if (loading) return <div className="page"><div className="loading">Загрузка...</div></div>

  return (
    <div className="page">
      <Link to="/equipment" className="back-link">← Назад к объявлениям</Link>
      <header className="page-header">
        <h1>{itemId ? 'Редактирование' : 'Новое объявление'}</h1>
      </header>

      {error && <div className="error-state"><p>{error}</p></div>}

      <form className="equipment-form" onSubmit={handleSubmit}>
        <div className="form-grid equipment-form-grid">
          <div className="form-field">
            <label>Название *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-field">
            <label>Описание</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
          </div>
          <div className="form-field">
            <label>Фото</label>
            <div className="file-upload-wrap" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
              />
              {form.imagePreview ? (
                <div className="file-preview">
                  <img src={form.imagePreview} alt="Превью" />
                </div>
              ) : (
                <span>Нажмите для выбора файла</span>
              )}
            </div>
          </div>
          <div className="form-field form-field-half">
            <label>Категория</label>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field form-field-half">
            <label>Тип снаряжения</label>
            <select value={form.equipment_type} onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}>
              <option value="">—</option>
              <option value="ski">Лыжи</option>
              <option value="snowboard">Сноуборд</option>
            </select>
          </div>
          <div className="form-field">
            <label>Адрес (откуда забирать)</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Город, улица, дом..." />
          </div>
          <div className="form-field form-field-half">
            <label>Состояние</label>
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              <option value="">—</option>
              <option value="new">Новое</option>
              <option value="good">Хорошее</option>
              <option value="used">Б/у</option>
            </select>
          </div>
          <div className="form-field form-field-half">
            <label>Цена за день (₽)</label>
            <input type="number" step="0.01" value={form.price_per_day} onChange={(e) => setForm({ ...form, price_per_day: e.target.value })} />
          </div>
          <div className="form-field form-field-half">
            <label>Цена (₽) — если не за день</label>
            <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <div className="form-actions">
          <Link to={itemId ? `/equipment/${itemId}` : '/equipment'} className="btn btn-ghost">Отмена</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
