export const TASK_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
]

export const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const REVIEW_LABELS = {
  draft: 'AI Draft',
  needs_confirmation: 'Needs Confirmation',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const MEETING_STATUS_LABELS = {
  not_analyzed: 'Not analyzed',
  analyzing: 'Analyzing…',
  failed: 'Analysis failed',
  needs_review: 'Needs review',
  reviewed: 'Reviewed',
}

export const RISK_TYPE_LABELS = {
  explicit: 'Stated in meeting',
  inferred: 'Inferred by AI',
  dependency: 'Dependency',
  blocker: 'Blocker',
}

export const MAX_UPLOAD_MB_DEFAULT = 5
export const PENDING = ['draft', 'needs_confirmation']
