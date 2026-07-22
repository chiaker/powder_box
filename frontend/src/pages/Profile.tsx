import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, imageUrl, type UserProfile, type AuthMe } from '../api/client'

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
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [resorts, setResorts] = useState<{ id: number; name: string; image_url?: string }[]>([])
  const [isEditing, setIsEditing] = useState(true)
  const [authMe, setAuthMe] = useState<AuthMe | null>(null)
  const [resending, setResending] = useState(false)

  // Снежные алерты — сохраняются сразу, отдельно от формы профиля
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [threshold, setThreshold] = useState(10)

  // Смена почты
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [changingEmail, setChangingEmail] = useState(false)

  // Инициализируем форму один раз, чтобы refreshProfile после тапа по звёздочке
  // не затирал несохранённые правки
  const formInitialized = useRef(false)
  useEffect(() => {
    if (user && !formInitialized.current) {
      formInitialized.current = true
      setForm({
        nickname: user.nickname ?? '',
        level: user.level,
        equipment_type: user.equipment_type,
      })
      setAlertsEnabled(user.snow_alerts_enabled ?? false)
      setThreshold(user.snow_alert_threshold_cm ?? 10)
      const hasProfileData = !!(user.nickname?.trim() || user.level || user.equipment_type)
      setIsEditing(!hasProfileData)
    }
  }, [user])

  useEffect(() => {
    api.get<{ id: number; name: string; image_url?: string }[]>('/resorts').then(setResorts).catch(() => {})
    api.get<AuthMe>('/auth/me').then(setAuthMe).catch(() => {})
  }, [])

  const resendConfirmation = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-confirmation')
      toast.show('Письмо отправлено, проверьте почту', 'success')
    } catch (err) {
      toast.show((err as Error).message, 'error')
    } finally {
      setResending(false)
    }
  }

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangingEmail(true)
    try {
      await api.post('/auth/change-email', { new_email: newEmail, password: emailPassword })
      setAuthMe({ email: newEmail, email_confirmed: false })
      setShowEmailForm(false)
      setNewEmail('')
      setEmailPassword('')
      toast.show('Почта изменена. Мы отправили письмо для подтверждения.', 'success')
    } catch (err) {
      toast.show((err as Error).message, 'error')
    } finally {
      setChangingEmail(false)
    }
  }

  const saveAlerts = async (enabled: boolean, thresholdCm: number) => {
    try {
      await api.put('/users/me', {
        snow_alerts_enabled: enabled,
        snow_alert_threshold_cm: Math.min(100, Math.max(1, thresholdCm)),
      })
      await refreshProfile()
      toast.show(enabled ? 'Снежные алерты включены' : 'Снежные алерты выключены', 'success')
    } catch {
      toast.show('Не удалось сохранить настройки алертов', 'error')
    }
  }

  const doSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/users/me', {
        nickname: form.nickname || null,
        level: form.level || null,
        equipment_type: form.equipment_type || null,
        favorite_resorts: user?.favorite_resorts ?? [],
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

  const toggleFavorite = async (resortId: string) => {
    const favs = user?.favorite_resorts ?? []
    const next = favs.includes(resortId)
      ? favs.filter((id) => id !== resortId)
      : [...favs, resortId]
    try {
      await api.put('/users/me', {
        nickname: user?.nickname || null,
        level: user?.level || null,
        equipment_type: user?.equipment_type || null,
        favorite_resorts: next,
      })
      await refreshProfile()
      toast.show(favs.includes(resortId) ? 'Удалено из избранного' : 'Добавлено в избранное', 'success')
    } catch {
      toast.show('Ошибка обновления избранного', 'error')
    }
  }

  const favoriteResortIds = new Set(user?.favorite_resorts ?? [])

  const avatarEmoji = user?.equipment_type === 'snowboard' ? '🏂' : user?.equipment_type === 'ski' ? '⛷️' : '🏔'

  return (
    <div className="page profile-page">
      <header className="page-header profile-header">
        <div className="profile-avatar">{avatarEmoji}</div>
        <h1>{user?.nickname?.trim() || 'Мой профиль'}</h1>
        {authMe && (
          <p className="profile-email">
            {authMe.email}{' '}
            {authMe.email_confirmed ? (
              <span className="email-status confirmed">✓ подтверждён</span>
            ) : (
              <span className="email-status unconfirmed">не подтверждён</span>
            )}
          </p>
        )}
        <div className="profile-badges">
          {user?.level && <span className="trail">🎿 {LEVEL_LABELS[user.level]}</span>}
          {user?.equipment_type && <span className="trail">{EQUIPMENT_LABELS[user.equipment_type]}</span>}
          {(user?.favorite_resorts?.length ?? 0) > 0 && (
            <span className="trail">★ Курортов в избранном: {user!.favorite_resorts.length}</span>
          )}
        </div>
      </header>

      <div className="profile-center">
        <div className="profile-columns">
          <div className="profile-main">
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

            <section className="account-card">
              <h2>Аккаунт</h2>
              <div className="profile-view-row">
                <span className="profile-view-label">Почта</span>
                <span className="profile-view-value">{authMe?.email ?? '...'}</span>
              </div>
              {authMe && !authMe.email_confirmed && (
                <div className="form-message error account-warning">
                  ✉️ Почта не подтверждена — письма (алерты, уведомления) приходить не будут.
                </div>
              )}
              <div className="account-actions">
                {authMe && !authMe.email_confirmed && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => void resendConfirmation()} disabled={resending}>
                    {resending ? 'Отправка...' : 'Отправить письмо ещё раз'}
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowEmailForm((v) => !v)}>
                  {showEmailForm ? 'Отмена' : 'Изменить почту'}
                </button>
              </div>
              {showEmailForm && (
                <form className="email-change-form" onSubmit={changeEmail}>
                  <div className="form-group">
                    <label>Новая почта</label>
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="new@example.com" />
                  </div>
                  <div className="form-group">
                    <label>Текущий пароль</label>
                    <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required placeholder="Для подтверждения" />
                  </div>
                  <span className="form-hint">На новую почту придёт письмо для подтверждения</span>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={changingEmail}>
                    {changingEmail ? 'Сохранение...' : 'Сменить почту'}
                  </button>
                </form>
              )}
            </section>
          </div>

          <div className="profile-side">
            <section className="resort-stats profile-stats">
              <h2>Моя статистика</h2>
              <div className="resort-stats-grid">
                <div className="resort-stat">
                  <span className="resort-stat-value">{(user?.total_distance ?? 0).toFixed(1)} км</span>
                  <span className="resort-stat-label">Общая дистанция</span>
                </div>
                <div className="resort-stat">
                  <span className="resort-stat-value">{Math.round(user?.total_descent ?? 0)} м</span>
                  <span className="resort-stat-label">Суммарный спуск</span>
                </div>
                <div className="resort-stat">
                  <span className="resort-stat-value"><Link to="/stats">История →</Link></span>
                  <span className="resort-stat-label">Мои заезды</span>
                </div>
              </div>
            </section>

            <section className="snow-alerts-card">
              <h2>❄️ Снежные алерты</h2>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(e) => {
                    setAlertsEnabled(e.target.checked)
                    void saveAlerts(e.target.checked, threshold)
                  }}
                />
                <span>Письмо, когда на избранных курортах ожидается снегопад</span>
              </label>
              {alertsEnabled && (
                <div className="threshold-row">
                  <label>Порог, см/день</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    onBlur={() => void saveAlerts(alertsEnabled, threshold || 10)}
                  />
                </div>
              )}
              <span className="form-hint">
                {authMe && !authMe.email_confirmed
                  ? 'Для получения алертов подтвердите почту'
                  : 'Настройки сохраняются автоматически'}
              </span>
            </section>
          </div>
        </div>

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
                    onClick={() => void toggleFavorite(String(r.id))}
                  >
                    {favoriteResortIds.has(String(r.id)) ? '★ В избранном' : '+ В избранное'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
