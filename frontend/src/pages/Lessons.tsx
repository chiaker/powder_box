import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, imageUrl, type Lesson } from '../api/client'
import { useAuth } from '../context/AuthContext'
import PageHead from '../components/PageHead'

const GEAR = [
  { value: 'ski', label: 'Лыжи' },
  { value: 'snowboard', label: 'Сноуборд' },
]

/** Уровни названы по цветам трасс — единая система с бейджами трасс (дизайн 11b) */
const LEVELS = [
  { value: 'beginner', label: 'Зелёные', color: 'var(--green)' },
  { value: 'intermediate', label: 'Красные', color: 'var(--danger)' },
  { value: 'advanced', label: 'Чёрные', color: 'var(--trail-black)' },
]

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Зелёные',
  intermediate: 'Красные',
  advanced: 'Чёрные',
}

const levelColor = (level?: string) =>
  LEVELS.find((l) => l.value === level)?.color ?? 'var(--text-3)'

function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <article className="pb-lesson">
      <a href={lesson.lesson_url} target="_blank" rel="noopener noreferrer" className="pb-lesson-preview">
        {lesson.preview_url ? (
          <img src={imageUrl(lesson.preview_url)} alt={`Превью урока: ${lesson.title}`} loading="lazy" />
        ) : (
          <span className="pb-lesson-preview-empty">ПРЕВЬЮ ВИДЕО</span>
        )}
        <span className="pb-lesson-play">▶</span>
      </a>
      <div className="pb-lesson-body">
        {lesson.category && <div className="pb-lesson-kicker">{lesson.category.toUpperCase()}</div>}
        <h3 className="pb-lesson-title">{lesson.title}</h3>
        <div className="pb-lesson-foot">
          <a
            href={lesson.lesson_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            ▶ Смотреть
          </a>
          {lesson.level && (
            <span className="pb-lesson-level">
              <span className="pb-level-dot" style={{ background: levelColor(lesson.level) }} />
              {LEVEL_LABELS[lesson.level] ?? lesson.level}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, token } = useAuth()
  const [gear, setGear] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)

  // Дефолты берём из профиля, клик по активной пилюле снимает фильтр
  const activeGear = gear ?? user?.equipment_type ?? ''
  const activeLevel = level ?? user?.level ?? ''

  useEffect(() => {
    api
      .get<Lesson[]>('/lessons')
      .then(setLessons)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [])

  const visibleLessons = useMemo(
    () =>
      lessons
        .filter((l) => !activeGear || l.category === activeGear)
        .filter((l) => !activeLevel || l.level === activeLevel),
    [lessons, activeGear, activeLevel],
  )

  // Подборка «под ваш профиль» — первые уроки вашего уровня и снаряжения
  const recommended = useMemo(() => {
    if (!token || !user?.equipment_type) return []
    return lessons
      .filter((l) => l.category === user.equipment_type)
      .filter((l) => !l.level || !user.level || l.level === user.level)
      .slice(0, 3)
  }, [lessons, token, user?.equipment_type, user?.level])

  const toggle = (cur: string, val: string, set: (v: string | null) => void) =>
    set(cur === val ? '' : val)

  if (loading) return <div className="page"><div className="loading">Загрузка уроков...</div></div>
  if (error) return <div className="page"><div className="error-state"><p>{error}</p></div></div>

  const gearLabel = activeGear === 'ski' ? 'ЛЫЖИ' : activeGear === 'snowboard' ? 'СНОУБОРД' : 'ВСЁ СНАРЯЖЕНИЕ'
  const levelLabel = activeLevel ? `УРОВЕНЬ ${(LEVEL_LABELS[activeLevel] ?? '').toUpperCase()}` : 'ЛЮБОЙ УРОВЕНЬ'

  return (
    <div className="pb-lessons">
      <PageHead
        kicker={`${gearLabel} · ${levelLabel}`}
        title="Уроки катания"
        right={
          <div className="pb-lessons-progress">
            <div className="pb-lessons-progress-label">ПОДБОРКА</div>
            <div className="pb-lessons-progress-main">
              <span className="pb-lessons-progress-num">{visibleLessons.length}</span>
              <span>из {lessons.length} уроков</span>
            </div>
            <div className="pb-lessons-progress-bar">
              <div
                style={{ width: `${lessons.length ? (visibleLessons.length / lessons.length) * 100 : 0}%` }}
              />
            </div>
            {!user?.equipment_type && (
              <div className="pb-lessons-progress-hint">
                <Link to="/profile">Укажите снаряжение в профиле</Link> — подберём под вас
              </div>
            )}
          </div>
        }
      />

      <div className="pb-page">
        <div className="pb-filterbar">
          <span className="mono-label">СНАРЯЖЕНИЕ</span>
          {GEAR.map((g) => (
            <button
              key={g.value}
              type="button"
              className={`pb-filter ${activeGear === g.value ? 'active' : ''}`}
              onClick={() => toggle(activeGear, g.value, setGear)}
            >
              {g.label}
            </button>
          ))}
          <span className="pb-filter-divider" />
          <span className="mono-label">УРОВЕНЬ</span>
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={`pb-filter ${activeLevel === l.value ? 'active' : ''}`}
              onClick={() => toggle(activeLevel, l.value, setLevel)}
            >
              <span className="pb-filter-dot" style={{ background: l.color }} />
              {l.label}
            </button>
          ))}
          <span className="pb-filter-count">
            Найдено <strong>{visibleLessons.length}</strong> уроков
          </span>
        </div>

        {recommended.length > 0 && (
          <section className="pb-section">
            <div className="pb-section-head">
              <h3>Под ваш профиль</h3>
              <span className="mono-label">
                {user?.equipment_type === 'ski' ? 'ЛЫЖИ' : 'СНОУБОРД'}
                {user?.level ? ` · ${(LEVEL_LABELS[user.level] ?? '').toUpperCase()}` : ''}
              </span>
            </div>
            <div className="pb-lessons-grid">
              {recommended.map((l) => <LessonCard key={l.id} lesson={l} />)}
            </div>
          </section>
        )}

        <section className="pb-section">
          <div className="pb-section-head">
            <h3>Все уроки</h3>
            <span className="mono-label">{visibleLessons.length} В ПОДБОРКЕ</span>
          </div>
          {visibleLessons.length === 0 ? (
            <div className="empty-state">
              <p>{lessons.length === 0 ? 'Уроков пока нет.' : 'Под выбранные фильтры уроков нет.'}</p>
            </div>
          ) : (
            <div className="pb-lessons-grid">
              {visibleLessons.map((l) => <LessonCard key={l.id} lesson={l} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
