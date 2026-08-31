import { useEffect, type ReactNode } from 'react'

export default function Drawer({
  title,
  badge,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  badge?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="drawer" role="dialog" aria-label={typeof title === 'string' ? title : 'Details'}>
      <div className="drawer-head">
        <span className="drawer-title">{title}</span>
        {badge}
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </aside>
  )
}
