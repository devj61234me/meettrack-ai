import { useEffect, useRef, useState } from 'react'

// Small dropdown menu. `trigger` is a function receiving ({ open, toggle }) and returning the button.
export default function Menu({ trigger, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="rel" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className="menu" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  )
}

export function MenuItem({ icon: Icon, danger, children, ...rest }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${danger ? 'danger' : ''}`} {...rest}>
      {Icon && <Icon size={16} aria-hidden="true" />}{children}
    </button>
  )
}
