import { MEETING_STATUS_LABELS, REVIEW_LABELS, RISK_TYPE_LABELS, TASK_STATUSES } from '../utils/constants'

export function Badge({ tone = 'neutral', children, dot = true, title }) {
  return <span className={`badge badge-${tone} ${dot ? '' : 'no-dot'}`} title={title}>{children}</span>
}

// "AI Draft" / "Needs Confirmation" / "Approved" / "Rejected"
const REVIEW_TONES = { draft: 'indigo', needs_confirmation: 'warning', approved: 'success', rejected: 'danger' }
export function ReviewBadge({ status }) {
  return <Badge tone={REVIEW_TONES[status] || 'neutral'}>{REVIEW_LABELS[status] || status}</Badge>
}

const TASK_TONES = { pending: 'neutral', in_progress: 'info', blocked: 'danger', completed: 'success' }
export function TaskStatusBadge({ status }) {
  const label = TASK_STATUSES.find((s) => s.value === status)?.label || status
  return <Badge tone={TASK_TONES[status] || 'neutral'}>{label}</Badge>
}

const MEETING_TONES = { not_analyzed: 'neutral', analyzing: 'info', failed: 'danger', needs_review: 'warning', reviewed: 'success' }
export function MeetingStatusBadge({ status }) {
  return <Badge tone={MEETING_TONES[status] || 'neutral'}>{MEETING_STATUS_LABELS[status] || status}</Badge>
}

const PRIORITY_TONES = { high: 'danger', medium: 'warning', low: 'neutral' }
export function PriorityBadge({ priority }) {
  if (!priority) return <span className="not-set">Not specified</span>
  return <Badge tone={PRIORITY_TONES[priority]} dot={false}>{priority[0].toUpperCase() + priority.slice(1)}</Badge>
}

export function RiskTypeBadge({ type }) {
  return <Badge tone={type === 'inferred' ? 'warning' : 'neutral'} dot={false}>{RISK_TYPE_LABELS[type] || type}</Badge>
}
