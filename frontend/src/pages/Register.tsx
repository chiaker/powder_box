import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, imageUrl, ApiError, type UserProfile } from '../api/client'
import AuthScene from '../components/AuthScene'
import ThemeToggle from '../components/ThemeToggle'

type ResortCard = { id: number; name: string; image_url?: string }

/** Уровни названы по цветам трасс — единая система с бейджами (дизайн 12b) */
const LEVELS: { value: NonNullable<UserProfile['level']>; label: string; color: string }[] = [
  { value: 'beginner', label: 'Зелёные', color: 'var(--green)' },
  { value: 'intermediate', label: 'Красные', color: 'var(--danger)' },
  { value: 'advanced', label: 'Чёрные', color: 'var(--trail-black)' },
]

/** Наивная оценка пароля: длина + разнообразие символов */
function passwordScore(pw: string): number {
  if (pw.length < 8) return pw ? 1 : 0
  let score = 1
  if (pw.length >= 12) score++
  if (/[a-zA-Zа-яА-Я]/.test(pw) && /\d/.test(pw)) score++
  return Math.min(3, score)
}

export default function Register() {
  const { register, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  // Email может прийти из плашки «Снежная почта»: /register?email=...
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [nickname, setNickname] = useState('')
  const [level, setLevel] = useState<UserProfile['level']>(undefined)
  const [equipmentType, setEquipmentType] = useState<UserProfile['equipment_type']>(undefined)
  const [wantAlerts, setWantAlerts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Шаг 2: выбор избранных курортов сразу после регистрации
  const [step, setStep] = useState<1 | 2>(1)
  const [resorts, setResorts] = useState<ResortCard[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resortQuery, setResortQuery] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await register(email, password)
      await api.put('/users/me', {
        nickname: nickname.trim(),
        level: level ?? null,
        equipment_type: equipmentType ?? null,
        snow_alerts_enabled: wantAlerts,
      })
      await refreshProfile()
      toast.show('Регистрация успешна! Мы отправили письмо для подтверждения email.', 'success')
      api.get<ResortCard[]>('/resorts').then(setResorts).catch(() => {})
      setStep(2)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      setError(msg)
      toast.show(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleResort = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const finishOnboarding = async () => {
    setLoading(true)
    try {
      if (selected.size > 0) {
        await api.put('/users/me', { favorite_resorts: [...selected] })
        await refreshProfile()
      }
      navigate('/profile')
    } catch {
      navigate('/profile')
    } finally {
      setLoading(false)
    }
  }

  const score = passwordScore(password)
  const scoreLabel = ['', 'СЛАБЫЙ', 'СРЕДНИЙ', 'НАДЁЖНЫЙ'][score]

  return (
    <div className="pb-auth">
      <AuthScene />
      <div className="pb-auth-form">
        <div className="pb-auth-form-head">
          <span className="mono-label">РЕГИСТРАЦИЯ · ШАГ {step} ИЗ 2</span>
          <ThemeToggle />
        </div>
        <div className="pb-auth-steps">
          <span className="on" />
          <span className={step === 2 ? 'on' : ''} />
        </div>

        {step === 1 ? (
          <>
            <h2 className="pb-auth-title">Создать аккаунт</h2>
            <form onSubmit={handleSubmit} className="pb-auth-fields">
              <label className="pb-field">
                <span className="pb-field-label">ИМЯ</span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Как вас зовут"
                />
              </label>
              <label className="pb-field">
                <span className="pb-field-label">EMAIL</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@email.com"
                />
              </label>
              <label className="pb-field">
                <span className="pb-field-label">ПАРОЛЬ</span>
                <span className="pb-field-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Минимум 8 символов"
                  />
                  <button type="button" className="pb-field-toggle" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'скрыть' : 'показать'}
                  </button>
                </span>
                {password && (
                  <span className="pb-pw-strength">
                    {[1, 2, 3].map((i) => (
                      <span key={i} className={i <= score ? 'on' : ''} />
                    ))}
                    <span className="pb-pw-label">{scoreLabel}</span>
                  </span>
                )}
              </label>

              <div className="pb-field">
                <span className="pb-field-label">УРОВЕНЬ КАТАНИЯ</span>
                <div className="pb-level-picker">
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      className={`pb-level-card ${level === l.value ? 'active' : ''}`}
                      onClick={() => setLevel(level === l.value ? undefined : l.value)}
                    >
                      <span className="pb-level-bar" style={{ background: l.color }} />
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pb-field">
                <span className="pb-field-label">СНАРЯЖЕНИЕ</span>
                <div className="pb-level-picker">
                  {(['ski', 'snowboard'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`pb-level-card ${equipmentType === g ? 'active' : ''}`}
                      onClick={() => setEquipmentType(equipmentType === g ? undefined : g)}
                    >
                      {g === 'ski' ? 'Лыжи' : 'Сноуборд'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="pb-check-row">
                <input type="checkbox" checked={wantAlerts} onChange={(e) => setWantAlerts(e.target.checked)} />
                <span className="pb-check-box">✓</span>
                <span>Присылать снежную почту по моим курортам. Отписаться можно в один клик.</span>
              </label>

              {error && <div className="form-message error">{error}</div>}
              <button type="submit" className="btn btn-primary pb-auth-submit" disabled={loading}>
                {loading ? 'Регистрация...' : 'Далее — выбрать курорты'}
              </button>
            </form>
            <p className="pb-auth-foot">
              Уже с нами? <Link to="/login">Войти</Link>
            </p>
          </>
        ) : (
          <>
            <h2 className="pb-auth-title">Выберите курорты</h2>
            <p className="pb-auth-sub">
              Погода, сравнение и снежные алерты будут привязаны к ним. Это можно изменить в профиле.
            </p>
            {resorts.length > 8 && (
              <input
                type="search"
                className="pb-head-search pb-profile-search"
                placeholder="Поиск курорта…"
                value={resortQuery}
                onChange={(e) => setResortQuery(e.target.value)}
              />
            )}
            <div className="pb-onboard-grid">
              {resorts
                .filter((r) => r.name.toLowerCase().includes(resortQuery.trim().toLowerCase()))
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`pb-onboard-card ${selected.has(String(r.id)) ? 'picked' : ''}`}
                    onClick={() => toggleResort(String(r.id))}
                  >
                    {r.image_url ? (
                      <img src={imageUrl(r.image_url)} alt={r.name} loading="lazy" />
                    ) : (
                      <span className="pb-rcard-photo-empty">ФОТО</span>
                    )}
                    <span className="pb-onboard-name">
                      {selected.has(String(r.id)) ? '★ ' : ''}
                      {r.name}
                    </span>
                  </button>
                ))}
            </div>
            <div className="pb-auth-actions">
              <button type="button" className="btn btn-primary" onClick={() => void finishOnboarding()} disabled={loading}>
                {selected.size > 0 ? `Готово (${selected.size})` : 'Готово'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => navigate('/profile')}>
                Пропустить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
