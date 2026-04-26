import { useEffect, useMemo, useState } from 'react'
import { api, type Resort, type SkipassTariff, type SkipassTariffCreate } from '../../api/client'
import { useToast } from '../../context/ToastContext'

type TariffFormState = {
  season_name: string
  season_start: string
  season_end: string
  age_category: 'child' | 'teen' | 'adult' | 'senior'
  access_type: 'day' | 'evening' | 'full'
  duration_days: string
  is_fast_track: boolean
  price: string
  currency: string
  is_active: boolean
}

function toForm(t?: SkipassTariff): TariffFormState {
  return {
    season_name: t?.season_name ?? '',
    season_start: t?.season_start ?? '',
    season_end: t?.season_end ?? '',
    age_category: t?.age_category ?? 'adult',
    access_type: t?.access_type ?? 'day',
    duration_days: t ? String(t.duration_days) : '1',
    is_fast_track: t?.is_fast_track ?? false,
    price: t ? String(t.price) : '',
    currency: t?.currency ?? 'RUB',
    is_active: t?.is_active ?? true,
  }
}

function getSeasonPresets() {
  const y = new Date().getFullYear()
  return [
    {
      id: 'high',
      label: 'Высокий сезон',
      season_name: 'Высокий сезон',
      season_start: `${y}-12-01`,
      season_end: `${y + 1}-03-31`,
    },
    {
      id: 'mid',
      label: 'Средний сезон',
      season_name: 'Средний сезон',
      season_start: `${y + 1}-01-15`,
      season_end: `${y + 1}-02-28`,
    },
    {
      id: 'low',
      label: 'Низкий сезон',
      season_name: 'Низкий сезон',
      season_start: `${y + 1}-04-01`,
      season_end: `${y + 1}-05-15`,
    },
  ] as const
}

export default function AdminSkipasses() {
  const toast = useToast()
  const [resorts, setResorts] = useState<Resort[]>([])
  const [selectedResortId, setSelectedResortId] = useState<number | null>(null)
  const [tariffs, setTariffs] = useState<SkipassTariff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SkipassTariff | null>(null)
  const [form, setForm] = useState<TariffFormState>(toForm())
  const seasonPresets = useMemo(() => getSeasonPresets(), [])

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

  const loadTariffs = async (resortId: number) => {
    const list = await api.get<SkipassTariff[]>(`/skipasses?resort_id=${resortId}`)
    setTariffs(list)
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
      setTariffs([])
      return
    }
    void loadTariffs(selectedResortId).catch((e) =>
      toast.show(e instanceof Error ? e.message : 'Ошибка загрузки тарифов', 'error')
    )
  }, [selectedResortId])

  const resetForm = () => {
    setEditing(null)
    setForm(toForm())
  }

  const toPayload = (): SkipassTariffCreate => {
    return {
      season_name: form.season_name.trim(),
      season_start: form.season_start,
      season_end: form.season_end,
      age_category: form.age_category,
      access_type: form.access_type,
      duration_days: Number(form.duration_days),
      is_fast_track: form.is_fast_track,
      price: Number(form.price),
      currency: form.currency.trim().toUpperCase(),
      is_active: form.is_active,
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedResortId) return
    setSaving(true)
    try {
      const body = toPayload()
      if (!body.season_name || !body.season_start || !body.season_end || Number.isNaN(body.duration_days) || Number.isNaN(body.price)) {
        throw new Error('Заполните форму корректно')
      }
      if (editing) {
        await api.patch(`/skipasses/${editing.id}`, body)
      } else {
        await api.post(`/skipasses/resort/${selectedResortId}`, body)
      }
      await loadTariffs(selectedResortId)
      resetForm()
      toast.show('Тариф сохранен', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Ошибка сохранения тарифа', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (tariff: SkipassTariff) => {
    setEditing(tariff)
    setForm(toForm(tariff))
  }

  const onDelete = async (tariff: SkipassTariff) => {
    if (!confirm(`Удалить тариф "${tariff.season_name}"?`)) return
    if (!selectedResortId) return
    try {
      await api.delete(`/skipasses/${tariff.id}`)
      await loadTariffs(selectedResortId)
      if (editing?.id === tariff.id) resetForm()
      toast.show('Тариф удален', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Ошибка удаления тарифа', 'error')
    }
  }

  const applySeasonPreset = (presetId: string) => {
    const preset = seasonPresets.find((x) => x.id === presetId)
    if (!preset) return
    setForm((prev) => ({
      ...prev,
      season_name: preset.season_name,
      season_start: preset.season_start,
      season_end: preset.season_end,
    }))
  }

  const createAgeGrid = async () => {
    if (!selectedResortId) return
    const basePrice = Number(form.price)
    if (Number.isNaN(basePrice) || basePrice <= 0) {
      toast.show('Сначала укажите базовую цену для взрослого тарифа', 'info')
      return
    }
    if (!form.season_name || !form.season_start || !form.season_end) {
      toast.show('Сначала заполните сезон (или выберите пресет)', 'info')
      return
    }
    setSaving(true)
    try {
      const rows: Array<Pick<SkipassTariffCreate, 'age_category' | 'price'>> = [
        { age_category: 'child', price: Math.round(basePrice * 0.55 * 100) / 100 },
        { age_category: 'teen', price: Math.round(basePrice * 0.75 * 100) / 100 },
        { age_category: 'adult', price: basePrice },
        { age_category: 'senior', price: Math.round(basePrice * 0.85 * 100) / 100 },
      ]

      await Promise.all(
        rows.map((row) =>
          api.post(`/skipasses/resort/${selectedResortId}`, {
            season_name: form.season_name.trim(),
            season_start: form.season_start,
            season_end: form.season_end,
            age_category: row.age_category,
            access_type: form.access_type,
            duration_days: Number(form.duration_days),
            is_fast_track: form.is_fast_track,
            price: row.price,
            currency: form.currency.trim().toUpperCase(),
            is_active: form.is_active,
          } satisfies SkipassTariffCreate)
        )
      )
      await loadTariffs(selectedResortId)
      toast.show('Создана сетка тарифов для 4 возрастных категорий', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Ошибка пакетного создания тарифов', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="admin-page"><div className="loading">Загрузка...</div></div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Скипассы</h1>
      </header>

      <form className="admin-form" onSubmit={onSubmit}>
        <h3>{editing ? 'Редактирование тарифа' : 'Новый тариф'}</h3>
        <div className="form-actions">
          {seasonPresets.map((preset) => (
            <button key={preset.id} type="button" className="btn btn-outline btn-sm" onClick={() => applySeasonPreset(preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
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

          <label>Сезон *</label>
          <input value={form.season_name} onChange={(e) => setForm({ ...form, season_name: e.target.value })} required placeholder="Высокий сезон" />

          <label>Сезон с *</label>
          <input type="date" value={form.season_start} onChange={(e) => setForm({ ...form, season_start: e.target.value })} required />

          <label>Сезон по *</label>
          <input type="date" value={form.season_end} onChange={(e) => setForm({ ...form, season_end: e.target.value })} required />

          <label>Возраст *</label>
          <select value={form.age_category} onChange={(e) => setForm({ ...form, age_category: e.target.value as TariffFormState['age_category'] })}>
            <option value="child">Ребенок</option>
            <option value="teen">Подросток</option>
            <option value="adult">Взрослый</option>
            <option value="senior">Пенсионер</option>
          </select>

          <label>Тип катания *</label>
          <select value={form.access_type} onChange={(e) => setForm({ ...form, access_type: e.target.value as TariffFormState['access_type'] })}>
            <option value="day">Дневной</option>
            <option value="evening">Вечерний</option>
            <option value="full">Полный день</option>
          </select>

          <label>Дней *</label>
          <input type="number" min={1} max={30} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} required />

          <label>Fast Track</label>
          <input type="checkbox" checked={form.is_fast_track} onChange={(e) => setForm({ ...form, is_fast_track: e.target.checked })} />

          <label>Цена *</label>
          <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />

          <label>Валюта *</label>
          <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={8} required />

          <label>Активен</label>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
        </div>
        <div className="form-actions">
          {!editing && (
            <button type="button" className="btn btn-outline" onClick={createAgeGrid} disabled={saving || !selectedResortId}>
              + Создать сетку 4 категорий
            </button>
          )}
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Сбросить редактирование
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving || !selectedResortId}>
            {saving ? 'Сохранение...' : editing ? 'Обновить тариф' : 'Добавить тариф'}
          </button>
        </div>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Курорт</th>
              <th>Сезон</th>
              <th>Категория</th>
              <th>Тип</th>
              <th>Дней</th>
              <th>Fast</th>
              <th>Цена</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tariffs.length === 0 ? (
              <tr>
                <td colSpan={9}>Для курорта пока нет тарифов</td>
              </tr>
            ) : (
              tariffs.map((tariff) => (
                <tr key={tariff.id}>
                  <td>{tariff.id}</td>
                  <td>{selectedResort?.name ?? tariff.resort_id}</td>
                  <td>{tariff.season_name}</td>
                  <td>{tariff.age_category}</td>
                  <td>{tariff.access_type}</td>
                  <td>{tariff.duration_days}</td>
                  <td>{tariff.is_fast_track ? 'Да' : 'Нет'}</td>
                  <td>{tariff.price} {tariff.currency}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => onEdit(tariff)}>Изменить</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(tariff)}>Удалить</button>
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
