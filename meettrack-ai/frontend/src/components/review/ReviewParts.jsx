import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Pencil, Quote, RotateCcw, Search, X } from 'lucide-react'
import { IconButton } from '../Button'
import Button from '../Button'
import Modal from '../Modal'
import { SelectField, TextAreaField } from '../Field'
import { Badge, PriorityBadge, ReviewBadge, RiskTypeBadge } from '../Badge'
import { NOT_SPECIFIED, UNASSIGNED, formatDate } from '../../utils/format'

/* ---- approve / reject / undo / edit buttons shared by every row ---- */
export function ItemActions({ item, busy, onApprove, onReject, onReset, onEdit, label }) {
  const decided = item.review_status === 'approved' || item.review_status === 'rejected'
  return (
    <div className="row" style={{ gap: 2 }}>
      {item.review_status !== 'approved' && <IconButton icon={Check} tone="ok" label={`Approve ${label}`} onClick={onApprove} disabled={busy} />}
      {item.review_status !== 'rejected' && <IconButton icon={X} tone="no" label={`Reject ${label}`} onClick={onReject} disabled={busy} />}
      {decided && <IconButton icon={RotateCcw} label={`Undo decision on ${label}`} onClick={onReset} disabled={busy} />}
      <IconButton icon={Pencil} label={`Edit ${label}`} onClick={onEdit} disabled={busy} />
    </div>
  )
}

/* ---- the supporting excerpt, with a button that highlights it in the source notes ---- */
export function Evidence({ text, onLocate }) {
  if (!text) return <p className="small subtle" style={{ fontStyle: 'italic' }}>No supporting excerpt available for this item.</p>
  return (
    <div>
      <div className="quote"><Quote size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />{text}</div>
      <button type="button" className="link-btn small" onClick={() => onLocate(text)}><Search size={12} /> Show in source notes</button>
    </div>
  )
}

function Uncertainty({ item }) {
  if (!item.review_note || item.review_status === 'approved' || item.review_status === 'rejected') return null
  return <div className="uncertain"><AlertTriangle size={14} aria-hidden="true" /><span>{item.review_note}</span></div>
}

/* ---- decisions, risks and questions are shown as cards ---- */
function ReviewCard({ item, kind, selected, onSelect, busy, handlers, onLocate, badges, title, details, label }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`review-card status-${item.review_status}`}>
      <input type="checkbox" className="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${label}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-wrap" style={{ gap: 8, marginBottom: 4 }}>
          <ReviewBadge status={item.review_status} />
          {badges}
          {item.user_edited && <Badge dot={false}>Edited</Badge>}
        </div>
        <p className={item.review_status === 'rejected' ? 'rejected-text' : 'strong'}>{title}</p>
        <Uncertainty item={item} />
        <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {open ? 'Hide details' : 'Details & source'}
        </button>
        {open && (
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            {details}
            <Evidence text={item.evidence} onLocate={onLocate} />
          </div>
        )}
      </div>
      <ItemActions item={item} busy={busy} label={label} {...handlers} />
    </li>
  )
}

export function DecisionCard(props) {
  const { item } = props
  return (
    <ReviewCard {...props} label="decision" title={item.text}
      badges={<><Badge tone={item.certainty === 'confirmed' ? 'success' : 'warning'} dot={false}>{item.certainty === 'confirmed' ? 'Confirmed' : 'Tentative'}</Badge>{item.topic && <Badge dot={false}>{item.topic}</Badge>}</>} />
  )
}

export function RiskCard(props) {
  const { item } = props
  return <ReviewCard {...props} label="risk" title={item.text} badges={<RiskTypeBadge type={item.risk_type} />} />
}

export function QuestionCard(props) {
  const { item } = props
  return (
    <ReviewCard {...props} label="question" title={item.text}
      details={
        <dl className="kv">
          <dt>Why it needs clarification</dt><dd>{item.reason || <span className="not-set">Not specified</span>}</dd>
          <dt>Related to</dt><dd>{item.related_item || <span className="not-set">Not specified</span>}</dd>
          <dt>Suggested contact</dt><dd>{item.suggested_contact || <span className="not-set">Not specified</span>}</dd>
        </dl>
      } />
  )
}

/* ---- action items are a compact table ---- */
export function TaskTable({ tasks, selected, onSelect, onSelectAll, busyKeys, handlersFor, onLocate }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(`task:${t.id}`))
  return (
    <div className="table-wrap">
      <table className="table table-stack task-review-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}><input type="checkbox" className="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)} aria-label="Select all action items" /></th>
            <th>Task</th><th>Owner</th><th>Due date</th><th>Priority</th><th>Review status</th><th />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const open = expanded.has(t.id)
            return [
              <tr key={t.id} className={`status-${t.review_status}`}>
                <td><input type="checkbox" className="checkbox" checked={selected.has(`task:${t.id}`)} onChange={() => onSelect(`task:${t.id}`)} aria-label={`Select task ${t.title}`} /></td>
                <td data-label="Task">
                  <div className={t.review_status === 'rejected' ? 'rejected-text cell-title' : 'cell-title'}>{t.title}</div>
                  <Uncertainty item={t} />
                  <button type="button" className="link-btn small" onClick={() => toggle(t.id)} aria-expanded={open}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {open ? 'Hide details' : 'Details & source'}
                  </button>
                </td>
                <td data-label="Owner">{t.owner_name || <span className="not-set">{UNASSIGNED}</span>}</td>
                <td data-label="Due date" className="mono">
                  {t.due_date ? formatDate(t.due_date) : <span className="not-set">{NOT_SPECIFIED}</span>}
                  {!t.due_date && t.deadline_note && <div className="small muted" title="Wording from the notes — not converted to a date">“{t.deadline_note}”</div>}
                </td>
                <td data-label="Priority"><PriorityBadge priority={t.priority} /></td>
                <td data-label="Review"><ReviewBadge status={t.review_status} />{t.user_edited && <span className="small muted"> · edited</span>}</td>
                <td className="actions"><ItemActions item={t} label={`task ${t.title}`} busy={busyKeys.has(`task:${t.id}`)} {...handlersFor(t)} /></td>
              </tr>,
              open && (
                <tr key={`${t.id}-d`} className="detail-row">
                  <td />
                  <td colSpan={6}>
                    <div className="stack" style={{ gap: 10 }}>
                      <dl className="kv">
                        <dt>Description</dt><dd>{t.description || <span className="not-set">No description</span>}</dd>
                        <dt>Dependencies</dt><dd>{t.dependencies || <span className="not-set">None mentioned</span>}</dd>
                      </dl>
                      <Evidence text={t.evidence} onLocate={onLocate} />
                    </div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---- edit dialog for decisions, risks and questions (tasks use TaskFormModal) ---- */
export function ItemEditModal({ open, kind, item, saving, onClose, onSave }) {
  const [form, setForm] = useState({})
  useEffect(() => { if (item) setForm({ ...item }) }, [item, open])
  if (!item) return null
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    if (!String(form.text || '').trim()) return
    const fields = kind === 'decision' ? ['text', 'topic', 'certainty'] : kind === 'risk' ? ['text', 'risk_type'] : ['text', 'reason', 'related_item', 'suggested_contact']
    onSave(Object.fromEntries(fields.map((f) => [f, form[f] ?? ''])))
  }
  return (
    <Modal open={open} onClose={onClose} busy={saving} title={`Edit ${kind}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button variant="primary" type="submit" form="item-form" loading={saving}>Save changes</Button></>}>
      <form id="item-form" onSubmit={submit} className="stack" noValidate>
        <TextAreaField label={kind === 'question' ? 'Question' : kind === 'decision' ? 'Decision' : 'Risk or blocker'} required rows={4} value={form.text || ''} onChange={set('text')} error={!String(form.text || '').trim() ? 'This field cannot be empty.' : undefined} />
        {kind === 'decision' && <>
          <SelectField label="Status" value={form.certainty || 'tentative'} onChange={set('certainty')} options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'tentative', label: 'Tentative' }]} />
          <div><label className="label" htmlFor="topic">Topic</label><input id="topic" className="input" value={form.topic || ''} onChange={set('topic')} maxLength={200} /></div>
        </>}
        {kind === 'risk' && <SelectField label="Type" value={form.risk_type || 'explicit'} onChange={set('risk_type')} options={[{ value: 'explicit', label: 'Stated in meeting' }, { value: 'inferred', label: 'Inferred' }, { value: 'dependency', label: 'Dependency' }, { value: 'blocker', label: 'Blocker' }]} />}
        {kind === 'question' && <>
          <TextAreaField label="Why clarification is needed" rows={2} value={form.reason || ''} onChange={set('reason')} />
          <div><label className="label" htmlFor="rel">Related task or decision</label><input id="rel" className="input" value={form.related_item || ''} onChange={set('related_item')} maxLength={300} /></div>
          <div><label className="label" htmlFor="contact">Suggested contact</label><input id="contact" className="input" value={form.suggested_contact || ''} onChange={set('suggested_contact')} maxLength={200} /></div>
        </>}
        <p className="small muted">Editing keeps the original source excerpt. Saving does not approve the item.</p>
      </form>
    </Modal>
  )
}
