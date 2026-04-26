import { useEffect, useState } from 'react'
import { api, type Resort } from '../../api/client'
import { useToast } from '../../context/ToastContext'

export default function AdminResorts() {
  const [resorts, setResorts] = useState<Resort[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Resort | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const load = () => api.get<Resort[]>('/resorts').then(setResorts)

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить курорт?')) return
    try {
      await api.delete(`/resorts/${id}`)
      toast.show('Курорт удалён', 'success')
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
        <h1>Курорты</h1>
        <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
          + Добавить
        </button>
      </header>

      {(creating || editing) && (
        <ResortForm
          resort={editing ?? undefined}
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
              <th>Трассы (км)</th>
              <th>Перепад (м)</th>
              <th>Рейтинг</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resorts.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.name}</td>
                <td>{r.track_length_km ?? '—'}</td>
                <td>{r.elevation_drop_m ?? '—'}</td>
                <td>{r.rating ?? '—'}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => { setEditing(r); setCreating(false); }}>Изменить</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResortForm({
  resort,
  onClose,
  onSaved,
  onError,
}: {
  resort?: Resort
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    name: resort?.name ?? '',
    description: resort?.description ?? '',
    image_url: resort?.image_url ?? '',
    rating: resort?.rating ?? '',
    track_length_km: resort?.track_length_km ?? '',
    elevation_drop_m: resort?.elevation_drop_m ?? '',
    trails_green: resort?.trails_green ?? '',
    trails_blue: resort?.trails_blue ?? '',
    trails_red: resort?.trails_red ?? '',
    trails_black: resort?.trails_black ?? '',
    freeride_rating: resort?.freeride_rating ?? '',
    beginner_friendly: resort?.beginner_friendly ?? true,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        rating: form.rating ? parseFloat(form.rating) : undefined,
        track_length_km: form.track_length_km ? parseFloat(form.track_length_km) : undefined,
        elevation_drop_m: form.elevation_drop_m ? parseInt(form.elevation_drop_m, 10) : undefined,
        trails_green: form.trails_green ? parseInt(form.trails_green, 10) : undefined,
        trails_blue: form.trails_blue ? parseInt(form.trails_blue, 10) : undefined,
        trails_red: form.trails_red ? parseInt(form.trails_red, 10) : undefined,
        trails_black: form.trails_black ? parseInt(form.trails_black, 10) : undefined,
        freeride_rating: form.freeride_rating ? parseFloat(form.freeride_rating) : undefined,
        beginner_friendly: form.beginner_friendly,
      }
      if (resort) {
        await api.patch(`/resorts/${resort.id}`, body)
      } else {
        await api.post('/resorts', body)
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
      <h3>{resort ? 'Редактирование' : 'Новый курорт'}</h3>
      <div className="form-grid">
        <label>Название *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label>Описание</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        <label>Картинка (путь)</label>
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="/static/resorts/1.jpg" />
        <label>Рейтинг</label>
        <input type="number" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
        <label>Протяжённость (км)</label>
        <input type="number" value={form.track_length_km} onChange={(e) => setForm({ ...form, track_length_km: e.target.value })} />
        <label>Перепад (м)</label>
        <input type="number" value={form.elevation_drop_m} onChange={(e) => setForm({ ...form, elevation_drop_m: e.target.value })} />
        <label>Трассы: зелёные</label>
        <input type="number" value={form.trails_green} onChange={(e) => setForm({ ...form, trails_green: e.target.value })} />
        <label>синие</label>
        <input type="number" value={form.trails_blue} onChange={(e) => setForm({ ...form, trails_blue: e.target.value })} />
        <label>красные</label>
        <input type="number" value={form.trails_red} onChange={(e) => setForm({ ...form, trails_red: e.target.value })} />
        <label>чёрные</label>
        <input type="number" value={form.trails_black} onChange={(e) => setForm({ ...form, trails_black: e.target.value })} />
        <label>Фрирайд (1–5)</label>
        <input type="number" min={1} max={5} step="0.1" value={form.freeride_rating} onChange={(e) => setForm({ ...form, freeride_rating: e.target.value })} />
        <label>Для новичков</label>
        <input type="checkbox" checked={form.beginner_friendly} onChange={(e) => setForm({ ...form, beginner_friendly: e.target.checked })} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </div>
    </form>
  )
}
