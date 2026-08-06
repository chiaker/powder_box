import { useTheme } from '../context/ThemeContext'

/**
 * Сцена hero из дизайна 7a (десктоп) и 9a (мобильный).
 * Небо — CSS-градиенты во всю ширину; солнце вынесено в отдельный слой
 * с фиксированными пропорциями (иначе на широком экране оно становится овалом);
 * гора ограничена по ширине, к краям экрана её продолжает полоса .pb-hero::after.
 */
export default function HeroSky() {
  const { theme, toggled } = useTheme()
  const dark = theme === 'dark'

  const sunGradients = (id: string) => (
    <defs>
      <radialGradient id={`pbGlowD${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffe8cc" stopOpacity=".9" />
        <stop offset="45%" stopColor="#f4c9a0" stopOpacity=".45" />
        <stop offset="100%" stopColor="#f4c9a0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`pbSunD${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fffaf2" />
        <stop offset="62%" stopColor="#ffedd2" />
        <stop offset="100%" stopColor="#ffdda8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`pbGlowN${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffd9a8" stopOpacity=".9" />
        <stop offset="45%" stopColor="#e89a66" stopOpacity=".45" />
        <stop offset="100%" stopColor="#e89a66" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`pbSunN${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fff6e6" />
        <stop offset="62%" stopColor="#ffdfae" />
        <stop offset="100%" stopColor="#ffc987" stopOpacity="0" />
      </radialGradient>
    </defs>
  )

  return (
    <>
      <div className="pb-sky pb-sky-dawn" />
      <div className="pb-sky pb-sky-dusk" />
      <span className="pb-snow" style={{ left: '14%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '12s' }} />
      <span className="pb-snow" style={{ left: '38%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '15s', animationDelay: '3s' }} />
      <span className="pb-snow" style={{ left: '57%', width: 3, height: 3, background: 'rgba(255,255,255,.8)', animationDuration: '13s', animationDelay: '6s' }} />
      <span className="pb-snow" style={{ left: '76%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '16s', animationDelay: '1s' }} />
      <span className="pb-snow" style={{ left: '92%', width: 3, height: 3, background: 'rgba(255,255,255,.7)', animationDuration: '14s', animationDelay: '8s' }} />

      {/* Солнце: свои пропорции, дуга перехода — в CSS (pbSunSet/pbSunRise, на мобильном ...M) */}
      <div className="pb-sun-layer">
        <div className={`pb-sun-move${dark ? ' is-dark' : ''}${toggled ? ' is-animated' : ''}`}>
          <svg className="pb-sun-svg" viewBox="0 0 680 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            {sunGradients('s')}
            <g className="pb-sun pb-sun-dawn">
              <ellipse cx="340" cy="148" rx="340" ry="150" fill="url(#pbGlowDs)" opacity=".55" />
              <ellipse cx="340" cy="148" rx="150" ry="82" fill="url(#pbGlowDs)" opacity=".8" />
              <circle cx="340" cy="150" r="34" fill="url(#pbSunDs)" />
            </g>
            <g className="pb-sun pb-sun-dusk">
              <ellipse cx="340" cy="148" rx="340" ry="150" fill="url(#pbGlowNs)" opacity=".55" />
              <ellipse cx="340" cy="148" rx="150" ry="82" fill="url(#pbGlowNs)" opacity=".8" />
              <circle cx="340" cy="150" r="34" fill="url(#pbSunNs)" />
            </g>
          </svg>
        </div>
      </div>

      {/* Гора и звёзды: десктопная сцена */}
      <svg viewBox="0 0 1180 520" className="pb-scene pb-scene-wide" preserveAspectRatio="none" aria-hidden="true">
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
        {/* края выровнены на y=457, чтобы стыковаться с полосой .pb-hero::after */}
        <polygon className="pb-mtn" points="-10,520 -10,457 190,398 380,424 620,268 840,420 990,388 1190,457 1190,520" />
        <polyline className="pb-rim" points="-10,457 190,398 380,424 620,268 840,420 990,388 1190,457" fill="none" strokeWidth="2" />
        <circle cx="620" cy="268" r="5" fill="#fff" />
        <circle cx="620" cy="268" r="11" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out infinite', transformOrigin: '620px 268px' }} />
        <circle cx="497" cy="348" r="5" fill="#fff" />
        <circle cx="497" cy="348" r="11" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out .9s infinite', transformOrigin: '497px 348px' }} />
        <circle className="pb-pin-low" cx="240" cy="412" r="5" />
        <circle className="pb-pin-low-ring" cx="240" cy="412" r="11" fill="none" strokeWidth="1.5" opacity=".6" style={{ animation: 'pbPulse 2.6s ease-in-out 1.7s infinite', transformOrigin: '240px 412px' }} />
      </svg>

      {/* Гора и звёзды: мобильная сцена (экран 9a) */}
      <svg viewBox="0 0 390 420" className="pb-scene pb-scene-narrow" preserveAspectRatio="none" aria-hidden="true">
        <g className="pb-stars">
          <circle cx="95" cy="118" r="1.3" fill="#fff" opacity=".6" />
          <circle cx="250" cy="72" r="1.1" fill="#fff" opacity=".5" />
          <circle cx="330" cy="140" r="1.3" fill="#fff" opacity=".55" />
          <circle cx="60" cy="60" r="1.1" fill="#fff" opacity=".45" />
          <circle cx="180" cy="160" r="1.1" fill="#fff" opacity=".4" />
        </g>
        <polygon className="pb-mtn" points="-10,420 -10,372 70,336 140,354 215,236 300,344 350,322 400,372 400,420" />
        <polyline className="pb-rim" points="-10,372 70,336 140,354 215,236 300,344 350,322 400,372" fill="none" strokeWidth="2" />
        <circle cx="215" cy="236" r="4.5" fill="#fff" />
        <circle cx="215" cy="236" r="10" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out infinite', transformOrigin: '215px 236px' }} />
        <circle cx="258" cy="291" r="4.5" fill="#fff" />
        <circle cx="258" cy="291" r="10" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out .9s infinite', transformOrigin: '258px 291px' }} />
        <circle className="pb-pin-low" cx="140" cy="354" r="4.5" />
        <circle className="pb-pin-low-ring" cx="140" cy="354" r="10" fill="none" strokeWidth="1.4" opacity=".6" style={{ animation: 'pbPulse 2.6s ease-in-out 1.7s infinite', transformOrigin: '140px 354px' }} />
      </svg>
    </>
  )
}
