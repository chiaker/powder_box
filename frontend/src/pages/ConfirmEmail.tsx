import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'

export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('В ссылке нет токена подтверждения')
      return
    }
    api
      .post('/auth/confirm', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error')
        setError(err instanceof ApiError ? err.message : 'Не удалось подтвердить email')
      })
  }, [token])

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>Подтверждение email</h1>
        {status === 'pending' && <p className="auth-subtitle">Подтверждаем...</p>}
        {status === 'success' && (
          <>
            <p className="auth-subtitle">Email подтверждён! Теперь вам доступны снежные алерты и уведомления.</p>
            <Link to="/profile" className="btn btn-primary btn-block">Перейти в профиль</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="form-message error">{error}</div>
            <p className="auth-footer">
              Запросить новое письмо можно в <Link to="/profile">профиле</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
