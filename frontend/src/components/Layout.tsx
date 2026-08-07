import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import BottomTabs from './BottomTabs'

export default function Layout() {
  const { pathname } = useLocation()

  // При переходе между страницами возвращаем скролл наверх.
  // 'instant', иначе html { scroll-behavior: smooth } анимирует прокрутку.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  // Вход и регистрация — полноэкранный сплит со своей шапкой (дизайн 12a/12b)
  if (pathname === '/login' || pathname === '/register') {
    return <Outlet />
  }

  // Шапка всегда лежит поверх градиента страницы (hero или PageHead) —
  // отдельной полосы под ней нет, иначе между ними появляется разрыв
  return (
    <div className="layout">
      <Nav />
      <main className="main main-full">
        <Outlet />
      </main>
      <BottomTabs />
      <Footer />
    </div>
  )
}
