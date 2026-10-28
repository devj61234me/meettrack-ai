import { Link } from 'react-router-dom'

// variant: primary | secondary | ghost | danger | danger-ghost   size: sm | md | lg
export default function Button({ variant = 'secondary', size = 'md', loading = false, icon: Icon, to, children, className = '', disabled, ...rest }) {
  const classes = `btn btn-${variant} ${size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''} ${className}`
  const content = (
    <>
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} aria-hidden="true" /> : null}
      {children}
    </>
  )
  if (to) return <Link to={to} className={classes} {...rest}>{content}</Link>
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  )
}

export function IconButton({ icon: Icon, label, tone, size = 17, ...rest }) {
  return (
    <button type="button" className={`icon-btn ${tone || ''}`} aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  )
}
