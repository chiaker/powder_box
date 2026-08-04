import type { ReactNode } from 'react'

/** Компактный градиентный хедер внутренних страниц (дизайн 4a/4b) */
export default function PageHead({
  kicker,
  title,
  right,
}: {
  kicker?: string
  title: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="page-head">
      <div className="page-head-inner">
        <div>
          {kicker && <div className="page-head-kicker">{kicker}</div>}
          <h1 className="page-head-title">{title}</h1>
        </div>
        {right && <div className="page-head-right">{right}</div>}
      </div>
    </div>
  )
}
