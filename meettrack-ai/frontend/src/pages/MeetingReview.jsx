import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardList, Copy, Download, FileText, FileType2, HelpCircle, Lightbulb, ListChecks, Mail, Pencil, RefreshCw, Save, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import Menu, { MenuItem } from '../components/Menu'
import Modal, { ConfirmDialog } from '../components/Modal'
import TaskFormModal from '../components/TaskFormModal'
import { Alert, ErrorState, PageLoader } from '../components/Feedback'
import { MeetingStatusBadge } from '../components/Badge'
import { DecisionCard, ItemEditModal, QuestionCard, RiskCard, TaskTable } from '../components/review/ReviewParts'
import { useAppConfig } from '../hooks/useAppConfig'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import { formatDate, formatDateTime, pluralize } from '../utils/format'
import { PENDING } from '../utils/constants'

const LIST_KEY = { decision: 'decisions', task: 'tasks', risk: 'risks', question: 'questions' }
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* Splits the notes around the excerpt so it can be highlighted. Whitespace-tolerant, case-insensitive. */
function splitAround(notes, needle) {
  if (!needle) return null
  const match = new RegExp(escapeRegex(needle.trim()).replace(/\s+/g, '\\s+'), 'i').exec(notes)
  return match ? [notes.slice(0, match.index), match[0], notes.slice(match.index + match[0].length)] : null
}

function Section({ icon: Icon, title, count, children, action, id }) {
  return (
    <section className="card review-section" aria-labelledby={`${id}-h`} id={id}>
      <div className="card-head"><Icon size={18} className="muted" aria-hidden="true" /><h3 id={`${id}-h`}>{title}</h3><span className="count">{count}</span><span className="spacer" />{action}</div>
      {children}
    </section>
  )
}

export default function MeetingReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const config = useAppConfig()

  const [meeting, setMeeting] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [askAnalyze, setAskAnalyze] = useState(false)
  const [ack, setAck] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busyKeys, setBusyKeys] = useState(() => new Set())
  const [highlight, setHighlight] = useState('')
  const [edit, setEdit] = useState(null) // { kind, item }
  const [savingEdit, setSavingEdit] = useState(false)
  const [bulk, setBulk] = useState(null) // 'approve' | 'reject'
  const [bulkBusy, setBulkBusy] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [followup, setFollowup] = useState('')
  const [savingFollowup, setSavingFollowup] = useState(false)
  const [askRebuild, setAskRebuild] = useState(false)
  const markRef = useRef(null)

  const loadAll = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([api.meetings.get(id), api.meetings.analysis(id)])
      setMeeting(m)
      setBundle(b)
      setFollowup(b.analysis?.followup_draft || '')
      return m
    } catch (err) {
      setLoadError(err)
      return null
    }
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // "Save & analyze" / the sparkle button on the meetings list land here asking to start straight away.
  useEffect(() => {
    if (meeting && location.state?.autoAnalyze) {
      setAskAnalyze(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [meeting]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [highlight])

  const allItems = useMemo(() => (bundle ? [...bundle.decisions, ...bundle.tasks, ...bundle.risks, ...bundle.questions] : []), [bundle])
  const counts = useMemo(() => ({
    pending: allItems.filter((i) => PENDING.includes(i.review_status)).length,
    needsConfirmation: allItems.filter((i) => i.review_status === 'needs_confirmation').length,
    approved: allItems.filter((i) => i.review_status === 'approved').length,
    rejected: allItems.filter((i) => i.review_status === 'rejected').length,
  }), [allItems])

  /* ---------------- analysis ---------------- */
  async function runAnalysis() {
    setAskAnalyze(false)
    setAck(false)
    setAnalyzing(true)
    setAnalysisError(null)
    setSelected(new Set())
    try {
      const result = await api.meetings.analyze(id)
      setBundle(result)
      setFollowup(result.analysis?.followup_draft || '')
      await loadAll()
      toast.success('Analysis complete. Review the extracted items below.')
    } catch (err) {
      setAnalysisError(err)
      await loadAll() // pick up the failed attempt and the preserved notes
    } finally {
      setAnalyzing(false)
    }
  }

  /* ---------------- single item actions ---------------- */
  const replaceItem = (kind, updated) =>
    setBundle((b) => ({ ...b, [LIST_KEY[kind]]: b[LIST_KEY[kind]].map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) }))

  async function act(kind, item, action) {
    const key = `${kind}:${item.id}`
    setBusyKeys((s) => new Set(s).add(key))
    try {
      const updated = await api.items(kind)[action](item.id)
      replaceItem(kind, updated)
      toast.success({ approve: 'Approved.', reject: 'Rejected.', reset: 'Decision undone — item needs confirmation again.' }[action])
      loadAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyKeys((s) => { const n = new Set(s); n.delete(key); return n })
    }
  }

  const handlersFor = (kind) => (item) => ({
    onApprove: () => act(kind, item, 'approve'),
    onReject: () => act(kind, item, 'reject'),
    onReset: () => act(kind, item, 'reset'),
    onEdit: () => setEdit({ kind, item }),
  })

  async function saveEdit(values) {
    setSavingEdit(true)
    try {
      const updated = await api.items(edit.kind).update(edit.item.id, values)
      replaceItem(edit.kind, updated)
      toast.success('Changes saved.')
      setEdit(null)
    } catch (err) {
      toast.error(err.fieldError?.('text') || err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  /* ---------------- selection + bulk ---------------- */
  const toggleSelect = (key) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const selectGroup = (kind, list, on) => setSelected((s) => {
    const n = new Set(s)
    list.forEach((i) => (on ? n.add(`${kind}:${i.id}`) : n.delete(`${kind}:${i.id}`)))
    return n
  })
  const selectAllPending = () => {
    const keys = []
    Object.entries(LIST_KEY).forEach(([kind, listName]) =>
      bundle[listName].filter((i) => PENDING.includes(i.review_status)).forEach((i) => keys.push(`${kind}:${i.id}`)))
    setSelected(new Set(keys))
  }
  const selectedItems = useMemo(() => [...selected].map((k) => { const [type, itemId] = k.split(':'); return { type, id: Number(itemId) } }), [selected])
  const selectedNeedConfirm = useMemo(() => {
    let n = 0
    for (const { type, id: itemId } of selectedItems) {
      if (bundle?.[LIST_KEY[type]].find((i) => i.id === itemId)?.review_status === 'needs_confirmation') n += 1
    }
    return n
  }, [selectedItems, bundle])

  async function runBulk() {
    setBulkBusy(true)
    try {
      const result = await api.meetings.bulkReview(id, bulk, selectedItems)
      const { updated, ...nextBundle } = result
      setBundle(nextBundle)
      setSelected(new Set())
      toast.success(`${pluralize(updated, 'item')} ${bulk === 'approve' ? 'approved' : 'rejected'}.`)
      setBulk(null)
      loadAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBulkBusy(false)
    }
  }

  /* ---------------- follow-up ---------------- */
  async function saveFollowup() {
    setSavingFollowup(true)
    try { await api.meetings.saveFollowup(id, followup); toast.success('Follow-up draft saved.'); await loadAll() } catch (err) { toast.error(err.message) } finally { setSavingFollowup(false) }
  }
  async function rebuildFollowup() {
    setAskRebuild(false)
    try { const b = await api.meetings.rebuildFollowup(id); setBundle(b); setFollowup(b.analysis.followup_draft); toast.success('Draft rebuilt from approved items.') } catch (err) { toast.error(err.message) }
  }
  async function copyFollowup() {
    try { await navigator.clipboard.writeText(followup); toast.success('Copied to clipboard.') } catch { toast.error('Copy failed. Select the text and copy it manually.') }
  }

  async function exportReport(file) {
    try { await api.meetings.downloadReport(id, file); toast.success('Report downloaded.') } catch (err) { toast.error(err.message) }
  }
  async function deleteMeeting() {
    setDeleting(true)
    try { await api.meetings.remove(id); toast.success('Meeting deleted.'); navigate('/meetings', { replace: true }) } catch (err) { toast.error(err.message); setDeleting(false) }
  }

  /* ---------------- render ---------------- */
  if (loadError) return <ErrorState error={loadError} onRetry={() => { setLoadError(null); loadAll() }} />
  if (!meeting || !bundle) return <PageLoader label="Loading meeting…" />

  const analyzed = meeting.analysis_status === 'completed' && bundle.analysis
  const aiBlocked = config && (!config.ai_configured || !config.ai_external_processing_enabled)
  const split = splitAround(meeting.notes, highlight)
  const lastFailure = !analyzing && bundle.attempts?.[0]?.status === 'failed' ? bundle.attempts[0] : null

  return (
    <>
      <PageHeader
        title={meeting.title}
        subtitle={<span className="row-wrap" style={{ gap: 8 }}>{meeting.client_name || 'No client'} · {formatDate(meeting.meeting_date)} <MeetingStatusBadge status={analyzing ? 'analyzing' : meeting.review_status} /></span>}
        actions={
          <>
            <Button variant="primary" icon={analyzed ? RefreshCw : Sparkles} loading={analyzing} disabled={analyzing || aiBlocked} onClick={() => setAskAnalyze(true)}>
              {analyzing ? 'Analyzing…' : analyzed ? 'Re-analyze' : 'Analyze with AI'}
            </Button>
            <Menu trigger={({ toggle }) => <Button variant="secondary" icon={Download} onClick={toggle} aria-haspopup="menu">Export</Button>}>
              <MenuItem icon={FileText} onClick={() => exportReport('pdf')}>Meeting report (PDF)</MenuItem>
              <MenuItem icon={FileType2} onClick={() => exportReport('docx')}>Meeting report (Word)</MenuItem>
            </Menu>
            <Button variant="secondary" icon={Pencil} to={`/meetings/${id}/edit`}>Edit</Button>
            <Button variant="danger-ghost" icon={Trash2} onClick={() => setAskDelete(true)} aria-label="Delete meeting" />
          </>
        }
      />

      {config && !config.ai_configured && (
        <div style={{ marginBottom: 16 }}><Alert tone="warning" title="AI analysis is not configured">Add AI_PROVIDER, AI_API_KEY and AI_MODEL to <code>backend/.env</code> and restart the backend. Your meeting and notes are saved.</Alert></div>
      )}
      {config && config.ai_configured && !config.ai_external_processing_enabled && (
        <div style={{ marginBottom: 16 }}><Alert tone="warning" title="External AI processing is disabled">Your administrator turned off sending notes to an AI provider.</Alert></div>
      )}
      {meeting.notes_changed_since_analysis && <div style={{ marginBottom: 16 }}><Alert tone="warning">The notes changed after the last analysis, so extracted items may be out of date.</Alert></div>}
      {(analysisError || lastFailure) && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger" title="The analysis did not finish. Your meeting and notes are safe."
            action={(analysisError?.retryable ?? true) && !aiBlocked ? <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setAskAnalyze(true)} disabled={analyzing}>Retry</Button> : null}>
            {analysisError?.message || lastFailure?.error_message}
          </Alert>
        </div>
      )}

      <div className="review-grid">
        {/* ---------- left: meeting details + source notes ---------- */}
        <aside className="review-side">
          <section className="card">
            <div className="card-head"><ClipboardList size={18} className="muted" /><h3>Meeting details</h3></div>
            <dl className="kv card-body">
              <dt>Client / project</dt><dd>{meeting.client_name || <span className="not-set">Not specified</span>}</dd>
              <dt>Date</dt><dd>{formatDate(meeting.meeting_date)}</dd>
              <dt>Participants</dt><dd>{meeting.participants || <span className="not-set">Not specified</span>}</dd>
              {meeting.source_filename && <><dt>Source file</dt><dd>{meeting.source_filename}</dd></>}
              {bundle.analysis && <><dt>Analysis</dt><dd>v{bundle.analysis.version} · {bundle.analysis.model || 'AI'} · {formatDateTime(bundle.analysis.completed_at)}</dd></>}
            </dl>
          </section>
          <section className="card">
            <div className="card-head"><FileText size={18} className="muted" /><h3>Source notes</h3>
              <span className="spacer" />{highlight && <Button size="sm" variant="ghost" icon={X} onClick={() => setHighlight('')}>Clear highlight</Button>}
            </div>
            <div className="source-text" tabIndex={0} aria-label="Original meeting notes">
              {split ? <>{split[0]}<mark ref={markRef}>{split[1]}</mark>{split[2]}</> : meeting.notes}
            </div>
            {highlight && !split && <p className="small muted" style={{ padding: '0 20px 14px' }}>That excerpt could not be located in the notes.</p>}
          </section>
        </aside>

        {/* ---------- main: extracted information ---------- */}
        <div className="review-main">
          {analyzing && (
            <div className="card card-pad stack" role="status" aria-live="polite">
              <div className="row"><span className="spinner" /><strong>Analyzing your meeting…</strong></div>
              <div className="progress-bar"><span /></div>
              <p className="small muted">Reading the notes, extracting decisions, tasks, risks and questions, and checking every excerpt against your notes. This can take up to a minute. Please keep this page open.</p>
            </div>
          )}

          {!analyzing && !analyzed && (
            <div className="card">
              <div className="empty">
                <div className="empty-icon"><Sparkles size={26} /></div>
                <h3>Ready for analysis</h3>
                <p>The AI will draft a summary, decisions, action items, risks and open questions. Nothing is approved automatically — you review every item.</p>
                <p className="small subtle">Your notes are sent to the configured external AI provider{config?.ai_provider ? ` (${config.ai_provider})` : ''} for processing.</p>
                <Button variant="primary" size="lg" icon={Sparkles} disabled={aiBlocked} onClick={() => setAskAnalyze(true)}>Analyze with AI</Button>
              </div>
            </div>
          )}

          {analyzed && (
            <>
              <div className="progress-strip" aria-label="Review progress">
                <div><strong className="mono">{counts.pending}</strong><span>to review</span></div>
                <div className={counts.needsConfirmation ? 'warn' : ''}><strong className="mono">{counts.needsConfirmation}</strong><span>need confirmation</span></div>
                <div className="ok"><strong className="mono">{counts.approved}</strong><span>approved</span></div>
                <div><strong className="mono">{counts.rejected}</strong><span>rejected</span></div>
                <span className="spacer" />
                <Button size="sm" variant="secondary" onClick={selectAllPending}>Select all pending</Button>
              </div>

              {selected.size > 0 && (
                <div className="bulk-bar" role="region" aria-label="Bulk actions">
                  <strong>{selected.size} selected</strong>
                  <span className="spacer" />
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                  <Button size="sm" variant="secondary" icon={X} onClick={() => setBulk('reject')}>Reject selected</Button>
                  <Button size="sm" variant="primary" icon={Check} onClick={() => setBulk('approve')}>Approve selected</Button>
                </div>
              )}

              <Section id="summary" icon={Lightbulb} title="Meeting summary" count="AI draft">
                <div className="card-body"><p style={{ whiteSpace: 'pre-wrap' }}>{bundle.analysis.summary}</p>
                  <p className="small subtle" style={{ marginTop: 10 }}>AI-generated summary. It is not verified — compare it with the source notes.</p></div>
              </Section>

              <Section id="decisions" icon={Check} title="Decisions" count={bundle.decisions.length}>
                {bundle.decisions.length ? (
                  <ul className="review-list">{bundle.decisions.map((d) => (
                    <DecisionCard key={d.id} item={d} kind="decision" selected={selected.has(`decision:${d.id}`)} onSelect={() => toggleSelect(`decision:${d.id}`)}
                      busy={busyKeys.has(`decision:${d.id}`)} handlers={handlersFor('decision')(d)} onLocate={setHighlight} />
                  ))}</ul>
                ) : <p className="card-body muted">No decisions were found in these notes.</p>}
              </Section>

              <Section id="actions" icon={ListChecks} title="Action items" count={bundle.tasks.length}
                action={<Link to={`/tasks?meeting=${id}`} className="small strong">Open in Tasks</Link>}>
                {bundle.tasks.length ? (
                  <TaskTable tasks={bundle.tasks} selected={selected} onSelect={toggleSelect} onSelectAll={(on) => selectGroup('task', bundle.tasks, on)}
                    busyKeys={busyKeys} handlersFor={(t) => ({ ...handlersFor('task')(t), onEdit: () => setEdit({ kind: 'task', item: t }) })} onLocate={setHighlight} />
                ) : <p className="card-body muted">No action items were found in these notes.</p>}
              </Section>

              <Section id="risks" icon={ShieldAlert} title="Risks and blockers" count={bundle.risks.length}>
                {bundle.risks.length ? (
                  <ul className="review-list">{bundle.risks.map((r) => (
                    <RiskCard key={r.id} item={r} kind="risk" selected={selected.has(`risk:${r.id}`)} onSelect={() => toggleSelect(`risk:${r.id}`)}
                      busy={busyKeys.has(`risk:${r.id}`)} handlers={handlersFor('risk')(r)} onLocate={setHighlight} />
                  ))}</ul>
                ) : <p className="card-body muted">No risks or blockers were found.</p>}
              </Section>

              <Section id="questions" icon={HelpCircle} title="Unanswered questions" count={bundle.questions.length}>
                {bundle.questions.length ? (
                  <ul className="review-list">{bundle.questions.map((q) => (
                    <QuestionCard key={q.id} item={q} kind="question" selected={selected.has(`question:${q.id}`)} onSelect={() => toggleSelect(`question:${q.id}`)}
                      busy={busyKeys.has(`question:${q.id}`)} handlers={handlersFor('question')(q)} onLocate={setHighlight} />
                  ))}</ul>
                ) : <p className="card-body muted">No unanswered questions were found.</p>}
              </Section>

              <Section id="followup" icon={Mail} title="Client follow-up draft" count="editable">
                <div className="card-body stack" style={{ gap: 12 }}>
                  <Alert tone="info">The draft below is a starting point. Rebuild it from your approved items before sending anything to a client.</Alert>
                  <textarea className="textarea" rows={14} value={followup} onChange={(e) => setFollowup(e.target.value)} aria-label="Client follow-up draft" />
                  <div className="row-wrap">
                    <Button variant="primary" icon={Save} loading={savingFollowup} disabled={followup === (bundle.analysis.followup_draft || '')} onClick={saveFollowup}>Save draft</Button>
                    <Button variant="secondary" icon={RefreshCw} onClick={() => setAskRebuild(true)}>Rebuild from approved items</Button>
                    <Button variant="secondary" icon={Copy} onClick={copyFollowup} disabled={!followup}>Copy</Button>
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>

      {/* ---------- dialogs ---------- */}
      <Modal open={askAnalyze} onClose={() => setAskAnalyze(false)} title={analyzed ? 'Re-analyze this meeting?' : 'Analyze with AI'}
        footer={<><Button variant="secondary" onClick={() => setAskAnalyze(false)}>Cancel</Button><Button variant="primary" icon={Sparkles} disabled={!ack} onClick={runAnalysis}>{analyzed ? 'Re-analyze' : 'Start analysis'}</Button></>}>
        <div className="stack" style={{ gap: 14 }}>
          <Alert tone="info" title="Your notes are processed externally">The full text of this meeting is sent to the configured AI provider{config?.ai_provider ? ` (${config.ai_provider})` : ''} to extract the information. Do not continue if the notes contain information you are not allowed to share.</Alert>
          {analyzed && <p className="muted small">Re-analysis replaces AI drafts you have not touched. Items you approved, edited or rejected are kept and never overwritten.</p>}
          <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" className="checkbox" style={{ marginTop: 3 }} checked={ack} onChange={(e) => setAck(e.target.checked)} data-autofocus />
            <span>I understand these notes will be sent to an external AI service.</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog open={Boolean(bulk)} loading={bulkBusy} title={bulk === 'approve' ? `Approve ${pluralize(selected.size, 'item')}?` : `Reject ${pluralize(selected.size, 'item')}?`}
        confirmLabel={bulk === 'approve' ? 'Yes, approve' : 'Yes, reject'} danger={bulk === 'reject'} onCancel={() => setBulk(null)} onConfirm={runBulk}
        message={bulk === 'approve' ? 'Approved action items move into task tracking and decisions are treated as confirmed. Only approve items you have checked against the source notes.' : 'Rejected items stay in this meeting but are excluded from tasks and reports. You can undo this later.'}>
        {bulk === 'approve' && selectedNeedConfirm > 0 && (
          <Alert tone="warning" title={`${pluralize(selectedNeedConfirm, 'item')} marked “Needs Confirmation”`}>The AI was unsure about these. Make sure you have verified them.</Alert>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={askRebuild} title="Replace the follow-up draft?" confirmLabel="Rebuild draft" onCancel={() => setAskRebuild(false)} onConfirm={rebuildFollowup}
        message="The draft will be rewritten from your approved decisions, tasks and questions. Your current edits to the draft will be replaced." />

      <ConfirmDialog open={askDelete} danger loading={deleting} title="Delete this meeting?" confirmLabel="Delete meeting" onCancel={() => setAskDelete(false)} onConfirm={deleteMeeting}
        message={`“${meeting.title}” and all decisions, tasks, risks, questions and analysis history extracted from it will be permanently deleted.`} />

      <ItemEditModal open={Boolean(edit) && edit.kind !== 'task'} kind={edit?.kind} item={edit?.item} saving={savingEdit} onClose={() => setEdit(null)} onSave={saveEdit} />
      <TaskFormModal open={edit?.kind === 'task'} task={edit?.kind === 'task' ? edit.item : null} onClose={() => setEdit(null)}
        onSaved={(t) => { replaceItem('task', t); setEdit(null); loadAll() }} />
    </>
  )
}
