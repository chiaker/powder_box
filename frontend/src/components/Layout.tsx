import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import BottomTabs from './BottomTabs'

/** Маршруты, рисующие собственный hero/градиент — nav ложится поверх */
const heroRoute = (p: string) => p === '/' || p === '/compare' || /^\/resorts\/[^/]+$/.test(p)

export default function Layout() {
  const { pathname } = useLocation()

  // При переходе между страницами возвращаем скролл наверх.
  // 'instant', иначе html { scroll-behavior: smooth } анимирует прокрутку.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  const overlay = heroRoute(pathname)

  return (
    <div className="layout">
      {overlay ? <Nav /> : <div className="top-band"><Nav /></div>}
      <main className={overlay ? 'main main-full' : 'main'}>
        <Outlet />
      </main>
      <BottomTabs />
      <Footer />
    </div>
  )
}
