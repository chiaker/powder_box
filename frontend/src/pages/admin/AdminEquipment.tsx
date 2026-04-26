import { useEffect, useState } from 'react'
import { api, type EquipmentItem, type EquipmentCategory } from '../../api/client'
import { useToast } from '../../context/ToastContext'

export default function AdminEquipment() {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [categories, setCategories] = useState<EquipmentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EquipmentItem | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const load = async () => {
    const [itemsRes, catsRes] = await Promise.all([
      api.get<EquipmentItem[]>('/equipment/items'),
      api.get<EquipmentCategory[]>('/equipment/categories'),
    ])
    setItems(itemsRes)
    setCategories(catsRes)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить позицию?')) return
    try {
      await api.delete(`/equipment/items/${id}`)
      toast.show('Удалено', 'success')
      load()
      if (editing?.id === id) setEditing(null)
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }

  if (loading) return <div className="admin-page"><div className="loading">Загрузка...</div></div>

  const handleAddCategory = async () => {
    const name = prompt('Название категории:')
    if (!name?.trim()) return
    try {
      await api.post('/equipment/categories', { name: name.trim() })
      toast.show('Категория добавлена', 'success')
      load()
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Снаряжение</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={handleAddCategory}>+ Категория</button>
          <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
            + Добавить
          </button>
        </div>
      </header>

      {(creating || editing) && (
        <EquipmentForm
          item={editing ?? undefined}
          categories={categories}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { load(); setCreating(false); setEditing(null); toast.show('Сохранено', 'success'); }}
          onError={(msg) => toast.show(msg, 'error')}
        />
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Категория</th>
              <th>Цена/день</th>
              <th>Адрес</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{i.name}</td>
                <td>{categories.find(c => c.id === i.category_id)?.name ?? '—'}</td>
                <td>{i.price_per_day != null ? `${i.price_per_day} ₽` : i.price != null ? `${i.price} ₽` : '—'}</td>
                <td>{i.address ?? '—'}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => { setEditing(i); setCreating(false); }}>Изменить</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(i.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EquipmentForm({
  item,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  item?: EquipmentItem
  categories: EquipmentCategory[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    category_id: item?.category_id ?? '',
    price: item?.price ?? '',
    image_url: item?.image_url ?? '',
    address: item?.address ?? '',
    price_per_day: item?.price_per_day ?? '',
    condition: item?.condition ?? '',
    equipment_type: item?.equipment_type ?? '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? '',
        category_id: item.category_id ?? '',
        price: item.price ?? '',
        image_url: item.image_url ?? '',
        address: item.address ?? '',
        price_per_day: item.price_per_day ?? '',
        condition: item.condition ?? '',
        equipment_type: item.equipment_type ?? '',
      })
    }
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        image_url: form.image_url || undefined,
        address: form.address || undefined,
        price_per_day: form.price_per_day ? parseFloat(form.price_per_day) : undefined,
        condition: form.condition || undefined,
        equipment_type: form.equipment_type || undefined,
      }
      if (item) {
        await api.patch(`/equipment/items/${item.id}`, body)
      } else {
        await api.post('/equipment/items', body)
      }
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <h3>{item ? 'Редактирование' : 'Новая позиция'}</h3>
      <div className="form-grid">
        <label>Название *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label>Описание</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        <label>URL фото</label>
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        <label>Категория</label>
        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label>Тип</label>
        <select value={form.equipment_type} onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}>
          <option value="">—</option>
          <option value="ski">Лыжи</option>
          <option value="snowboard">Сноуборд</option>
        </select>
        <label>Адрес (откуда забирать)</label>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Город, улица, дом..." />
        <label>Цена за день (₽)</label>
        <input type="number" step="0.01" value={form.price_per_day} onChange={(e) => setForm({ ...form, price_per_day: e.target.value })} />
        <label>Цена (₽)</label>
        <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <label>Состояние</label>
        <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
          <option value="">—</option>
          <option value="new">Новое</option>
          <option value="good">Хорошее</option>
          <option value="used">Б/у</option>
        </select>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </div>
    </form>
  )
}
