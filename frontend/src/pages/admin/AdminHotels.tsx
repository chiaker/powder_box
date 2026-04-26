import { useEffect, useState } from 'react'
import { api, type Hotel, type Resort } from '../../api/client'
import { useToast } from '../../context/ToastContext'

export default function AdminHotels() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [resorts, setResorts] = useState<Resort[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Hotel | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const load = async () => {
    const [hotelsRes, resortsRes] = await Promise.all([
      api.get<Hotel[]>('/hotels'),
      api.get<Resort[]>('/resorts'),
    ])
    setHotels(hotelsRes)
    setResorts(resortsRes)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить отель?')) return
    try {
      await api.delete(`/hotels/${id}`)
      toast.show('Отель удалён', 'success')
      load()
      if (editing?.id === id) setEditing(null)
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }

  if (loading) return <div className="admin-page"><div className="loading">Загрузка...</div></div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Отели</h1>
        <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
          + Добавить
        </button>
      </header>

      {(creating || editing) && (
        <HotelForm
          hotel={editing ?? undefined}
          resorts={resorts}
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
              <th>Курорт</th>
              <th>Рейтинг</th>
              <th>Цена от</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((h) => (
              <tr key={h.id}>
                <td>{h.id}</td>
                <td>{h.name}</td>
                <td>{resorts.find(r => r.id === h.resort_id)?.name ?? '—'}</td>
                <td>{h.rating ?? '—'}</td>
                <td>{h.price_from != null ? `${h.price_from} ${h.currency || '₽'}` : '—'}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => { setEditing(h); setCreating(false); }}>Изменить</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(h.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HotelForm({
  hotel,
  resorts,
  onClose,
  onSaved,
  onError,
}: {
  hotel?: Hotel
  resorts: Resort[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    name: hotel?.name ?? '',
    description: hotel?.description ?? '',
    image_url: hotel?.image_url ?? '',
    gallery_urls: (hotel?.gallery_urls ?? []).join('\n'),
    room_photo_urls: (hotel?.room_photo_urls ?? []).join('\n'),
    price_from: hotel?.price_from ?? '',
    currency: hotel?.currency ?? '₽',
    booking_url: hotel?.booking_url ?? '',
    resort_id: hotel?.resort_id ?? '',
    rating: hotel?.rating ?? '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      name: hotel?.name ?? '',
      description: hotel?.description ?? '',
      image_url: hotel?.image_url ?? '',
      gallery_urls: (hotel?.gallery_urls ?? []).join('\n'),
      room_photo_urls: (hotel?.room_photo_urls ?? []).join('\n'),
      price_from: hotel?.price_from ?? '',
      currency: hotel?.currency ?? '₽',
      booking_url: hotel?.booking_url ?? '',
      resort_id: hotel?.resort_id ?? '',
      rating: hotel?.rating ?? '',
    })
  }, [hotel])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const galleryList = form.gallery_urls.split('\n').map((s) => s.trim()).filter(Boolean)
      const roomList = form.room_photo_urls.split('\n').map((s) => s.trim()).filter(Boolean)
      const body = {
        name: form.name,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        gallery_urls: galleryList.length ? galleryList : undefined,
        room_photo_urls: roomList.length ? roomList : undefined,
        price_from: form.price_from ? parseFloat(form.price_from) : undefined,
        currency: form.currency || undefined,
        booking_url: form.booking_url || undefined,
        resort_id: form.resort_id ? Number(form.resort_id) : undefined,
        rating: form.rating ? parseFloat(form.rating) : undefined,
      }
      if (hotel) {
        await api.patch(`/hotels/${hotel.id}`, body)
      } else {
        await api.post('/hotels', body)
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
      <h3>{hotel ? 'Редактирование' : 'Новый отель'}</h3>
      <div className="form-grid">
        <label>Название *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label>Описание</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        <label>URL изображения</label>
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
        <label>Галерея (по одному URL на строку)</label>
        <textarea value={form.gallery_urls} onChange={(e) => setForm({ ...form, gallery_urls: e.target.value })} rows={3} placeholder="https://..." />
        <label>Фото номеров (по одному URL на строку)</label>
        <textarea value={form.room_photo_urls} onChange={(e) => setForm({ ...form, room_photo_urls: e.target.value })} rows={3} placeholder="https://..." />
        <label>Цена от</label>
        <input type="number" min={0} step="0.01" value={form.price_from} onChange={(e) => setForm({ ...form, price_from: e.target.value })} placeholder="5000" />
        <label>Валюта</label>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="₽" maxLength={10} />
        <label>Ссылка на бронирование</label>
        <input value={form.booking_url} onChange={(e) => setForm({ ...form, booking_url: e.target.value })} placeholder="https://..." />
        <label>Курорт</label>
        <select value={form.resort_id} onChange={(e) => setForm({ ...form, resort_id: e.target.value })}>
          <option value="">—</option>
          {resorts.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <label>Рейтинг</label>
        <input type="number" step="0.1" min={0} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} placeholder="0–5" />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </div>
    </form>
  )
}
