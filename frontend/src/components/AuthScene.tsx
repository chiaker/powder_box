import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'

/**
 * Левая половина экранов входа и регистрации (дизайн 12a/12b):
 * небо с кроссфейдом, падающий снег, силуэт горы и солнце на своей дуге.
 */
export default function AuthScene() {
  const { theme, toggled } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="pb-auth-scene">
      <div className="pb-sky pb-auth-sky-dawn" />
      <div className="pb-sky pb-auth-sky-dusk" />
      <span className="pb-snow" style={{ left: '22%', width: 3, height: 3, background: 'rgba(255,255,255,.75)', animationDuration: '14s' }} />
      <span className="pb-snow" style={{ left: '58%', width: 2, height: 2, background: 'rgba(255,255,255,.6)', animationDuration: '17s', animationDelay: '5s' }} />
      <span className="pb-snow" style={{ left: '84%', width: 3, height: 3, background: 'rgba(255,255,255,.7)', animationDuration: '15s', animationDelay: '9s' }} />

      <div className="pb-sun-layer pb-auth-sun">
        <div className={`pb-sun-move is-auth${dark ? ' is-dark' : ''}${toggled ? ' is-animated' : ''}`}>
          <svg className="pb-sun-svg" viewBox="0 0 500 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <radialGradient id="pbGlowAd" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffe8cc" stopOpacity=".9" />
                <stop offset="45%" stopColor="#f4c9a0" stopOpacity=".45" />
                <stop offset="100%" stopColor="#f4c9a0" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbSunAd" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fffaf2" />
                <stop offset="62%" stopColor="#ffedd2" />
                <stop offset="100%" stopColor="#ffdda8" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbGlowAn" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffd9a8" stopOpacity=".9" />
                <stop offset="45%" stopColor="#e89a66" stopOpacity=".45" />
                <stop offset="100%" stopColor="#e89a66" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pbSunAn" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff6e6" />
                <stop offset="62%" stopColor="#ffdfae" />
                <stop offset="100%" stopColor="#ffc987" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="pb-sun pb-sun-dawn">
              <ellipse cx="250" cy="118" rx="250" ry="120" fill="url(#pbGlowAd)" opacity=".55" />
              <ellipse cx="250" cy="118" rx="112" ry="66" fill="url(#pbGlowAd)" opacity=".8" />
              <circle cx="250" cy="120" r="28" fill="url(#pbSunAd)" />
            </g>
            <g className="pb-sun pb-sun-dusk">
              <ellipse cx="250" cy="118" rx="250" ry="120" fill="url(#pbGlowAn)" opacity=".55" />
              <ellipse cx="250" cy="118" rx="112" ry="66" fill="url(#pbGlowAn)" opacity=".8" />
              <circle cx="250" cy="120" r="28" fill="url(#pbSunAn)" />
            </g>
          </svg>
        </div>
      </div>

      <svg viewBox="0 0 710 620" className="pb-scene pb-auth-mtn" preserveAspectRatio="none" aria-hidden="true">
        <g className="pb-stars">
          <circle cx="120" cy="96" r="1.3" fill="#fff" opacity=".6" />
          <circle cx="300" cy="58" r="1.1" fill="#fff" opacity=".5" />
          <circle cx="470" cy="120" r="1.3" fill="#fff" opacity=".55" />
          <circle cx="620" cy="72" r="1.1" fill="#fff" opacity=".45" />
          <circle cx="210" cy="180" r="1.1" fill="#fff" opacity=".4" />
        </g>
        <polygon className="pb-mtn" points="-10,620 -10,520 110,470 240,498 400,330 540,478 620,442 720,500 720,620" />
        <polyline className="pb-rim" points="-10,520 110,470 240,498 400,330 540,478 620,442 720,500" fill="none" strokeWidth="2" />
        <circle cx="400" cy="330" r="4.5" fill="#fff" />
        <circle cx="400" cy="330" r="10" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".5" style={{ animation: 'pbPulse 2.6s ease-in-out infinite', transformOrigin: '400px 330px' }} />
        <circle className="pb-pin-low" cx="240" cy="498" r="4.5" />
        <circle className="pb-pin-low-ring" cx="240" cy="498" r="10" fill="none" strokeWidth="1.4" opacity=".6" style={{ animation: 'pbPulse 2.6s ease-in-out 1.4s infinite', transformOrigin: '240px 498px' }} />
      </svg>

      <div className="pb-auth-scene-content">
        <Link to="/" className="pb-auth-brand">
          powderbox<span className="brand-star">*</span>
        </Link>
        <h1 className="pb-auth-slogan">
          Не пропустите<br />
          <span>свой день.</span>
        </h1>
      </div>
    </div>
  )
}
