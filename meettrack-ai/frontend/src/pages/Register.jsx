import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Button from '../components/Button'
import { PasswordField, TextField } from '../components/Field'
import { Alert } from '../components/Feedback'
import { AuthFooterLink } from '../layouts/AuthLayout'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

export default function Register() {
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.'
    if (form.password.length < 10) next.password = 'Use at least 10 characters.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await register({ ...form, email: form.email.trim() })
      toast.success('Account created. Welcome to MeetTrack AI!')
      navigate('/', { replace: true })
    } catch (err) {
      const fieldErrors = {}
      Object.keys(err.details || {}).forEach((k) => { fieldErrors[k] = err.fieldError(k) })
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) setFormError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Create your account</h1>
      <p>Start turning meeting notes into tracked actions.</p>
      <form onSubmit={submit} className="stack" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="form-grid">
          <TextField label="First name" autoComplete="given-name" value={form.first_name} onChange={set('first_name')} error={errors.first_name} />
          <TextField label="Last name" autoComplete="family-name" value={form.last_name} onChange={set('last_name')} error={errors.last_name} />
        </div>
        <TextField label="Work email" type="email" icon={Mail} autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@company.com" />
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password}
          hint="At least 10 characters. Avoid common passwords." />
        <Button variant="primary" size="lg" type="submit" loading={loading} className="btn-block">Create account</Button>
      </form>
      <AuthFooterLink text="Already have an account?" to="/login" label="Sign in" />
    </>
  )
}
