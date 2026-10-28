import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Download, FileText, FileType2, Pencil, Search, Sparkles, Trash2, Eye } from 'lucide-react'
import Button, { IconButton } from '../components/Button'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import Menu, { MenuItem } from '../components/Menu'
import { ConfirmDialog } from '../components/Modal'
import { MeetingStatusBadge } from '../components/Badge'
import { EmptyState, ErrorState, TableSkeleton } from '../components/Feedback'
import { SelectField, TextField } from '../components/Field'
import { useAsync } from '../hooks/useAsync'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import { formatDate, timeAgo } from '../utils/format'
import { MEETING_STATUS_LABELS } from '../utils/constants'

const STATUS_OPTIONS = [
  { value: 'not_analyzed', label: MEETING_STATUS_LABELS.not_analyzed },
  { value: 'needs_review', label: MEETING_STATUS_LABELS.needs_review },
  { value: 'reviewed', label: MEETING_STATUS_LABELS.reviewed },
  { value: 'failed', label: MEETING_STATUS_LABELS.failed },
]

export default function Meetings() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState(params.get('search') || '')
  const debounced = useDebounce(search)
  const status = params.get('status') || ''
  const ordering = params.get('ordering') || '-meeting_date'
  const page = Number(params.get('page') || 1)
  const dateFrom = params.get('date_from') || ''
  const dateTo = params.get('date_to') || ''
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useAsync(
    () => api.meetings.list({ search: debounced, status, ordering, page, date_from: dateFrom, date_to: dateTo }),
    [debounced, status, ordering, page, dateFrom, dateTo],
  )

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  // keep the URL in sync with the debounced search text
  useEffect(() => {
    if ((params.get('search') || '') !== debounced) setParam('search', debounced)
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = Boolean(debounced || status || dateFrom || dateTo)
  const clearFilters = () => { setSearch(''); setParams({}, { replace: true }) }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.meetings.remove(toDelete.id)
      toast.success('Meeting deleted.')
      setToDelete(null)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function exportReport(id, file) {
    try { await api.meetings.downloadReport(id, file); toast.success('Report downloaded.') } catch (err) { toast.error(err.message) }
  }

  return (
    <>
      <PageHeader title="Meetings" subtitle="All your client meetings and their review status." actions={<Button variant="primary" icon={CalendarPlus} to="/meetings/new">New Meeting</Button>} />

      <div className="card">
        <div className="filter-bar">
          <div style={{ flex: '2 1 220px' }}>
            <TextField icon={Search} placeholder="Search by title or client" aria-label="Search meetings" value={search} onChange={(e) => setSearch(e.target.value)} className="input-sm" />
          </div>
          <div style={{ flex: '1 1 150px' }}><SelectField small aria-label="Filter by status" value={status} onChange={(e) => setParam('status', e.target.value)} placeholder="All statuses" options={STATUS_OPTIONS} /></div>
          <div style={{ flex: '1 1 140px' }}><TextField type="date" className="input-sm" aria-label="Meetings from" title="From date" value={dateFrom} onChange={(e) => setParam('date_from', e.target.value)} /></div>
          <div style={{ flex: '1 1 140px' }}><TextField type="date" className="input-sm" aria-label="Meetings until" title="Until date" value={dateTo} onChange={(e) => setParam('date_to', e.target.value)} /></div>
          <div style={{ flex: '1 1 160px' }}>
            <SelectField small aria-label="Sort meetings" value={ordering} onChange={(e) => setParam('ordering', e.target.value)} options={[
              { value: '-meeting_date', label: 'Newest meeting first' }, { value: 'meeting_date', label: 'Oldest meeting first' },
              { value: '-updated_at', label: 'Recently updated' }, { value: 'title', label: 'Title A–Z' },
            ]} />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
        </div>

        {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data.count === 0 ? (
          hasFilters ? (
            <EmptyState icon={Search} title="No meetings match your filters" action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}>Try a different search or remove a filter.</EmptyState>
          ) : (
            <EmptyState icon={CalendarPlus} title="No meetings yet" action={<Button variant="primary" icon={CalendarPlus} to="/meetings/new">Create your first meeting</Button>}>
              Add your first client meeting to extract decisions, action items, risks and open questions.
            </EmptyState>
          )
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="table table-stack">
                <thead>
                  <tr><th>Meeting</th><th>Client / project</th><th>Date</th><th>Status</th><th className="num">Approved tasks</th><th>Updated</th><th /></tr>
                </thead>
                <tbody>
                  {data.results.map((m) => (
                    <tr key={m.id}>
                      <td data-label="Meeting"><div className="cell-title"><Link to={`/meetings/${m.id}`}>{m.title}</Link></div>
                        {m.pending_review_count > 0 && <div className="small muted">{m.pending_review_count} item{m.pending_review_count === 1 ? '' : 's'} to review</div>}</td>
                      <td data-label="Client">{m.client_name || <span className="not-set">Not specified</span>}</td>
                      <td data-label="Date" className="mono">{formatDate(m.meeting_date)}</td>
                      <td data-label="Status"><MeetingStatusBadge status={m.review_status} /></td>
                      <td data-label="Approved tasks" className="num mono">{m.approved_task_count}</td>
                      <td data-label="Updated" className="muted small">{timeAgo(m.updated_at)}</td>
                      <td className="actions">
                        <IconButton icon={Eye} label={`Open ${m.title}`} onClick={() => navigate(`/meetings/${m.id}`)} />
                        <IconButton icon={Pencil} label={`Edit ${m.title}`} onClick={() => navigate(`/meetings/${m.id}/edit`)} />
                        <IconButton icon={Sparkles} label={m.analysis_status === 'completed' ? `Re-analyze ${m.title}` : `Analyze ${m.title}`}
                          onClick={() => navigate(`/meetings/${m.id}`, { state: { autoAnalyze: true } })} />
                        <Menu trigger={({ toggle }) => <IconButton icon={Download} label={`Export ${m.title}`} onClick={toggle} />}>
                          <MenuItem icon={FileText} onClick={() => exportReport(m.id, 'pdf')}>Report (PDF)</MenuItem>
                          <MenuItem icon={FileType2} onClick={() => exportReport(m.id, 'docx')}>Report (Word)</MenuItem>
                        </Menu>
                        <IconButton icon={Trash2} tone="no" label={`Delete ${m.title}`} onClick={() => setToDelete(m)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPage={(p) => setParam('page', String(p))} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)} danger loading={deleting} title="Delete this meeting?" confirmLabel="Delete meeting"
        message={`“${toDelete?.title}” and everything extracted from it — decisions, tasks, risks, questions and analysis history — will be permanently deleted. This cannot be undone.`}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete}
      />
    </>
  )
}
