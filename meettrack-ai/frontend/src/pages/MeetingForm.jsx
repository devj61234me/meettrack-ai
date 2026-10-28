import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileUp, Lock, Sparkles, X } from 'lucide-react'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import { Alert, PageLoader, ErrorState } from '../components/Feedback'
import { TextAreaField, TextField } from '../components/Field'
import { useAppConfig } from '../hooks/useAppConfig'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import { todayISO } from '../utils/format'

const EMPTY = { title: '', client_name: '', meeting_date: todayISO(), participants: '', notes: '', source_filename: '' }
const ALLOWED = ['.txt', '.docx', '.pdf']

export default function MeetingForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const config = useAppConfig()
  const fileInput = useRef(null)
  const maxMb = config?.max_upload_mb || 5
  const maxChars = config?.max_notes_chars || 100000

  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(editing)
  const [loadError, setLoadError] = useState(null)
  const [notesLocked, setNotesLocked] = useState(false)
  const [saving, setSaving] = useState(false) // blocks duplicate submissions
  const [extracting, setExtracting] = useState(false)
  const [preview, setPreview] = useState(null) // { text, filename } extracted from a document, shown before it is used

  useEffect(() => {
    if (!editing) return
    api.meetings.get(id)
      .then((m) => {
        setForm({ title: m.title, client_name: m.client_name, meeting_date: m.meeting_date, participants: m.participants, notes: m.notes, source_filename: m.source_filename })
        setNotesLocked(m.notes_locked)
      })
      .catch(setLoadError)
      .finally(() => setLoading(false))
  }, [editing, id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function validate() {
    const next = {}
    if (!form.title.trim()) next.title = 'Meeting title is required.'
    if (!form.meeting_date) next.meeting_date = 'Meeting date is required.'
    if (!form.notes.trim()) next.notes = 'Paste your meeting notes or upload a document.'
    else if (form.notes.trim().length < 20) next.notes = 'The notes are too short to analyze (minimum 20 characters).'
    else if (form.notes.length > maxChars) next.notes = `The notes are too long (maximum ${maxChars.toLocaleString()} characters).`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED.includes(ext)) { toast.error('Unsupported file type. Upload a .txt, .docx or text-based .pdf file.'); return }
    if (file.size > maxMb * 1024 * 1024) { toast.error(`That file is larger than the ${maxMb} MB limit.`); return }
    setExtracting(true)
    try {
      const result = await api.meetings.extractText(file)
      setPreview(result)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setExtracting(false)
    }
  }

  function usePreview() {
    setForm((f) => ({ ...f, notes: preview.text, source_filename: preview.filename }))
    setErrors((er) => ({ ...er, notes: undefined }))
    setPreview(null)
    toast.success('Extracted text added to the notes. Review it before analyzing.')
  }

  async function save(thenAnalyze) {
    if (saving || !validate()) return
    setSaving(true)
    const body = { ...form, title: form.title.trim() }
    if (notesLocked) delete body.notes
    try {
      const meeting = editing ? await api.meetings.update(id, body) : await api.meetings.create(body)
      toast.success(editing ? 'Meeting updated.' : 'Meeting saved. Your notes are stored safely.')
      navigate(`/meetings/${meeting.id}`, { state: thenAnalyze ? { autoAnalyze: true } : undefined })
    } catch (err) {
      const fieldErrors = {}
      Object.keys(err.details || {}).forEach((k) => { fieldErrors[k] = err.fieldError(k) })
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(err.message)
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />
  if (loadError) return <ErrorState error={loadError} />

  return (
    <>
      <PageHeader title={editing ? 'Edit meeting' : 'New meeting'} subtitle={editing ? 'Update the meeting details.' : 'Add the meeting and its notes. Your notes are saved before any AI analysis starts.'} />
      <form className="card form-card" onSubmit={(e) => { e.preventDefault(); save(false) }} noValidate>
        <div className="card-body stack" style={{ gap: 20 }}>
          {config && !config.ai_configured && (
            <Alert tone="warning" title="AI analysis is not set up yet">You can save meetings now. To analyze them, add AI_PROVIDER, AI_API_KEY and AI_MODEL to <code>backend/.env</code> and restart the backend (see the README).</Alert>
          )}
          <div className="form-grid">
            <div className="full"><TextField label="Meeting title" required value={form.title} onChange={set('title')} error={errors.title} maxLength={200} placeholder="e.g. Website redesign kickoff" /></div>
            <TextField label="Client or project" value={form.client_name} onChange={set('client_name')} error={errors.client_name} maxLength={200} hint="Optional" />
            <TextField label="Meeting date" type="date" required value={form.meeting_date} onChange={set('meeting_date')} error={errors.meeting_date} />
            <div className="full"><TextField label="Participants" value={form.participants} onChange={set('participants')} error={errors.participants} hint="Optional. Names help the AI match owners correctly. Example: Priya (PM), Rahul (Dev), Sam (Client)" maxLength={2000} /></div>
          </div>

          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="label">Meeting notes or transcript <span style={{ color: 'var(--danger)' }}>*</span></span>
              <span className="spacer" />
              {notesLocked && <span className="small muted row" style={{ gap: 5 }}><Lock size={13} />Locked after analysis</span>}
            </div>
            {!notesLocked && (
              <div className="dropzone" style={{ marginBottom: 12 }}>
                <FileUp size={22} className="muted" aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <div className="strong">Upload a document (optional)</div>
                  <div className="small muted">TXT, DOCX or text-based PDF · up to {maxMb} MB · text is extracted so you can check it first</div>
                </div>
                <input ref={fileInput} type="file" accept=".txt,.docx,.pdf" onChange={onFile} className="sr-only" id="doc-upload" aria-label="Upload meeting document" />
                <Button variant="secondary" size="sm" loading={extracting} onClick={() => fileInput.current?.click()}>Choose file</Button>
              </div>
            )}
            {preview && (
              <div className="preview-box" role="region" aria-label="Extracted text preview">
                <div className="row" style={{ marginBottom: 8 }}>
                  <strong>Extracted from {preview.filename}</strong>
                  <span className="small muted">{preview.characters.toLocaleString()} characters</span>
                  <span className="spacer" />
                  <Button size="sm" variant="ghost" icon={X} onClick={() => setPreview(null)}>Discard</Button>
                  <Button size="sm" variant="primary" onClick={usePreview}>Use as meeting notes</Button>
                </div>
                <pre className="source-text" tabIndex={0}>{preview.text}</pre>
              </div>
            )}
            <TextAreaField
              aria-label="Meeting notes"
              value={form.notes}
              onChange={set('notes')}
              error={errors.notes}
              rows={14}
              disabled={notesLocked}
              placeholder="Paste the meeting transcript or your notes here…"
              hint={notesLocked ? 'Notes are locked because this meeting has been analyzed, so source excerpts stay accurate.' : `${form.notes.length.toLocaleString()} / ${maxChars.toLocaleString()} characters`}
            />
          </div>
        </div>
        <div className="card-foot form-actions">
          <Button variant="ghost" onClick={() => navigate(editing ? `/meetings/${id}` : '/meetings')} disabled={saving}>Cancel</Button>
          <Button variant="secondary" type="submit" loading={saving}>{editing ? 'Save changes' : 'Save meeting'}</Button>
          {!notesLocked && <Button variant="primary" icon={Sparkles} onClick={() => save(true)} disabled={saving}>{editing ? 'Save & analyze' : 'Save & analyze'}</Button>}
        </div>
      </form>
    </>
  )
}
