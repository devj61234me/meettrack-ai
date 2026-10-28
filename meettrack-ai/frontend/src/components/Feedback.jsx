import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import Button from './Button'

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <Spinner label={label} />
      <p>{label}</p>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 20 }} className="stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={18} width={`${90 - i * 6}%`} />)}
    </div>
  )
}

const ICONS = { info: Info, warning: AlertTriangle, danger: XCircle, success: CheckCircle2 }

export function Alert({ tone = 'info', title, children, action }) {
  const Icon = ICONS[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon size={18} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        {title && <div className="alert-title">{title}</div>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><XCircle size={26} /></div>
      <h3>Something went wrong</h3>
      <p>{error?.message || 'We could not load this page.'}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={26} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
