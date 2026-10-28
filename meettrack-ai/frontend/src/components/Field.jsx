import { useId, useState } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

function Wrapper({ id, label, error, hint, children, required }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}{required && <span aria-hidden="true" style={{ color: 'var(--danger)' }}> *</span>}</label>}
      {children}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error-text" id={`${id}-err`} role="alert"><AlertCircle size={14} />{error}</span>}
    </div>
  )
}

const aria = (id, error, hint) => ({
  'aria-invalid': error ? 'true' : undefined,
  'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
})

export function TextField({ label, error, hint, required, icon: Icon, className = '', ...rest }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required}>
      <div className={Icon ? 'input-wrap' : undefined}>
        {Icon && <Icon className="lead" size={16} aria-hidden="true" />}
        <input id={id} className={`input ${className}`} required={required} {...aria(id, error, hint)} {...rest} />
      </div>
    </Wrapper>
  )
}

export function PasswordField({ label = 'Password', error, hint, ...rest }) {
  const id = useId()
  const [show, setShow] = useState(false)
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <div className="input-wrap">
        <input id={id} className="input" type={show ? 'text' : 'password'} style={{ paddingLeft: 12, paddingRight: 44 }} {...aria(id, error, hint)} {...rest} />
        <button type="button" className="icon-btn trail" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </Wrapper>
  )
}

export function TextAreaField({ label, error, hint, required, ...rest }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required}>
      <textarea id={id} className="textarea" required={required} {...aria(id, error, hint)} {...rest} />
    </Wrapper>
  )
}

export function SelectField({ label, error, hint, options, placeholder, small, className = '', ...rest }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select id={id} className={`select ${small ? 'select-sm' : ''} ${className}`} {...aria(id, error, hint)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Wrapper>
  )
}
