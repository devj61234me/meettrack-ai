import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Button from '../components/Button'
import { TextField } from '../components/Field'
import { Alert } from '../components/Feedback'
import { api } from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    setError('')
    setLoading(true)
    try {
      await api.auth.requestReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Reset your password</h1>
      <p>Enter your email and we will send you a link to choose a new password.</p>
      {sent ? (
        <div className="stack">
          <Alert tone="success" title="Check your inbox">If an account exists for that email, a reset link has been sent. The link works for 1 hour.</Alert>
          <Button variant="secondary" to="/login">Back to sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="stack" noValidate>
          <TextField label="Email" type="email" icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoComplete="email" />
          <Button variant="primary" size="lg" type="submit" loading={loading} className="btn-block">Send reset link</Button>
          <p className="auth-foot" style={{ margin: 0 }}><Link to="/login">Back to sign in</Link></p>
        </form>
      )}
    </>
  )
}
