export default function Footer() {
  return (
    <footer className="pb-footer">
      <div className="pb-footer-inner">
        <div>
          {/* В подвале — только знак pb*, надпись живёт в шапке (logo/README.md) */}
          <div className="pb-footer-mark" aria-label="powderbox">
            pb<span className="brand-star">*</span>
          </div>
          <p className="pb-footer-tagline">
            Погода по высотам, лучший день для катания и снежные алерты — по всем курортам PowderBox.
          </p>
        </div>
        <div className="pb-footer-right">
          <div className="pb-footer-note">ОБНОВЛЕНИЕ КАЖДЫЕ 3 ЧАСА</div>
          <div className="pb-footer-copy">© 2026 powderbox</div>
        </div>
      </div>
    </footer>
  )
}
