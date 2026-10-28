import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Download, FileText, FileType2 } from 'lucide-react'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import Tabs from '../components/Tabs'
import { PriorityBadge, TaskStatusBadge } from '../components/Badge'
import { EmptyState, ErrorState, TableSkeleton } from '../components/Feedback'
import { SelectField } from '../components/Field'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import { NOT_SPECIFIED, UNASSIGNED, formatDate } from '../utils/format'

const REPORTS = [
  { value: 'meeting', label: 'Meeting report' },
  { value: 'approved', label: 'Approved tasks' },
  { value: 'outstanding', label: 'Outstanding tasks' },
  { value: 'overdue', label: 'Overdue tasks' },
  { value: 'questions', label: 'Unanswered questions' },
]
const TASK_PARAMS = {
  approved: { view: 'operational' },
  outstanding: { view: 'operational', open: true },
  overdue: { overdue: true },
}
const DESCRIPTIONS = {
  approved: 'Every task you have approved, in any status.',
  outstanding: 'Approved tasks that are not completed yet.',
  overdue: 'Approved, unfinished tasks whose due date has passed. Tasks without a due date are never listed here.',
  questions: 'Approved open questions that still need an answer from the client or team.',
}

function MeetingReportPanel() {
  const toast = useToast()
  const [meetingId, setMeetingId] = useState('')
  const [busy, setBusy] = useState('')
  const meetings = useAsync(() => api.meetings.list({ page_size: 100, status: '' }), [])
  const options = (meetings.data?.results || []).filter((m) => m.analysis_status === 'completed')

  async function download(file) {
    setBusy(file)
    try { await api.meetings.downloadReport(meetingId, file); toast.success('Report downloaded.') } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  if (meetings.loading && !meetings.data) return <TableSkeleton rows={3} />
  if (!options.length) return <EmptyState icon={FileText} title="No analyzed meetings yet" action={<Button variant="secondary" to="/meetings">Go to meetings</Button>}>Analyze a meeting first, then download its report here.</EmptyState>
  return (
    <div className="card-body stack" style={{ maxWidth: 520 }}>
      <p className="muted">A meeting report contains the summary, approved decisions, action items, risks, open questions and the follow-up draft. Items you have not approved are left out.</p>
      <SelectField label="Meeting" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} placeholder="Choose a meeting…" options={options.map((m) => ({ value: m.id, label: `${m.title} · ${formatDate(m.meeting_date)}` }))} />
      <div className="row-wrap">
        <Button variant="primary" icon={FileText} disabled={!meetingId} loading={busy === 'pdf'} onClick={() => download('pdf')}>Download PDF</Button>
        <Button variant="secondary" icon={FileType2} disabled={!meetingId} loading={busy === 'docx'} onClick={() => download('docx')}>Download Word</Button>
      </div>
    </div>
  )
}

function TaskReport({ kind }) {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const params = { ...TASK_PARAMS[kind], ordering: 'due_date' }
  const { data, loading, error, reload } = useAsync(() => api.tasks.list({ ...params, page }), [kind, page])
  async function exportCsv() { try { await api.tasks.exportCsv(params); toast.success('CSV downloaded.') } catch (err) { toast.error(err.message) } }
  return (
    <>
      <div className="report-head"><p className="muted">{DESCRIPTIONS[kind]}</p><Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data?.count}>Export CSV</Button></div>
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data.count === 0 ? (
        <EmptyState icon={BarChart3} title={kind === 'overdue' ? 'Nothing is overdue' : 'No tasks to report'}>{kind === 'overdue' ? 'Great — no approved task has passed its due date.' : 'Approve tasks from a meeting review to see them here.'}</EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Task</th><th>Meeting</th><th>Owner</th><th>Due date</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>{data.results.map((t) => (
                <tr key={t.id}>
                  <td data-label="Task" className="cell-title">{t.title}</td>
                  <td data-label="Meeting">{t.meeting ? <Link to={`/meetings/${t.meeting}`}>{t.meeting_title}</Link> : <span className="not-set">None</span>}</td>
                  <td data-label="Owner">{t.owner_name || <span className="not-set">{UNASSIGNED}</span>}</td>
                  <td data-label="Due date" className="mono">{t.due_date ? <span className={t.is_overdue ? 'overdue-text' : ''}>{formatDate(t.due_date)}</span> : <span className="not-set">{NOT_SPECIFIED}</span>}</td>
                  <td data-label="Priority"><PriorityBadge priority={t.priority} /></td>
                  <td data-label="Status"><TaskStatusBadge status={t.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </>
  )
}

function QuestionReport() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(() => api.questions.list({ review_status: 'approved', page }), [page])
  async function exportCsv() { try { await api.questions.exportCsv(); toast.success('CSV downloaded.') } catch (err) { toast.error(err.message) } }
  return (
    <>
      <div className="report-head"><p className="muted">{DESCRIPTIONS.questions}</p><Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data?.count}>Export CSV</Button></div>
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data.count === 0 ? (
        <EmptyState icon={BarChart3} title="No approved open questions">Approve questions in a meeting review to list them here.</EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table-stack">
              <thead><tr><th>Question</th><th>Why it matters</th><th>Suggested contact</th><th>Meeting</th></tr></thead>
              <tbody>{data.results.map((q) => (
                <tr key={q.id}>
                  <td data-label="Question" className="cell-title">{q.text}</td>
                  <td data-label="Why">{q.reason || <span className="not-set">{NOT_SPECIFIED}</span>}</td>
                  <td data-label="Contact">{q.suggested_contact || <span className="not-set">{NOT_SPECIFIED}</span>}</td>
                  <td data-label="Meeting"><Link to={`/meetings/${q.meeting}`}>{q.meeting_title}</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('meeting')
  return (
    <>
      <PageHeader title="Reports" subtitle="Reports are built only from records you have reviewed and approved." />
      <div className="card">
        <div style={{ padding: '0 8px' }}><Tabs label="Reports" tabs={REPORTS} value={tab} onChange={setTab} /></div>
        {tab === 'meeting' && <MeetingReportPanel />}
        {(tab === 'approved' || tab === 'outstanding' || tab === 'overdue') && <TaskReport key={tab} kind={tab} />}
        {tab === 'questions' && <QuestionReport />}
      </div>
    </>
  )
}
