import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, imageUrl, type UserProfile, type AuthMe } from '../api/client'
import PageHead from '../components/PageHead'

/** Уровни названы по цветам трасс — единая система с бейджами (дизайн 10a/11b) */
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Зелёные трассы',
  intermediate: 'Красные трассы',
  advanced: 'Чёрные трассы',
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: 'var(--green)',
  intermediate: 'var(--danger)',
  advanced: 'var(--trail-black)',
}

const EQUIPMENT_LABELS: Record<string, string> = {
  ski: 'Лыжи',
  snowboard: 'Сноуборд',
}

/** Шкала в профиле закрашивается до текущего уровня включительно */
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'] as const

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
    const next = favs.includes(resortId) ? favs.filter((id) => id !== resortId) : [...favs, resortId]
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

  // Поиск + избранные сверху, чтобы список не превращался в стену при 10+ курортах
  const [resortQuery, setResortQuery] = useState('')
  const visibleResorts = resorts
    .filter((r) => r.name.toLowerCase().includes(resortQuery.trim().toLowerCase()))
    .sort((a, b) => {
      const fa = favoriteResortIds.has(String(a.id)) ? 0 : 1
      const fb = favoriteResortIds.has(String(b.id)) ? 0 : 1
      return fa - fb || a.name.localeCompare(b.name, 'ru')
    })

  const avatarEmoji = user?.equipment_type === 'snowboard' ? '🏂' : '⛷'
  const emailOk = authMe?.email_confirmed

  return (
    <div className="pb-profile">
      <PageHead
        kicker={user?.level ? LEVEL_LABELS[user.level] : 'профиль катания'}
        title={
          <span className="pb-profile-head">
            <span className="pb-profile-avatar">{avatarEmoji}</span>
            <span>
              <span className="pb-profile-name">{user?.nickname?.trim() || 'Мой профиль'}</span>
              <span className="pb-profile-badges">
                {user?.level && (
                  <span className="pb-profile-badge">
                    <span className="pb-level-dot" style={{ background: LEVEL_COLORS[user.level] }} />
                    {LEVEL_LABELS[user.level]}
                  </span>
                )}
                {user?.equipment_type && (
                  <span className="pb-profile-badge">{EQUIPMENT_LABELS[user.equipment_type]}</span>
                )}
                <span className="pb-profile-badge">
                  {user?.favorite_resorts?.length ?? 0} курортов в избранном
                </span>
              </span>
            </span>
          </span>
        }
        right={
          authMe && (
            <div className="pb-profile-email">
              <span className={`pb-profile-emailstate ${emailOk ? 'ok' : ''}`}>
                {emailOk ? '✓ Почта подтверждена' : '⚠ Почта не подтверждена'}
              </span>
              <span className="pb-profile-emailaddr">{authMe.email}</span>
            </div>
          )
        }
      />

      <div className="pb-page">
        <div className="pb-strip pb-profile-strip">
          {/* Сезон */}
          <div className="pb-strip-col">
            <div className="mono-label pb-strip-label">СЕЗОН</div>
            <div className="pb-profile-stats">
              <div>
                <div className="pb-profile-stat">
                  {(user?.total_distance ?? 0).toFixed(1)}
                  <span> км</span>
                </div>
                <div className="pb-profile-stat-label">пройдено</div>
              </div>
              <div>
                <div className="pb-profile-stat">
                  {Math.round(user?.total_descent ?? 0)}
                  <span> м</span>
                </div>
                <div className="pb-profile-stat-label">суммарный спуск</div>
              </div>
            </div>
            <p className="pb-profile-note">
              {(user?.total_distance ?? 0) > 0
                ? 'Данные обновляются после каждой записи заезда.'
                : 'Пока нет заездов. Первый выезд появится здесь автоматически.'}
            </p>
            <Link to="/stats" className="pb-link">История заездов →</Link>
          </div>

          {/* Профиль катания */}
          <div className="pb-strip-col">
            <div className="mono-label pb-strip-label">ПРОФИЛЬ КАТАНИЯ</div>
            {isEditing ? (
              <form className="pb-profile-form" onSubmit={handleSubmit}>
                <label className="pb-field">
                  <span className="pb-field-label">НИКНЕЙМ</span>
                  <input
                    type="text"
                    value={form.nickname ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                    placeholder="Ваш ник"
                  />
                </label>
                <label className="pb-field">
                  <span className="pb-field-label">УРОВЕНЬ</span>
                  <select
                    value={form.level ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, level: (e.target.value || undefined) as UserProfile['level'] }))}
                  >
                    <option value="">— Выберите —</option>
                    <option value="beginner">Зелёные трассы</option>
                    <option value="intermediate">Красные трассы</option>
                    <option value="advanced">Чёрные трассы</option>
                  </select>
                </label>
                <label className="pb-field">
                  <span className="pb-field-label">СНАРЯЖЕНИЕ</span>
                  <select
                    value={form.equipment_type ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, equipment_type: (e.target.value || undefined) as UserProfile['equipment_type'] }))}
                  >
                    <option value="">— Выберите —</option>
                    <option value="ski">Лыжи</option>
                    <option value="snowboard">Сноуборд</option>
                  </select>
                </label>
                {message && (
                  <div className={`form-message ${message.startsWith('Ошибка') ? 'error' : 'success'}`}>{message}</div>
                )}
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </form>
            ) : (
              <>
                <div className="pb-profile-rows">
                  <div className="pb-profile-row">
                    <span>Никнейм</span>
                    <strong>{form.nickname || '—'}</strong>
                  </div>
                  <div className="pb-profile-row">
                    <span>Уровень</span>
                    <strong className="pb-profile-level">
                      <span className="pb-level-scale">
                        {LEVEL_ORDER.map((lv, i) => (
                          <span
                            key={lv}
                            style={{
                              background:
                                i <= LEVEL_ORDER.indexOf(form.level ?? ('' as never))
                                  ? LEVEL_COLORS[lv]
                                  : 'var(--bar-base)',
                            }}
                          />
                        ))}
                      </span>
                      {form.level ? LEVEL_LABELS[form.level] : '—'}
                    </strong>
                  </div>
                  <div className="pb-profile-row">
                    <span>Снаряжение</span>
                    <strong>{form.equipment_type ? EQUIPMENT_LABELS[form.equipment_type] : '—'}</strong>
                  </div>
                  <div className="pb-profile-row">
                    <span>Единицы</span>
                    <strong>°C · см · м/с</strong>
                  </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
                  Редактировать
                </button>
              </>
            )}
          </div>

          {/* Аккаунт */}
          <div className="pb-strip-col">
            <div className="mono-label pb-strip-label">АККАУНТ</div>
            <div className="pb-profile-row">
              <span>Почта</span>
              <strong>{authMe?.email ?? '…'}</strong>
            </div>
            {authMe && !authMe.email_confirmed && (
              <div className="pb-warnbox">
                <div className="pb-warnbox-title">⚠ Почта не подтверждена</div>
                <p>Снежные алерты и письма не приходят, пока адрес не подтверждён.</p>
              </div>
            )}
            <div className="pb-profile-actions">
              {authMe && !authMe.email_confirmed && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void resendConfirmation()} disabled={resending}>
                  {resending ? 'Отправка...' : 'Отправить письмо'}
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowEmailForm((v) => !v)}>
                {showEmailForm ? 'Отмена' : 'Изменить почту'}
              </button>
            </div>
            {showEmailForm && (
              <form className="pb-profile-form" onSubmit={changeEmail}>
                <label className="pb-field">
                  <span className="pb-field-label">НОВАЯ ПОЧТА</span>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="new@example.com" />
                </label>
                <label className="pb-field">
                  <span className="pb-field-label">ТЕКУЩИЙ ПАРОЛЬ</span>
                  <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required placeholder="Для подтверждения" />
                </label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={changingEmail}>
                  {changingEmail ? 'Сохранение...' : 'Сменить почту'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Снежные алерты */}
        <section className="pb-section">
          <div className="pb-section-head">
            <h3>Снежные алерты</h3>
            <span className="mono-label">
              {user?.favorite_resorts?.length ?? 0} КУРОРТОВ НА СЛЕЖЕНИИ
            </span>
            <label className="pb-switch-row">
              <span>{alertsEnabled ? 'включены' : 'выключены'}</span>
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => {
                  setAlertsEnabled(e.target.checked)
                  void saveAlerts(e.target.checked, threshold)
                }}
              />
              <span className="pb-switch" />
            </label>
          </div>
          <div className="pb-alert-cards">
            <div className="pb-alert-card">
              <div className="pb-alert-card-title">Порог снегопада</div>
              <div className="pb-alert-card-main">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  onBlur={() => void saveAlerts(alertsEnabled, threshold || 10)}
                  className="pb-alert-threshold"
                />
                <span>см за 48 часов</span>
              </div>
              <div className="pb-alert-bar">
                <div style={{ width: `${Math.min(100, threshold)}%` }} />
              </div>
            </div>
            <div className="pb-alert-card">
              <div className="pb-alert-card-title">Куда писать</div>
              <p className="pb-alert-card-text">
                {authMe?.email ?? '…'}
                {authMe && !authMe.email_confirmed && ' — адрес пока не подтверждён, письма не уходят.'}
              </p>
            </div>
            <div className="pb-alert-card">
              <div className="pb-alert-card-title">Как это работает</div>
              <p className="pb-alert-card-text">
                Проверяем прогноз по вашим избранным курортам и пишем, когда за 48 часов ожидается больше {threshold} см снега.
              </p>
            </div>
          </div>
        </section>

        {/* Избранные курорты */}
        <section className="pb-section">
          <div className="pb-section-head">
            <h3>Избранные курорты</h3>
            <span className="mono-label">{user?.favorite_resorts?.length ?? 0} ИЗ {resorts.length}</span>
            {(user?.favorite_resorts?.length ?? 0) >= 2 && (
              <Link
                to={`/compare?ids=${(user?.favorite_resorts ?? []).join(',')}`}
                className="pb-link pb-section-cta"
              >
                Сравнить все →
              </Link>
            )}
          </div>
          <p className="section-hint">Погода на главной, алерты и «лучший день» считаются по этому списку.</p>
          {resorts.length > 8 && (
            <input
              type="search"
              className="pb-head-search pb-profile-search"
              placeholder="Поиск курорта…"
              value={resortQuery}
              onChange={(e) => setResortQuery(e.target.value)}
            />
          )}
          <div className="pb-fav-grid">
            {visibleResorts.map((r) => {
              const fav = favoriteResortIds.has(String(r.id))
              return (
                <div key={r.id} className={`pb-fav-card ${fav ? '' : 'muted'}`}>
                  <Link to={`/resorts/${r.id}`} className="pb-fav-photo">
                    {r.image_url ? (
                      <img src={imageUrl(r.image_url)} alt={r.name} loading="lazy" />
                    ) : (
                      <span className="pb-rcard-photo-empty">ФОТО КУРОРТА</span>
                    )}
                  </Link>
                  <div className="pb-fav-body">
                    <Link to={`/resorts/${r.id}`} className="pb-fav-name">{r.name}</Link>
                    <button
                      type="button"
                      className={`pb-fav-btn ${fav ? 'active' : ''}`}
                      onClick={() => void toggleFavorite(String(r.id))}
                    >
                      {fav ? '★ В избранном' : '+ Добавить'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
