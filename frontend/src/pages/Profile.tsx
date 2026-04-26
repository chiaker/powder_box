import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, imageUrl, type UserProfile } from '../api/client'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=400'

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

const EQUIPMENT_LABELS: Record<string, string> = {
  ski: 'Лыжи',
  snowboard: 'Сноуборд',
}

export default function Profile() {
  const { user, refreshProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState<Partial<UserProfile>>({
    nickname: '',
    level: undefined,
    equipment_type: undefined,
    favorite_resorts: [],
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [resorts, setResorts] = useState<{ id: number; name: string; image_url?: string }[]>([])
  const [isEditing, setIsEditing] = useState(true)

  useEffect(() => {
    if (user) {
      setForm({
        nickname: user.nickname ?? '',
        level: user.level,
        equipment_type: user.equipment_type,
        favorite_resorts: user.favorite_resorts ?? [],
      })
      const hasProfileData = !!(user.nickname?.trim() || user.level || user.equipment_type)
      setIsEditing((prev) => (prev === false ? false : !hasProfileData))
    }
  }, [user])

  useEffect(() => {
    api.get<{ id: number; name: string; image_url?: string }[]>('/resorts').then(setResorts).catch(() => {})
  }, [])

  const doSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/users/me', {
        nickname: form.nickname || null,
        level: form.level || null,
        equipment_type: form.equipment_type || null,
        favorite_resorts: form.favorite_resorts ?? [],
      })
      await refreshProfile()
      setMessage('Профиль обновлён')
      toast.show('Профиль обновлён', 'success')
      setIsEditing(false)
    } catch (err) {
      const msg = (err as Error).message
      setMessage('Ошибка: ' + msg)
      toast.show(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void doSave()
  }

  const toggleFavorite = (resortId: string) => {
    const favs = form.favorite_resorts ?? []
    const next = favs.includes(resortId)
      ? favs.filter((id) => id !== resortId)
      : [...favs, resortId]
    setForm((f) => ({ ...f, favorite_resorts: next }))
  }

  const favoriteResortIds = new Set(form.favorite_resorts ?? [])

  return (
    <div className="page profile-page">
      <header className="page-header profile-header">
        <h1>Мой профиль</h1>
        <p>Настройте свой профиль горнолыжника</p>
      </header>

      <div className="profile-center">
        {isEditing ? (
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Никнейм</label>
              <input
                type="text"
                value={form.nickname ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="Ваш ник"
              />
            </div>
            <div className="form-group">
              <label>Уровень катания</label>
              <select
                value={form.level ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, level: (e.target.value || undefined) as UserProfile['level'] }))}
              >
                <option value="">— Выберите —</option>
                <option value="beginner">Начинающий</option>
                <option value="intermediate">Средний</option>
                <option value="advanced">Продвинутый</option>
              </select>
            </div>
            <div className="form-group">
              <label>Тип снаряжения</label>
              <select
                value={form.equipment_type ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, equipment_type: (e.target.value || undefined) as UserProfile['equipment_type'] }))}
              >
                <option value="">— Выберите —</option>
                <option value="ski">Лыжи</option>
                <option value="snowboard">Сноуборд</option>
              </select>
              <span className="form-hint">Уроки и рекомендации будут подобраны под ваш тип снаряжения</span>
            </div>
            {message && <div className={`form-message ${message.startsWith('Ошибка') ? 'error' : 'success'}`}>{message}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        ) : (
          <div className="profile-view">
            <div className="profile-view-row">
              <span className="profile-view-label">Никнейм</span>
              <span className="profile-view-value">{form.nickname || '—'}</span>
            </div>
            <div className="profile-view-row">
              <span className="profile-view-label">Уровень катания</span>
              <span className="profile-view-value">{form.level ? LEVEL_LABELS[form.level] : '—'}</span>
            </div>
            <div className="profile-view-row">
              <span className="profile-view-label">Тип снаряжения</span>
              <span className="profile-view-value">{form.equipment_type ? EQUIPMENT_LABELS[form.equipment_type] : '—'}</span>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setIsEditing(true)}>
              Редактировать
            </button>
          </div>
        )}

        <section className="profile-favorites">
          <h2>Избранные курорты</h2>
          <p className="favorites-hint">Погода и рекомендации будут привязаны к избранным курортам</p>
          <div className="favorites-grid">
            {resorts.map((r) => (
              <div key={r.id} className="favorite-resort-card">
                <img src={imageUrl(r.image_url) || PLACEHOLDER_IMG} alt={r.name} />
                <div className="favorite-resort-info">
                  <Link to={`/resorts/${r.id}`}>{r.name}</Link>
                  <button
                    type="button"
                    className={`btn btn-sm ${favoriteResortIds.has(String(r.id)) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleFavorite(String(r.id))}
                  >
                    {favoriteResortIds.has(String(r.id)) ? '★ В избранном' : '+ В избранное'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {isEditing ? (
            <p className="form-hint">Нажмите «Сохранить» выше, чтобы применить изменения</p>
          ) : (
            <div className="profile-favorites-save">
              <button type="button" className="btn btn-primary" onClick={() => void doSave()} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить избранное'}
              </button>
              <p className="form-hint">Нажмите «Сохранить избранное», чтобы применить изменения в избранных курортах</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
