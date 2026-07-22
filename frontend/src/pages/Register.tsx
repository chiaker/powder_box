import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, imageUrl, ApiError, type UserProfile } from '../api/client'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=400'

type ResortCard = { id: number; name: string; image_url?: string }

export default function Register() {
  const { register, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [level, setLevel] = useState('')
  const [equipmentType, setEquipmentType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Шаг 2: выбор избранных курортов сразу после регистрации
  const [step, setStep] = useState<1 | 2>(1)
  const [resorts, setResorts] = useState<ResortCard[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await register(email, password)
      await api.put('/users/me', {
        nickname: nickname.trim(),
        level: (level || null) as UserProfile['level'] | null,
        equipment_type: (equipmentType || null) as UserProfile['equipment_type'] | null,
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

  if (step === 2) {
    return (
      <div className="page auth-page">
        <div className="auth-card auth-card-wide">
          <h1>Выберите избранные курорты</h1>
          <p className="auth-subtitle">
            Погода, сравнение и снежные алерты будут привязаны к вашим курортам. Это можно изменить в профиле.
          </p>
          <div className="favorites-grid">
            {resorts.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`favorite-resort-card favorite-resort-pick ${selected.has(String(r.id)) ? 'picked' : ''}`}
                onClick={() => toggleResort(String(r.id))}
              >
                <img src={imageUrl(r.image_url) || PLACEHOLDER_IMG} alt={r.name} />
                <div className="favorite-resort-info">
                  <span>{selected.has(String(r.id)) ? '★ ' : ''}{r.name}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="onboarding-actions">
            <button type="button" className="btn btn-primary" onClick={() => void finishOnboarding()} disabled={loading}>
              {selected.size > 0 ? `Готово (${selected.size})` : 'Готово'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/profile')}>
              Пропустить
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>Регистрация</h1>
        <p className="auth-subtitle">Создайте аккаунт PowderBox</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Минимум 8 символов"
            />
          </div>
          <div className="form-group">
            <label>Никнейм</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              maxLength={100}
              placeholder="Как вас называть на склоне"
            />
          </div>
          <div className="form-group">
            <label>Уровень катания <span className="label-optional">(необязательно)</span></label>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">— Выберите —</option>
              <option value="beginner">Начинающий</option>
              <option value="intermediate">Средний</option>
              <option value="advanced">Продвинутый</option>
            </select>
          </div>
          <div className="form-group">
            <label>Тип снаряжения <span className="label-optional">(необязательно)</span></label>
            <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
              <option value="">— Выберите —</option>
              <option value="ski">Лыжи</option>
              <option value="snowboard">Сноуборд</option>
            </select>
          </div>
          {error && <div className="form-message error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  )
}
