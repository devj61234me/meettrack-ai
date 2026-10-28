import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { SelectField, TextAreaField, TextField } from './Field'
import { Alert } from './Feedback'
import { PRIORITIES, TASK_STATUSES } from '../utils/constants'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'

const EMPTY = { title: '', description: '', owner_name: '', due_date: '', priority: '', status: 'pending', dependencies: '', meeting: '' }

// Create (task = null) or edit a task. Unknown owner / due date / priority are saved as empty (null), never guessed.
export default function TaskFormModal({ open, task, meetings = [], defaultMeeting, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const editing = Boolean(task)
  const approved = !editing || task.review_status === 'approved'

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(task ? {
      title: task.title, description: task.description || '', owner_name: task.owner_name || '', due_date: task.due_date || '',
      priority: task.priority || '', status: task.status, dependencies: task.dependencies || '', meeting: task.meeting || '',
    } : { ...EMPTY, meeting: defaultMeeting || '' })
  }, [open, task, defaultMeeting])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setErrors({ title: 'Task title is required.' }); return }
    setSaving(true)
    setErrors({})
    const body = {
      title: form.title.trim(), description: form.description, owner_name: form.owner_name.trim() || null,
      due_date: form.due_date || null, priority: form.priority || null, dependencies: form.dependencies,
    }
    try {
      let saved
      if (editing) {
        if (approved) body.status = form.status
        saved = await api.tasks.update(task.id, body)
      } else {
        body.meeting = form.meeting ? Number(form.meeting) : null
        saved = await api.tasks.create(body)
      }
      toast.success(editing ? 'Task updated.' : 'Task created.')
      onSaved(saved)
    } catch (err) {
      setErrors(Object.fromEntries(Object.keys(err.details || {}).map((k) => [k, err.fieldError(k)])))
      if (!Object.keys(err.details || {}).length) toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={editing ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="task-form" loading={saving}>{editing ? 'Save changes' : 'Create task'}</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="full"><TextField label="Task title" required value={form.title} onChange={set('title')} error={errors.title} maxLength={255} /></div>
          <div className="full"><TextAreaField label="Description" value={form.description} onChange={set('description')} rows={3} /></div>
          <TextField label="Owner" value={form.owner_name} onChange={set('owner_name')} hint="Leave empty if no owner was agreed." error={errors.owner_name} maxLength={150} />
          <TextField label="Due date" type="date" value={form.due_date} onChange={set('due_date')} hint="Leave empty if no deadline was agreed." error={errors.due_date} />
          <SelectField label="Priority" value={form.priority} onChange={set('priority')} placeholder="Not specified" options={PRIORITIES} error={errors.priority} />
          {editing && approved ? (
            <SelectField label="Status" value={form.status} onChange={set('status')} options={TASK_STATUSES} error={errors.status} />
          ) : !editing ? (
            <SelectField label="Related meeting" value={form.meeting} onChange={set('meeting')} placeholder="None" options={meetings.map((m) => ({ value: m.id, label: m.title }))} error={errors.meeting} />
          ) : null}
          <div className="full"><TextAreaField label="Dependencies" value={form.dependencies} onChange={set('dependencies')} rows={2} /></div>
          {editing && !approved && (
            <div className="full"><Alert tone="info">Approve this task to start tracking its status. Saving edits does not approve it.</Alert></div>
          )}
        </div>
      </form>
    </Modal>
  )
}
