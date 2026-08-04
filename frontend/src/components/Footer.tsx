import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="pb-footer">
      <div className="pb-footer-inner">
        <div>
          <div className="pb-footer-brand">
            powderbox<span className="brand-star">*</span>
          </div>
          <p className="pb-footer-tagline">
            Погода по высотам, лучший день для катания и снежные алерты — по всем курортам PowderBox.
          </p>
        </div>
        <div className="pb-footer-cols">
          <div className="pb-footer-col">
            <span className="pb-footer-head">ПРОДУКТ</span>
            <Link to="/">Условия</Link>
            <Link to="/resorts">Курорты</Link>
            <Link to="/compare">Сравнение</Link>
            <Link to="/profile">Алерты</Link>
          </div>
          <div className="pb-footer-col">
            <span className="pb-footer-head">ДАННЫЕ</span>
            <Link to="/hotels">Отели</Link>
            <Link to="/lessons">Уроки</Link>
            <Link to="/stats">Статистика</Link>
          </div>
        </div>
        <div className="pb-footer-right">
          <div className="pb-footer-note">ОБНОВЛЕНИЕ КАЖДЫЕ 3 ЧАСА</div>
          <div className="pb-footer-copy">© 2026 powderbox</div>
        </div>
      </div>
    </footer>
  )
}
