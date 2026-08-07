import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext'

/** Гребень из дизайна 7a (макет 1180×520) и 9a (мобильный 390×420) */
const RIDGE_WIDE: [number, number][] = [
  [190, 398], [380, 424], [620, 268], [840, 420], [990, 388],
]
const RIDGE_NARROW: [number, number][] = [
  [70, 336], [140, 354], [215, 236], [300, 344], [350, 322],
]
const EDGE_WIDE = 457 // высота силуэта у края макета
const EDGE_NARROW = 372

/**
 * Сцена hero (дизайн 7a / 9a). Небо — CSS-градиенты во всю ширину,
 * солнце — отдельный слой с фиксированными пропорциями.
 *
 * Гора рисуется в натуральном масштабе: viewBox подгоняется под реальную
 * ширину, а к краям силуэт продолжается ровной полосой. Иначе на широком
 * экране склоны расплющивались.
 */
export default function HeroSky() {
  const { theme, toggled } = useTheme()
  const dark = theme === 'dark'
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1180)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const narrow = width <= 640
  const design = narrow ? 390 : 1180
  const height = narrow ? 420 : 520
  const edge = narrow ? EDGE_NARROW : EDGE_WIDE
  const ridge = narrow ? RIDGE_NARROW : RIDGE_WIDE

  // Шире макета — центрируем силуэт и достраиваем плоские «крылья»;
  // уже макета — сжимаем пропорционально ширине
  const scale = width >= design ? 1 : width / design
  const dx = Math.max(0, (width - design) / 2)
  const pts = ridge.map(([x, y]) => `${(x * scale + dx).toFixed(1)},${y}`)
  const ridgeLine = [`0,${edge}`, ...pts, `${width.toFixed(1)},${edge}`].join(' ')
  const mountain = `0,${height} ${ridgeLine} ${width.toFixed(1)},${height}`

  const pin = (x: number, y: number, delay: string, low = false) => {
    const cx = x * scale + dx
    return (
      <g key={`${x}-${y}`}>
        <circle className={low ? 'pb-pin-low' : ''} cx={cx} cy={y} r={narrow ? 4.5 : 5} fill={low ? undefined : '#fff'} />
        <circle
          className={low ? 'pb-pin-low-ring' : ''}
          cx={cx}
          cy={y}
          r={narrow ? 10 : 11}
          fill="none"
          stroke={low ? undefined : '#fff'}
          strokeWidth="1.5"
          opacity=".5"
          style={{ animation: `pbPulse 2.6s ease-in-out ${delay} infinite`, transformOrigin: `${cx}px ${y}px` }}
        />
      </g>
    )
  }

  const stars = narrow
    ? [[95, 118, 1.3, 0.6], [250, 72, 1.1, 0.5], [330, 140, 1.3, 0.55], [60, 60, 1.1, 0.45], [180, 160, 1.1, 0.4]]
    : [[285, 120, 1.4, 0.7], [450, 70, 1.1, 0.55], [700, 105, 1.4, 0.65], [905, 60, 1.1, 0.55],
       [1080, 130, 1.4, 0.6], [160, 55, 1.1, 0.5], [560, 160, 1.1, 0.45], [990, 200, 1.2, 0.45]]

  return (
    <div className="pb-scene-host" ref={ref}>
      <div className="pb-sky pb-sky-dawn" />
      <div className="pb-sky pb-sky-dusk" />
      <span className="pb-snow" style={{ left: '14%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '12s' }} />
      <span className="pb-snow" style={{ left: '38%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '15s', animationDelay: '3s' }} />
      <span className="pb-snow" style={{ left: '57%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '13s', animationDelay: '6s' }} />
      <span className="pb-snow" style={{ left: '76%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '16s', animationDelay: '1s' }} />
      <span className="pb-snow" style={{ left: '92%', width: 3, height: 3, background: 'rgba(255,255,255,.7)', animationDuration: '14s', animationDelay: '8s' }} />

      {/* Солнце: свои пропорции, дуга перехода — в CSS */}
      <div className="pb-sun-layer">
        <div className={`pb-sun-move${dark ? ' is-dark' : ''}${toggled ? ' is-animated' : ''}`}>
          <svg className="pb-sun-svg" viewBox="0 0 680 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <radialGradient id="pbGlowD" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffe8cc" stopOpacity=".9" />
                <stop offset="45%" stopColor="#f4c9a0" stopOpacity=".45" />
                <stop offset="100%" stopColor="#f4c9a0" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbSunD" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fffaf2" />
                <stop offset="62%" stopColor="#ffedd2" />
                <stop offset="100%" stopColor="#ffdda8" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbGlowN" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffd9a8" stopOpacity=".9" />
                <stop offset="45%" stopColor="#e89a66" stopOpacity=".45" />
                <stop offset="100%" stopColor="#e89a66" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbSunN" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff6e6" />
                <stop offset="62%" stopColor="#ffdfae" />
                <stop offset="100%" stopColor="#ffc987" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="pb-sun pb-sun-dawn">
              <ellipse cx="340" cy="148" rx="340" ry="150" fill="url(#pbGlowD)" opacity=".55" />
              <ellipse cx="340" cy="148" rx="150" ry="82" fill="url(#pbGlowD)" opacity=".8" />
              <circle cx="340" cy="150" r="34" fill="url(#pbSunD)" />
            </g>
            <g className="pb-sun pb-sun-dusk">
              <ellipse cx="340" cy="148" rx="340" ry="150" fill="url(#pbGlowN)" opacity=".55" />
              <ellipse cx="340" cy="148" rx="150" ry="82" fill="url(#pbGlowN)" opacity=".8" />
              <circle cx="340" cy="150" r="34" fill="url(#pbSunN)" />
            </g>
          </svg>
        </div>
      </div>

      {/* Гора: viewBox равен реальному размеру, поэтому силуэт не искажается */}
      <svg viewBox={`0 0 ${width} ${height}`} className="pb-scene" preserveAspectRatio="none" aria-hidden="true">
        <g className="pb-stars">
          {stars.map(([x, y, r, o]) => (
            <circle key={`${x}-${y}`} cx={x * scale + dx} cy={y} r={r} fill="#fff" opacity={o} />
          ))}
        </g>
        <polygon className="pb-mtn" points={mountain} />
        <polyline className="pb-rim" points={ridgeLine} fill="none" strokeWidth="2" />
        {narrow
          ? [pin(215, 236, '0s'), pin(258, 291, '.9s'), pin(140, 354, '1.7s', true)]
          : [pin(620, 268, '0s'), pin(497, 348, '.9s'), pin(240, 412, '1.7s', true)]}
      </svg>
    </div>
  )
}
