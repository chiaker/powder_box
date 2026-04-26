import { useEffect, useMemo, useState } from 'react'
import { api, type AltitudePoint, type Resort } from '../../api/client'
import { useToast } from '../../context/ToastContext'

type PointFormState = {
  name: string
  altitude_m: string
  latitude: string
  longitude: string
  is_active: boolean
}

function toForm(point?: AltitudePoint): PointFormState {
  return {
    name: point?.name ?? '',
    altitude_m: point ? String(point.altitude_m) : '',
    latitude: point ? String(point.latitude) : '',
    longitude: point ? String(point.longitude) : '',
    is_active: point?.is_active ?? true,
  }
}

export default function AdminWeatherPoints() {
  const toast = useToast()
  const [resorts, setResorts] = useState<Resort[]>([])
  const [selectedResortId, setSelectedResortId] = useState<number | null>(null)
  const [points, setPoints] = useState<AltitudePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<AltitudePoint | null>(null)
  const [form, setForm] = useState<PointFormState>(toForm())

  const selectedResort = useMemo(
    () => resorts.find((r) => r.id === selectedResortId) ?? null,
    [resorts, selectedResortId]
  )

  const loadResorts = async () => {
    const list = await api.get<Resort[]>('/resorts')
    setResorts(list)
    if (!selectedResortId && list.length > 0) {
      setSelectedResortId(list[0].id)
    }
  }

  const loadPoints = async (resortId: number) => {
    const list = await api.get<AltitudePoint[]>(`/weather/${resortId}/altitude-points`)
    setPoints(list)
  }

  useEffect(() => {
    const init = async () => {
      try {
        await loadResorts()
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Ошибка загрузки курортов', 'error')
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [])

  useEffect(() => {
    if (!selectedResortId) {
      setPoints([])
      return
    }
    void loadPoints(selectedResortId).catch((e) =>
      toast.show(e instanceof Error ? e.message : 'Ошибка загрузки точек', 'error')
    )
  }, [selectedResortId])

  const resetForm = () => {
    setEditing(null)
    setForm(toForm())
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedResortId) return
    if (points.length >= 4 && !editing) {
      toast.show('Для курорта можно добавить максимум 4 точки', 'info')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        altitude_m: Number(form.altitude_m),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        is_active: form.is_active,
      }
      if (!body.name || Number.isNaN(body.altitude_m) || Number.isNaN(body.latitude) || Number.isNaN(body.longitude)) {
        throw new Error('Заполните все поля точки корректно')
      }
      if (editing) {
        await api.patch(`/weather/altitude-points/${editing.id}`, body)
      } else {
        await api.post(`/weather/${selectedResortId}/altitude-points`, body)
      }
      await loadPoints(selectedResortId)
      resetForm()
      toast.show('Точка сохранена', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Ошибка сохранения точки', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (point: AltitudePoint) => {
    setEditing(point)
    setForm(toForm(point))
  }

  const onDelete = async (point: AltitudePoint) => {
    if (!confirm(`Удалить точку "${point.name}"?`)) return
    if (!selectedResortId) return
    try {
      await api.delete(`/weather/altitude-points/${point.id}`)
      await loadPoints(selectedResortId)
      if (editing?.id === point.id) resetForm()
      toast.show('Точка удалена', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Ошибка удаления точки', 'error')
    }
  }

  if (loading) return <div className="admin-page"><div className="loading">Загрузка...</div></div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Погода по высотам</h1>
      </header>

      <form className="admin-form" onSubmit={onSubmit}>
        <h3>{editing ? 'Редактирование точки' : 'Новая высотная точка'}</h3>
        <div className="form-grid">
          <label>Курорт *</label>
          <select
            value={selectedResortId ?? ''}
            onChange={(e) => {
              const nextId = Number(e.target.value)
              setSelectedResortId(Number.isNaN(nextId) ? null : nextId)
              resetForm()
            }}
            required
          >
            <option value="" disabled>Выберите курорт</option>
            {resorts.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          <label>Название точки *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Нижняя станция"
            required
          />

          <label>Высота (м) *</label>
          <input
            type="number"
            value={form.altitude_m}
            onChange={(e) => setForm({ ...form, altitude_m: e.target.value })}
            required
          />

          <label>Широта *</label>
          <input
            type="number"
            step="0.000001"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            required
          />

          <label>Долгота *</label>
          <input
            type="number"
            step="0.000001"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            required
          />

          <label>Активна</label>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
        </div>
        <p className="form-hint">
          Для каждого курорта можно держать до 4 активных точек высоты.
        </p>
        <div className="form-actions">
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Сбросить редактирование
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving || !selectedResortId}>
            {saving ? 'Сохранение...' : editing ? 'Обновить точку' : 'Добавить точку'}
          </button>
        </div>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Курорт</th>
              <th>Точка</th>
              <th>Высота</th>
              <th>Координаты</th>
              <th>Активна</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {points.length === 0 ? (
              <tr>
                <td colSpan={7}>Для курорта пока нет высотных точек</td>
              </tr>
            ) : (
              points.map((point) => (
                <tr key={point.id}>
                  <td>{point.id}</td>
                  <td>{selectedResort?.name ?? point.resort_id}</td>
                  <td>{point.name}</td>
                  <td>{point.altitude_m} м</td>
                  <td>{point.latitude}, {point.longitude}</td>
                  <td>{point.is_active ? 'Да' : 'Нет'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => onEdit(point)}>Изменить</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(point)}>Удалить</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
