import type { Resort } from '../api/client'

/** Пилюли-бейджи трасс по цветам сложности (дизайн 4a) */
export default function TrailPills({ r }: { r: Resort }) {
  const items: [number | undefined, string][] = [
    [r.trails_green, 'green'],
    [r.trails_blue, 'blue'],
    [r.trails_red, 'red'],
    [r.trails_black, 'black'],
  ]
  return (
    <div className="trail-pills">
      {items.map(
        ([n, c]) =>
          n != null && (
            <span key={c} className={`trail-pill trail-pill-${c}`}>
              {n}
            </span>
          ),
      )}
    </div>
  )
}
