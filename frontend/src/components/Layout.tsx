import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Nav from './Nav'

export default function Layout() {
  const { pathname } = useLocation()

  // При переходе между страницами возвращаем скролл наверх.
  // 'instant', иначе html { scroll-behavior: smooth } анимирует прокрутку.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="layout">
      <Nav />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
