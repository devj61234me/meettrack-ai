import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import { PasswordField } from '../components/Field'
import { Alert } from '../components/Feedback'
import { api } from '../services/api'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const uid = params.get('uid')
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!uid || !token) {
    return (
      <>
        <h1>Link not valid</h1>
        <p>This password reset link is incomplete.</p>
        <Button variant="primary" to="/forgot-password">Request a new link</Button>
      </>
    )
  }

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (password.length < 10) next.password = 'Use at least 10 characters.'
    if (confirm !== password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await api.auth.confirmReset({ uid, token, new_password: password })
      setDone(true)
    } catch (err) {
      if (err.fieldError('new_password')) setErrors({ password: err.fieldError('new_password') })
      else setFormError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <>
        <h1>Password updated</h1>
        <p>You can now sign in with your new password.</p>
        <Button variant="primary" size="lg" to="/login" className="btn-block">Go to sign in</Button>
      </>
    )
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <p>Pick something strong that you do not use anywhere else.</p>
      <form onSubmit={submit} className="stack" noValidate>
        {formError && <Alert tone="danger" action={<Link to="/forgot-password" className="small strong">New link</Link>}>{formError}</Alert>}
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button variant="primary" size="lg" type="submit" loading={loading} className="btn-block">Update password</Button>
      </form>
    </>
  )
}
