import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, imageUrl, type Lesson } from '../api/client'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = [
  { value: '', label: 'Все' },
  { value: 'ski', label: 'Лыжи' },
  { value: 'snowboard', label: 'Сноуборд' },
  { value: 'freestyle', label: 'Фристайл' },
  { value: 'safety', label: 'Безопасность' },
]

const LEVELS = [
  { value: '', label: 'Любой уровень' },
  { value: 'beginner', label: 'Новичок' },
  { value: 'intermediate', label: 'Средний' },
  { value: 'advanced', label: 'Продвинутый' },
]

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <div className="lesson-card">
      {lesson.preview_url && (
        <img
          src={imageUrl(lesson.preview_url)}
          alt={`Превью урока: ${lesson.title}`}
          className="lesson-preview"
          loading="lazy"
        />
      )}
      <h3>{lesson.title}</h3>
      <div className="lesson-card-footer">
        <a
          href={lesson.lesson_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm"
        >
          Смотреть видео →
        </a>
        <span>
          {lesson.category && <span className="lesson-category">{lesson.category}</span>}
          {lesson.level && <span className="lesson-category"> {LEVEL_LABELS[lesson.level] ?? lesson.level}</span>}
        </span>
      </div>
    </div>
  )
}

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, token } = useAuth()
  const [category, setCategory] = useState<string | null>(null)
  const [level, setLevel] = useState('')

  // Дефолт категории — тип снаряжения из профиля (снимается кликом по «Все»)
  const activeCategory = category ?? user?.equipment_type ?? ''

  useEffect(() => {
    api
      .get<Lesson[]>('/lessons')
      .then(setLessons)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [])

  const visibleLessons = useMemo(
    () => lessons
      .filter((l) => !activeCategory || l.category === activeCategory)
      .filter((l) => !level || l.level === level),
    [lessons, activeCategory, level]
  )

  const recommended = useMemo(() => {
    if (!token || !user?.equipment_type) return []
    return lessons
      .filter((l) => l.category === user.equipment_type)
      .filter((l) => !l.level || !user.level || l.level === user.level)
      .slice(0, 3)
  }, [lessons, token, user?.equipment_type, user?.level])

  if (loading) return <div className="page"><div className="loading">Загрузка уроков...</div></div>
  if (error) return (
    <div className="page">
      <div className="error-state"><p>{error}</p></div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1>Уроки катания</h1>
        <p>
          Видео-уроки и мастер-классы от райдеров и инструкторов.{' '}
          {!user?.equipment_type && <Link to="/profile">Укажите тип снаряжения в профиле</Link>}
        </p>
      </header>

      {recommended.length > 0 && (
        <section className="favorites-section">
          <h2>Рекомендовано вам</h2>
          <p className="section-hint">
            По вашему профилю: {user?.equipment_type === 'ski' ? 'лыжи' : 'сноуборд'}
            {user?.level ? `, уровень «${LEVEL_LABELS[user.level] ?? user.level}»` : ''}
          </p>
          <div className="lesson-grid">
            {recommended.map((l) => <LessonCard key={l.id} lesson={l} />)}
          </div>
        </section>
      )}

      <div className="weather-mode-switch">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`btn btn-sm ${activeCategory === c.value ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="weather-mode-switch">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`btn btn-sm ${level === l.value ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLevel(l.value)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="lesson-grid">
        {visibleLessons.length === 0 ? (
          <div className="empty-state">
            <p>{lessons.length === 0 ? 'Уроков пока нет.' : 'Под выбранные фильтры уроков нет.'}</p>
          </div>
        ) : (
          visibleLessons.map((l) => <LessonCard key={l.id} lesson={l} />)
        )}
      </div>
    </div>
  )
}
