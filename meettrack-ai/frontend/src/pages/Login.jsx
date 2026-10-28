import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Button from '../components/Button'
import { PasswordField, TextField } from '../components/Field'
import { Alert } from '../components/Feedback'
import { AuthFooterLink } from '../layouts/AuthLayout'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  // Forms start empty on purpose: no prefilled credentials.
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!form.email.trim()) next.email = 'Enter your email address.'
    if (!form.password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await login(form.email.trim(), form.password)
      toast.success('Welcome back.')
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setFormError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p>Welcome back. Enter your details to continue.</p>
      <form onSubmit={submit} className="stack" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField label="Email" type="email" icon={Mail} autoComplete="email" value={form.email} error={errors.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
        <PasswordField label="Password" autoComplete="current-password" value={form.password} error={errors.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div style={{ textAlign: 'right', marginTop: -6 }}><Link to="/forgot-password" className="small">Forgot password?</Link></div>
        <Button variant="primary" size="lg" type="submit" loading={loading} className="btn-block">Sign in</Button>
      </form>
      <AuthFooterLink text="New to MeetTrack AI?" to="/register" label="Create an account" />
    </>
  )
}
