import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../api/client'
import AuthScene from '../components/AuthScene'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      toast.show('Вход выполнен успешно', 'success')
      navigate('/profile')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      setError(msg)
      toast.show(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-auth">
      <AuthScene />
      <div className="pb-auth-form">
        <div className="pb-auth-form-head">
          <span className="mono-label">ВХОД</span>
          <span className="pb-auth-switch">
            Нет аккаунта? <Link to="/register">Регистрация</Link>
          </span>
          <ThemeToggle />
        </div>

        <h2 className="pb-auth-title">С возвращением</h2>
        <p className="pb-auth-sub">Снег не ждёт — посмотрим, где он выпадет.</p>

        <form onSubmit={handleSubmit} className="pb-auth-fields">
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
                placeholder="••••••••"
              />
              <button type="button" className="pb-field-toggle" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'скрыть' : 'показать'}
              </button>
            </span>
          </label>
          {error && <div className="form-message error">{error}</div>}
          <button type="submit" className="btn btn-primary pb-auth-submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
