import { useTheme } from '../context/ThemeContext'

/**
 * Сцена hero из дизайна 7a: два слоя неба (рассвет/закат) с кроссфейдом,
 * падающий снег, звёзды, солнце с дугой перехода, гора с пинами.
 * Все цвета/позиции — из PowderBox.dc.html.
 */
export default function HeroSky() {
  const { theme, toggled } = useTheme()
  const dark = theme === 'dark'

  return (
    <>
      <div className="pb-sky pb-sky-dawn" />
      <div className="pb-sky pb-sky-dusk" />
      <span className="pb-snow" style={{ left: '14%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '12s' }} />
      <span className="pb-snow" style={{ left: '38%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '15s', animationDelay: '3s' }} />
      <span className="pb-snow" style={{ left: '57%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '13s', animationDelay: '6s' }} />
      <span className="pb-snow" style={{ left: '76%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '16s', animationDelay: '1s' }} />
      <span className="pb-snow" style={{ left: '92%', width: 3, height: 3, background: 'rgba(255,255,255,.7)', animationDuration: '14s', animationDelay: '8s' }} />
      <svg viewBox="0 0 1180 520" className="pb-scene" preserveAspectRatio="none" aria-hidden="true">
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
        <g className="pb-stars">
          <circle cx="285" cy="120" r="1.4" fill="#fff" opacity=".7" />
          <circle cx="450" cy="70" r="1.1" fill="#fff" opacity=".55" />
          <circle cx="700" cy="105" r="1.4" fill="#fff" opacity=".65" />
          <circle cx="905" cy="60" r="1.1" fill="#fff" opacity=".55" />
          <circle cx="1080" cy="130" r="1.4" fill="#fff" opacity=".6" />
          <circle cx="160" cy="55" r="1.1" fill="#fff" opacity=".5" />
          <circle cx="560" cy="160" r="1.1" fill="#fff" opacity=".45" />
          <circle cx="990" cy="200" r="1.2" fill="#fff" opacity=".45" />
        </g>
        <g
          style={{
            transform: dark ? 'translate(-580px, 14px)' : 'translate(0px, 0px)',
            animation: toggled ? `${dark ? 'pbSunSet' : 'pbSunRise'} 1.8s linear both` : 'none',
          }}
        >
          <g className="pb-sun pb-sun-dawn">
            <ellipse cx="880" cy="400" rx="340" ry="150" fill="url(#pbGlowD)" opacity=".55" />
            <ellipse cx="880" cy="400" rx="150" ry="82" fill="url(#pbGlowD)" opacity=".8" />
            <circle cx="880" cy="402" r="34" fill="url(#pbSunD)" />
          </g>
          <g className="pb-sun pb-sun-dusk">
            <ellipse cx="880" cy="400" rx="340" ry="150" fill="url(#pbGlowN)" opacity=".55" />
            <ellipse cx="880" cy="400" rx="150" ry="82" fill="url(#pbGlowN)" opacity=".8" />
            <circle cx="880" cy="402" r="34" fill="url(#pbSunN)" />
          </g>
        </g>
        <polygon className="pb-mtn" points="-10,520 -10,462 190,398 380,424 620,268 840,420 990,388 1190,452 1190,520" />
        <polyline className="pb-rim" points="-10,462 190,398 380,424 620,268 840,420 990,388 1190,452" fill="none" strokeWidth="2" />
        <circle cx="620" cy="268" r="5" fill="#fff" />
        <circle cx="620" cy="268" r="11" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out infinite', transformOrigin: '620px 268px' }} />
        <circle cx="497" cy="348" r="5" fill="#fff" />
        <circle cx="497" cy="348" r="11" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out .9s infinite', transformOrigin: '497px 348px' }} />
        <circle className="pb-pin-low" cx="240" cy="412" r="5" />
        <circle className="pb-pin-low-ring" cx="240" cy="412" r="11" fill="none" strokeWidth="1.5" opacity=".6" style={{ animation: 'pbPulse 2.6s ease-in-out 1.7s infinite', transformOrigin: '240px 412px' }} />
      </svg>
    </>
  )
}
