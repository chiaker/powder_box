import type { AltitudeDailyEntry } from '../api/client'

/**
 * Иконка по текстовому condition из weather-service.
 * Проверка подстрок в порядке приоритета — покрывает весь словарь
 * weather_condition_from_code семью правилами.
 */
export function weatherIcon(condition: string): string {
  const c = condition.toLowerCase()
  if (c.includes('гроза')) return '⛈️'
  if (c.includes('снеж') || c.includes('снег')) return '🌨️'
  if (c.includes('ливень') || c.includes('дождь') || c.includes('морось')) return '🌧️'
  if (c.includes('туман') || c.includes('изморозь')) return '🌫️'
  if (c.includes('пасмурно')) return '☁️'
  if (c.includes('облачн')) return '⛅'
  if (c.includes('ясно')) return '☀️'
  return '🌡️'
}

/** Сумма снега (см) за первые n дней прогноза */
export function snowSum(days: AltitudeDailyEntry[], n = 3): number {
  const sum = days.slice(0, n).reduce((acc, d) => acc + (d.snowfall || 0), 0)
  return Math.round(sum * 10) / 10
}

/**
 * Оценка каждого дня 0..10 («индекс катания»).
 * ponytail: наивная эвристика, веса на глаз — уточнить по фидбеку:
 * свежий снег накануне и в день — хорошо, дождь (осадки в плюс) — плохо,
 * ветер свыше 10 м/с — штраф. Нормировка сырого балла линейная (5 + raw/8).
 */
export function dayScores(days: AltitudeDailyEntry[]): number[] {
  return days.map((d, i) => {
    const freshSnow = (i > 0 ? days[i - 1].snowfall || 0 : 0) + (d.snowfall || 0)
    const rain = d.maxTemperature > 0 ? d.precipitation || 0 : 0
    const raw = 2 * Math.min(freshSnow, 20) - 2 * rain - Math.max(0, d.windSpeed - 10)
    return Math.round(Math.min(10, Math.max(0, 5 + raw / 8)) * 10) / 10
  })
}

/** Индекс лучшего дня для катания в прогнозе (-1 если прогноза нет) */
export function bestDayIndex(days: AltitudeDailyEntry[]): number {
  const scores = dayScores(days)
  if (!scores.length) return -1
  return scores.indexOf(Math.max(...scores))
}

const DAY_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const DAY_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

/** Короткая метка дня недели: ПН…ВС */
export function dayShort(dateStr: string): string {
  return DAY_SHORT[new Date(dateStr).getDay()] ?? ''
}

/** Имя дня недели, «Сегодня» для текущей даты */
export function dayName(dateStr: string): string {
  const d = new Date(dateStr)
  if (d.toDateString() === new Date().toDateString()) return 'Сегодня'
  return DAY_FULL[d.getDay()] ?? ''
}
