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
 * Индекс лучшего дня для катания в прогнозе (-1 если прогноза нет).
 * ponytail: наивная эвристика, веса на глаз — уточнить по фидбеку:
 * свежий снег накануне и в день — хорошо, дождь (осадки в плюс) — плохо,
 * ветер свыше 10 м/с — штраф.
 */
export function bestDayIndex(days: AltitudeDailyEntry[]): number {
  if (!days.length) return -1
  let best = 0
  let bestScore = -Infinity
  for (let i = 0; i < days.length; i++) {
    const freshSnow = (i > 0 ? days[i - 1].snowfall || 0 : 0) + (days[i].snowfall || 0)
    const rain = days[i].maxTemperature > 0 ? days[i].precipitation || 0 : 0
    const score = 2 * Math.min(freshSnow, 20) - 2 * rain - Math.max(0, days[i].windSpeed - 10)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}
