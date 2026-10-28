import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import { ConfirmDialog } from '../components/Modal'
import { Alert } from '../components/Feedback'
import { PasswordField, TextField } from '../components/Field'
import { useAppConfig } from '../hooks/useAppConfig'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, tokenStore } from '../services/api'
import { formatDate } from '../utils/format'

function ProfileCard() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ first_name: user.first_name || '', last_name: user.last_name || '' })
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try { setUser(await api.auth.updateMe(form)); toast.success('Profile updated.') } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }
  return (
    <section className="card">
      <div className="card-head"><UserRound size={18} className="muted" /><h3>Profile</h3></div>
      <form className="card-body stack" onSubmit={submit}>
        <div className="form-grid">
          <TextField label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} maxLength={60} />
          <TextField label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} maxLength={60} />
          <div className="full"><TextField label="Email" value={user.email} disabled hint="Your email is your sign-in name and cannot be changed here." /></div>
        </div>
        <div className="form-actions"><Button variant="primary" type="submit" loading={saving}>Save profile</Button></div>
      </form>
    </section>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!form.current_password) next.current_password = 'Enter your current password.'
    if (form.new_password.length < 10) next.new_password = 'Use at least 10 characters.'
    if (form.confirm !== form.new_password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const result = await api.auth.changePassword({ current_password: form.current_password, new_password: form.new_password })
      tokenStore.set(result.token) // the server rotated the token; other devices are signed out
      setForm({ current_password: '', new_password: '', confirm: '' })
      toast.success('Password changed. Other devices were signed out.')
    } catch (err) {
      setErrors({ current_password: err.fieldError('current_password'), new_password: err.fieldError('new_password') })
      if (!err.fieldError('current_password') && !err.fieldError('new_password')) toast.error(err.message)
    } finally { setSaving(false) }
  }
  return (
    <section className="card">
      <div className="card-head"><KeyRound size={18} className="muted" /><h3>Change password</h3></div>
      <form className="card-body stack" onSubmit={submit} noValidate>
        <PasswordField label="Current password" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} error={errors.current_password} />
        <PasswordField label="New password" autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} error={errors.new_password} hint="At least 10 characters." />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={errors.confirm} />
        <div className="form-actions"><Button variant="primary" type="submit" loading={saving}>Update password</Button></div>
      </form>
    </section>
  )
}

function SecurityCard() {
  const { user, clearSession } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  async function signOutEverywhere() {
    setBusy(true)
    try { await api.auth.signOutEverywhere(); clearSession(); toast.info('Signed out of all devices.'); navigate('/login') } catch (err) { toast.error(err.message); setBusy(false) }
  }
  return (
    <section className="card">
      <div className="card-head"><ShieldCheck size={18} className="muted" /><h3>Account security</h3></div>
      <div className="card-body stack">
        <dl className="kv"><dt>Member since</dt><dd>{formatDate(user.date_joined)}</dd><dt>Sessions</dt><dd>Sessions expire automatically after 7 days. Signing out ends the session on the server.</dd></dl>
        <div><Button variant="secondary" icon={LogOut} loading={busy} onClick={signOutEverywhere}>Sign out of all devices</Button></div>
      </div>
    </section>
  )
}

function DataCard() {
  const config = useAppConfig()
  const { clearSession } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (!password) { setError('Enter your password to confirm.'); return }
    setBusy(true)
    try { await api.auth.deleteAccount(password); clearSession(); toast.success('Your account and all data were deleted.'); navigate('/login', { replace: true }) }
    catch (err) { setError(err.fieldError('password') || err.message); setBusy(false) }
  }
  return (
    <section className="card">
      <div className="card-head"><Trash2 size={18} className="muted" /><h3>Data &amp; privacy</h3></div>
      <div className="card-body stack">
        <p>Your meetings, notes, extracted items and analysis history are stored in this application’s database and are visible only to your account. Uploaded documents are read in memory and are not kept — only the extracted text you choose to save is stored.</p>
        <Alert tone="info" title="External AI processing">When you run an analysis, the meeting text is sent to {config?.ai_configured ? `the ${config.ai_provider} AI provider` : 'the configured AI provider'}. {config?.ai_external_processing_enabled === false ? 'This is currently disabled by your administrator.' : 'You are asked to confirm each time.'}</Alert>
        <p className="muted small">You can delete a single meeting at any time from the Meetings page. Deleting your account permanently removes every meeting, task, decision, risk, question and log entry linked to it. This cannot be undone.</p>
        <div><Button variant="danger" icon={Trash2} onClick={() => { setPassword(''); setError(''); setOpen(true) }}>Delete my account and data</Button></div>
      </div>
      <ConfirmDialog open={open} danger loading={busy} title="Delete your account?" confirmLabel="Permanently delete" onCancel={() => setOpen(false)} onConfirm={remove}
        message="This permanently deletes your account and all of your meetings and tasks. Enter your password to confirm.">
        <PasswordField label="Password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} error={error} data-autofocus />
      </ConfirmDialog>
    </section>
  )
}

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile, password and data." />
      <div className="settings-grid">
        <div className="stack"><ProfileCard /><SecurityCard /></div>
        <div className="stack"><PasswordCard /><DataCard /></div>
      </div>
    </>
  )
}
