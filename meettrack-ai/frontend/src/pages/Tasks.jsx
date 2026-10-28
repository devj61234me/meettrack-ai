import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, CheckSquare, Download, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Button, { IconButton } from '../components/Button'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import Tabs from '../components/Tabs'
import TaskFormModal from '../components/TaskFormModal'
import { ConfirmDialog } from '../components/Modal'
import { PriorityBadge, ReviewBadge } from '../components/Badge'
import { EmptyState, ErrorState, TableSkeleton } from '../components/Feedback'
import { SelectField, TextField } from '../components/Field'
import { useAsync } from '../hooks/useAsync'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import { NOT_SPECIFIED, UNASSIGNED, formatDate } from '../utils/format'
import { PRIORITIES, TASK_STATUSES } from '../utils/constants'

const VIEWS = [
  { value: 'operational', label: 'Approved tasks' },
  { value: 'review', label: 'Awaiting review' },
  { value: 'rejected', label: 'Rejected' },
]
const SORTS = [
  { value: 'due_date', label: 'Due date (soonest)' }, { value: '-due_date', label: 'Due date (latest)' },
  { value: '-priority', label: 'Priority (high first)' }, { value: 'priority', label: 'Priority (low first)' },
  { value: 'title', label: 'Title A–Z' }, { value: '-created', label: 'Newest created' },
]

export default function Tasks() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const view = params.get('view') || 'operational'
  const [search, setSearch] = useState(params.get('search') || '')
  const debouncedSearch = useDebounce(search)
  const [owner, setOwner] = useState(params.get('owner') || '')
  const debouncedOwner = useDebounce(owner)
  const filters = {
    view, search: debouncedSearch, owner: debouncedOwner, status: params.get('status') || '', priority: params.get('priority') || '',
    meeting: params.get('meeting') || '', due_from: params.get('due_from') || '', due_to: params.get('due_to') || '',
    overdue: params.get('overdue') === 'true', open: params.get('open') === 'true', ordering: params.get('ordering') || 'due_date',
  }
  const page = Number(params.get('page') || 1)

  const meetingsList = useAsync(() => api.meetings.list({ page_size: 100, ordering: 'title' }), [])
  const { data, loading, error, reload } = useAsync(() => api.tasks.list({ ...filters, page }), [JSON.stringify(filters), page])
  const reviewCount = useAsync(() => api.tasks.list({ view: 'review', page_size: 1 }), [data?.count])

  const [editing, setEditing] = useState(null) // task | 'new'
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => { if ((params.get('search') || '') !== debouncedSearch) setParam('search', debouncedSearch) }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if ((params.get('owner') || '') !== debouncedOwner) setParam('owner', debouncedOwner) }, [debouncedOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = Boolean(filters.search || filters.owner || filters.status || filters.priority || filters.meeting || filters.due_from || filters.due_to || filters.overdue || filters.open)
  const clearFilters = () => { setSearch(''); setOwner(''); setParams(view === 'operational' ? {} : { view }, { replace: true }) }

  async function patch(task, body, message) {
    setBusyId(task.id)
    try { await api.tasks.update(task.id, body); if (message) toast.success(message); reload() } catch (err) { toast.error(err.message) } finally { setBusyId(null) }
  }
  async function review(task, action) {
    setBusyId(task.id)
    try { await api.items('task')[action](task.id); toast.success(action === 'approve' ? 'Task approved.' : 'Task rejected.'); reload() } catch (err) { toast.error(err.message) } finally { setBusyId(null) }
  }
  async function confirmDelete() {
    setDeleting(true)
    try { await api.tasks.remove(toDelete.id); toast.success('Task deleted.'); setToDelete(null); reload() } catch (err) { toast.error(err.message) } finally { setDeleting(false) }
  }
  async function exportCsv() {
    try { await api.tasks.exportCsv({ ...filters, page: undefined }); toast.success('CSV downloaded.') } catch (err) { toast.error(err.message) }
  }

  return (
    <>
      <PageHeader title="Tasks" subtitle="Approved action items from your meetings, plus any tasks you add yourself."
        actions={<><Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data?.count}>Export CSV</Button><Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New task</Button></>} />

      <div className="card">
        <div style={{ padding: '0 8px' }}>
          <Tabs label="Task views" value={view} onChange={(v) => { const next = new URLSearchParams(); if (v !== 'operational') next.set('view', v); setSearch(''); setOwner(''); setParams(next, { replace: true }) }}
            tabs={VIEWS.map((v) => ({ ...v, count: v.value === 'review' ? reviewCount.data?.count : undefined }))} />
        </div>
        <div className="filter-bar">
          <div style={{ flex: '2 1 200px' }}><TextField icon={Search} className="input-sm" aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {view === 'operational' && <div style={{ flex: '1 1 140px' }}><SelectField small aria-label="Filter by status" value={filters.status} onChange={(e) => setParam('status', e.target.value)} placeholder="Any status" options={TASK_STATUSES} /></div>}
          <div style={{ flex: '1 1 130px' }}><SelectField small aria-label="Filter by priority" value={filters.priority} onChange={(e) => setParam('priority', e.target.value)} placeholder="Any priority" options={[...PRIORITIES, { value: 'none', label: 'Not specified' }]} /></div>
          <div style={{ flex: '1 1 140px' }}><TextField className="input-sm" aria-label="Filter by owner" placeholder="Owner (or “unassigned”)" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          <div style={{ flex: '1 1 170px' }}>
            <SelectField small aria-label="Filter by meeting" value={filters.meeting} onChange={(e) => setParam('meeting', e.target.value)} placeholder="Any meeting"
              options={(meetingsList.data?.results || []).map((m) => ({ value: m.id, label: m.title }))} />
          </div>
          <div style={{ flex: '1 1 130px' }}><TextField type="date" className="input-sm" aria-label="Due from" title="Due from" value={filters.due_from} onChange={(e) => setParam('due_from', e.target.value)} /></div>
          <div style={{ flex: '1 1 130px' }}><TextField type="date" className="input-sm" aria-label="Due until" title="Due until" value={filters.due_to} onChange={(e) => setParam('due_to', e.target.value)} /></div>
          <div style={{ flex: '1 1 170px' }}><SelectField small aria-label="Sort tasks" value={filters.ordering} onChange={(e) => setParam('ordering', e.target.value)} options={SORTS} /></div>
          {view === 'operational' && (
            <label className="row small" style={{ cursor: 'pointer' }}>
              <input type="checkbox" className="checkbox" checked={filters.overdue} onChange={(e) => setParam('overdue', e.target.checked ? 'true' : '')} /> Overdue only
            </label>
          )}
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
        </div>

        {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data.count === 0 ? (
          hasFilters ? <EmptyState icon={Search} title="No tasks match your filters" action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
            : view === 'operational' ? <EmptyState icon={CheckSquare} title="No approved tasks yet" action={<Button variant="secondary" to="/meetings">Go to meetings</Button>}>Analyze a meeting and approve its action items — they will appear here for tracking. You can also add a task manually.</EmptyState>
              : view === 'review' ? <EmptyState icon={Check} title="Nothing waiting for review">Extracted action items that you have not approved or rejected yet will show up here.</EmptyState>
                : <EmptyState icon={CheckSquare} title="No rejected tasks" />
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="table table-stack">
                <thead><tr><th>Task</th><th>Meeting</th><th>Owner</th><th>Due date</th><th>Priority</th><th>{view === 'operational' ? 'Status' : 'Review'}</th><th /></tr></thead>
                <tbody>
                  {data.results.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Task">
                        <div className={`cell-title ${t.status === 'completed' ? 'done-text' : ''}`}>{t.title}</div>
                        {t.description && <div className="small muted clamp-2">{t.description}</div>}
                        {t.dependencies && <div className="small subtle">Depends on: {t.dependencies}</div>}
                      </td>
                      <td data-label="Meeting">{t.meeting ? <Link to={`/meetings/${t.meeting}`} className="row small" style={{ gap: 4 }}>{t.meeting_title}<ExternalLink size={12} /></Link> : <span className="not-set">None</span>}</td>
                      <td data-label="Owner">{t.owner_name || <span className="not-set">{UNASSIGNED}</span>}</td>
                      <td data-label="Due date" className="mono">
                        {t.due_date ? <span className={t.is_overdue ? 'overdue-text' : ''}>{formatDate(t.due_date)}{t.is_overdue && ' · overdue'}</span> : <span className="not-set">{NOT_SPECIFIED}</span>}
                      </td>
                      <td data-label="Priority"><PriorityBadge priority={t.priority} /></td>
                      <td data-label={view === 'operational' ? 'Status' : 'Review'}>
                        {view === 'operational' ? (
                          <select className="select select-sm" style={{ width: 140 }} value={t.status} disabled={busyId === t.id} aria-label={`Status of ${t.title}`}
                            onChange={(e) => patch(t, { status: e.target.value }, 'Status updated.')}>
                            {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : <ReviewBadge status={t.review_status} />}
                      </td>
                      <td className="actions">
                        {view === 'operational' && t.status !== 'completed' && <IconButton icon={Check} tone="ok" label={`Mark ${t.title} complete`} disabled={busyId === t.id} onClick={() => patch(t, { status: 'completed' }, 'Task marked complete.')} />}
                        {view !== 'operational' && t.review_status !== 'approved' && <IconButton icon={Check} tone="ok" label={`Approve ${t.title}`} disabled={busyId === t.id} onClick={() => review(t, 'approve')} />}
                        {view === 'review' && <IconButton icon={Trash2} tone="no" label={`Reject ${t.title}`} disabled={busyId === t.id} onClick={() => review(t, 'reject')} />}
                        <IconButton icon={Pencil} label={`Edit ${t.title}`} onClick={() => setEditing(t)} />
                        {view === 'operational' && <IconButton icon={Trash2} tone="no" label={`Delete ${t.title}`} onClick={() => setToDelete(t)} />}
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

      <TaskFormModal open={Boolean(editing)} task={editing === 'new' ? null : editing} meetings={meetingsList.data?.results || []}
        defaultMeeting={filters.meeting} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      <ConfirmDialog open={Boolean(toDelete)} danger loading={deleting} title="Delete this task?" confirmLabel="Delete task" onCancel={() => setToDelete(null)} onConfirm={confirmDelete}
        message={`“${toDelete?.title}” will be permanently deleted.`} />
    </>
  )
}
