import { useEffect, useState } from 'react'
import { api, type Lesson } from '../../api/client'
import { useToast } from '../../context/ToastContext'

export default function AdminLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Lesson | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const load = () => api.get<Lesson[]>('/lessons').then(setLessons)

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить урок?')) return
    try {
      await api.delete(`/lessons/${id}`)
      toast.show('Урок удалён', 'success')
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
        <h1>Уроки</h1>
        <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
          + Добавить
        </button>
      </header>

      {(creating || editing) && (
        <LessonForm
          lesson={editing ?? undefined}
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
              <th>URL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td>{l.title}</td>
                <td>{l.category ?? '—'}</td>
                <td className="truncate">{l.lesson_url}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => { setEditing(l); setCreating(false); }}>Изменить</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(l.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LessonForm({
  lesson,
  onClose,
  onSaved,
  onError,
}: {
  lesson?: Lesson
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    title: lesson?.title ?? '',
    category: lesson?.category ?? 'ski',
    lesson_url: lesson?.lesson_url ?? '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { title: form.title, category: form.category, lesson_url: form.lesson_url }
      if (lesson) {
        await api.patch(`/lessons/${lesson.id}`, body)
      } else {
        await api.post('/lessons', body)
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
      <h3>{lesson ? 'Редактирование' : 'Новый урок'}</h3>
      <div className="form-grid">
        <label>Название *</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <label>Категория</label>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="ski">Лыжи</option>
          <option value="snowboard">Сноуборд</option>
          <option value="freestyle">Фристайл</option>
          <option value="safety">Безопасность</option>
        </select>
        <label>URL видео *</label>
        <input value={form.lesson_url} onChange={(e) => setForm({ ...form, lesson_url: e.target.value })} required placeholder="https://youtube.com/..." />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </div>
    </form>
  )
}
