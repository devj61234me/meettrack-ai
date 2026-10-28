import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarDays, CheckSquare, ClipboardCheck, FilePlus2, Hourglass } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Skeleton } from '../components/Feedback'
import { MeetingStatusBadge, TaskStatusBadge } from '../components/Badge'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { NOT_SPECIFIED, UNASSIGNED, formatDate } from '../utils/format'
import { TASK_STATUSES } from '../utils/constants'

const STATUS_COLORS = { pending: '#94a3b8', in_progress: '#4338ca', blocked: '#dc2626', completed: '#16a34a' }

function StatCard({ icon: Icon, label, value, tone = 'indigo', to, hint }) {
  const body = (
    <>
      <span className={`stat-icon tone-${tone}`}><Icon size={19} /></span>
      <div>
        <div className="stat-value mono">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="small subtle">{hint}</div>}
      </div>
    </>
  )
  return to ? <Link to={to} className="card stat-card">{body}</Link> : <div className="card stat-card">{body}</div>
}

function TaskRow({ task }) {
  return (
    <li className="mini-row">
      <div style={{ minWidth: 0 }}>
        <div className="cell-title truncate">{task.title}</div>
        <div className="small muted truncate">
          {task.meeting ? <Link to={`/meetings/${task.meeting}`}>{task.meeting_title}</Link> : 'No meeting'} · {task.owner_name || UNASSIGNED}
        </div>
      </div>
      <span className="spacer" />
      <div style={{ textAlign: 'right' }}>
        <div className={task.is_overdue ? 'overdue-text small' : 'small'}>{formatDate(task.due_date) || <span className="not-set">{NOT_SPECIFIED}</span>}</div>
        <TaskStatusBadge status={task.status} />
      </div>
    </li>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(() => api.dashboard(), [])

  if (error && !data) return <ErrorState error={error} onRetry={reload} />
  if (loading && !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={92} style={{ borderRadius: 14 }} />)}</div>
      </>
    )
  }

  if (data.total_meetings === 0) {
    return (
      <>
        <PageHeader title={`Welcome${user?.first_name ? `, ${user.first_name}` : ''}`} subtitle="Your dashboard fills in as you add real meetings." />
        <div className="card">
          <EmptyState icon={FilePlus2} title="Create your first meeting" action={<Button variant="primary" size="lg" icon={FilePlus2} to="/meetings/new">Create your first meeting</Button>}>
            Paste your notes or upload a document. MeetTrack AI will draft the decisions, tasks, risks and open questions — you review and approve them.
          </EmptyState>
        </div>
      </>
    )
  }

  const chartData = TASK_STATUSES.map((s) => ({ name: s.label, key: s.value, value: data.task_status_counts[s.value] || 0 })).filter((d) => d.value > 0)
  const totalTracked = chartData.reduce((n, d) => n + d.value, 0)

  return (
    <>
      <PageHeader title={`Hello${user?.first_name ? `, ${user.first_name}` : ''}`} subtitle="Here is where your meeting follow-ups stand." />

      <div className="stat-grid">
        <StatCard icon={CalendarDays} label="Total meetings" value={data.total_meetings} to="/meetings" />
        <StatCard icon={Hourglass} tone="amber" label="Awaiting review" value={data.meetings_awaiting_review} to="/meetings?status=needs_review" hint={data.pending_item_count ? `${data.pending_item_count} items to confirm` : undefined} />
        <StatCard icon={CheckSquare} tone="green" label="Open approved tasks" value={data.open_task_count} to="/tasks?open=true" />
        <StatCard icon={AlertTriangle} tone="red" label="Overdue tasks" value={data.overdue_count} to="/tasks?overdue=true" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head"><CalendarClock size={18} className="muted" /><h3>Upcoming deadlines</h3><span className="muted small">next 14 days</span></div>
          {data.upcoming_deadlines.length ? (
            <ul className="mini-list">{data.upcoming_deadlines.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
          ) : <p className="card-body muted">No approved tasks are due in the next 14 days.</p>}
        </section>

        <section className="card">
          <div className="card-head"><AlertTriangle size={18} className="muted" /><h3>Tasks requiring attention</h3></div>
          {data.attention_tasks.length ? (
            <ul className="mini-list">{data.attention_tasks.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
          ) : <p className="card-body muted">Nothing is overdue or blocked.</p>}
        </section>

        <section className="card">
          <div className="card-head"><ClipboardCheck size={18} className="muted" /><h3>Recent meetings</h3><span className="spacer" /><Link to="/meetings" className="small strong">View all</Link></div>
          <ul className="mini-list">
            {data.recent_meetings.map((m) => (
              <li key={m.id} className="mini-row">
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title truncate"><Link to={`/meetings/${m.id}`}>{m.title}</Link></div>
                  <div className="small muted truncate">{m.client_name || 'No client'} · {formatDate(m.meeting_date)}</div>
                </div>
                <span className="spacer" />
                <MeetingStatusBadge status={m.review_status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head"><CheckSquare size={18} className="muted" /><h3>Approved task status</h3></div>
          {totalTracked ? (
            <div className="chart-box">
              <div style={{ width: 170, height: 170 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {chartData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="legend">
                {TASK_STATUSES.map((s) => (
                  <li key={s.value}><i style={{ background: STATUS_COLORS[s.value] }} />{s.label}<strong className="mono">{data.task_status_counts[s.value] || 0}</strong></li>
                ))}
              </ul>
            </div>
          ) : <p className="card-body muted">Approve tasks from a meeting review to see their status here.</p>}
        </section>
      </div>
    </>
  )
}
