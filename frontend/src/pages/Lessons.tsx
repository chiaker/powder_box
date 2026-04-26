import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Lesson } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { user } = useAuth()

  const equipmentFilter = user?.equipment_type || undefined

  useEffect(() => {
    const url = equipmentFilter
      ? `/lessons?category=${equipmentFilter}`
      : '/lessons'
    api
      .get<Lesson[]>(url)
      .then(setLessons)
      .catch((e) => {
        const msg = e instanceof ApiError && e.status === 401
          ? 'Вам нужно авторизоваться для просмотра'
          : e instanceof Error ? e.message : 'Ошибка загрузки'
        setError(msg)
        if (e instanceof ApiError && e.status === 401) {
          toast.show('Вам нужно авторизоваться для просмотра уроков', 'info')
        }
      })
      .finally(() => setLoading(false))
  }, [toast, equipmentFilter])

  if (loading) return <div className="page"><div className="loading">Загрузка уроков...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state">
        <p>{error}</p>
        {error.includes('авторизоваться') && (
          <Link to="/login" className="btn btn-primary">Войти</Link>
        )}
      </div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1>Уроки катания</h1>
        <p>
          {equipmentFilter ? (
            <>Видео-уроки для <strong>{equipmentFilter === 'ski' ? 'лыжников' : 'сноубордистов'}</strong></>
          ) : (
            <>Видео-уроки и мастер-классы. <Link to="/profile">Укажите тип снаряжения в профиле</Link>, чтобы видеть подходящие уроки.</>
          )}
        </p>
      </header>

      <div className="lesson-grid">
        {lessons.length === 0 ? (
          <div className="empty-state">
            <p>
              {equipmentFilter
                ? `Уроков для ${equipmentFilter === 'ski' ? 'лыжников' : 'сноубордистов'} пока нет.`
                : 'Уроков пока нет. Добавьте данные через API.'}
            </p>
            {!equipmentFilter && <Link to="/profile">Настроить профиль</Link>}
          </div>
        ) : (
          lessons.map((l) => {
            const preview = l.preview_url
            return (
              <div key={l.id} className="lesson-card">
                {preview && (
                  <img
                    src={preview}
                    alt={`Превью урока: ${l.title}`}
                    className="lesson-preview"
                    loading="lazy"
                  />
                )}
                <h3>{l.title}</h3>
                <div className="lesson-card-footer">
                  <a
                    href={l.lesson_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    Смотреть видео →
                  </a>
                  {l.category && <span className="lesson-category">{l.category}</span>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
