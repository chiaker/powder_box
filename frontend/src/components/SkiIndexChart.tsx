import type { AltitudeDailyEntry } from '../api/client'
import { dayScores, bestDayIndex, dayShort } from '../utils/weather'

/** Столбиковый «индекс катания» на 7 дней (дизайн 5a, левая колонка) */
export default function SkiIndexChart({ days }: { days: AltitudeDailyEntry[] }) {
  const scores = dayScores(days)
  const best = bestDayIndex(days)
  return (
    <div className="ski-chart">
      {days.map((d, i) => (
        <div key={d.date} className="ski-chart-col" title={`${scores[i]} /10`}>
          <div
            className={`ski-chart-bar ${i === best ? 'best' : scores[i] >= 7 ? 'mid' : ''}`}
            style={{ height: `${Math.max(8, scores[i] * 9.2)}%` }}
          />
          <div className={`ski-chart-day ${i === best ? 'best' : ''}`}>{dayShort(d.date)}</div>
        </div>
      ))}
    </div>
  )
}
