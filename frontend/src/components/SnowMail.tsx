import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * «Снежная почта» (дизайн): plate — плашка с полем email,
 * strip — CTA-полоса внизу сравнения.
 * Авторизованным включает snow_alerts_enabled, гостей ведёт на регистрацию.
 */
export default function SnowMail({
  variant = 'plate',
  message,
}: {
  variant?: 'plate' | 'strip'
  message?: ReactNode
}) {
  const { user, token, refreshProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const subscribed = !!user?.snow_alerts_enabled

  const subscribe = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!token) {
      navigate(`/register${email ? `?email=${encodeURIComponent(email)}` : ''}`)
      return
    }
    setBusy(true)
    try {
      await api.put('/users/me', { snow_alerts_enabled: true })
      await refreshProfile()
      toast.show('Снежные алерты включены', 'success')
    } catch {
      toast.show('Не удалось включить алерты', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'strip') {
    return (
      <div className="snowmail-strip">
        <span className="pulse-dot pulse-dot-accent" />
        <span className="snowmail-strip-text">
          {message ?? 'Подпишитесь на алерты по этим курортам — письмо придёт за 48 часов до снегопада.'}
        </span>
        {subscribed ? (
          <Link to="/profile" className="btn btn-primary snowmail-strip-btn">Алерты включены ✓</Link>
        ) : (
          <button className="btn btn-primary snowmail-strip-btn" onClick={() => void subscribe()} disabled={busy}>
            Подписаться →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="snowmail-plate">
      <div className="snowmail-label">
        <span className="pulse-dot pulse-dot-accent" />
        СНЕЖНАЯ ПОЧТА
      </div>
      {subscribed ? (
        <>
          <p className="snowmail-text">
            <strong>Алерты включены.</strong> Порог — {user?.snow_alert_threshold_cm ?? 20} см снега.
          </p>
          <Link to="/profile" className="snowmail-link">Настроить порог →</Link>
        </>
      ) : (
        <>
          <p className="snowmail-text">
            {message ?? (
              <>
                <strong>«Через два дня выпадет 30 см».</strong> Письмо приходит раньше шторма.
              </>
            )}
          </p>
          <form className="snowmail-form" onSubmit={subscribe}>
            {!token && (
              <input
                type="email"
                className="snowmail-input"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            {token && <span className="snowmail-input snowmail-input-static">{user?.nickname || 'на вашу почту'}</span>}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Подписаться →
            </button>
          </form>
        </>
      )}
    </div>
  )
}
