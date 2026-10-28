// One place for every request to the Django API. Components never call fetch directly.

const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const TOKEN_KEY = 'meettrack_token'

// The token is kept in localStorage; every access is wrapped because storage can be blocked.
export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set(token) { try { localStorage.setItem(TOKEN_KEY, token) } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error || {}
    super(err.message || 'Something went wrong. Please try again.')
    this.status = status
    this.code = err.code || 'error'
    this.details = err.details || {}
    this.retryable = err.retryable
  }
  // First message for a field, e.g. fieldError('title')
  fieldError(name) {
    const v = this.details?.[name]
    return Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined
  }
}

function buildQuery(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.append(k, v === true ? 'true' : v)
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function request(path, { method = 'GET', body, params, form, blob = false } = {}) {
  const headers = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Token ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }

  let res
  try {
    res = await fetch(`${BASE}${path}${buildQuery(params)}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, { error: { code: 'network_error', message: 'Cannot reach the server. Check that the backend is running and try again.' } })
  }

  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch { /* not JSON */ }
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      tokenStore.clear()
      onUnauthorized()
    }
    throw new ApiError(res.status, data)
  }
  if (res.status === 204) return null
  return blob ? res.blob() : res.json()
}

async function download(path, params, filename) {
  const file = await request(path, { params, blob: true })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const api = {
  config: () => request('/config/'),

  auth: {
    register: (data) => request('/auth/register/', { method: 'POST', body: data }),
    login: (data) => request('/auth/login/', { method: 'POST', body: data }),
    logout: () => request('/auth/logout/', { method: 'POST' }),
    me: () => request('/auth/me/'),
    updateMe: (data) => request('/auth/me/', { method: 'PATCH', body: data }),
    changePassword: (data) => request('/auth/change-password/', { method: 'POST', body: data }),
    signOutEverywhere: () => request('/auth/sign-out-everywhere/', { method: 'POST' }),
    requestReset: (email) => request('/auth/password-reset/', { method: 'POST', body: { email } }),
    confirmReset: (data) => request('/auth/password-reset/confirm/', { method: 'POST', body: data }),
    deleteAccount: (password) => request('/auth/delete-account/', { method: 'POST', body: { password } }),
  },

  meetings: {
    list: (params) => request('/meetings/', { params }),
    get: (id) => request(`/meetings/${id}/`),
    create: (data) => request('/meetings/', { method: 'POST', body: data }),
    update: (id, data) => request(`/meetings/${id}/`, { method: 'PATCH', body: data }),
    remove: (id) => request(`/meetings/${id}/`, { method: 'DELETE' }),
    extractText: (file) => { const form = new FormData(); form.append('file', file); return request('/meetings/extract-text/', { method: 'POST', form }) },
    analyze: (id) => request(`/meetings/${id}/analyze/`, { method: 'POST', body: { acknowledge_external_processing: true } }),
    analysis: (id) => request(`/meetings/${id}/analysis/`),
    saveFollowup: (id, text) => request(`/meetings/${id}/analysis/`, { method: 'PATCH', body: { followup_draft: text } }),
    rebuildFollowup: (id) => request(`/meetings/${id}/followup/rebuild/`, { method: 'POST' }),
    bulkReview: (id, action, items) => request(`/meetings/${id}/review/`, { method: 'POST', body: { action, items, confirm: true } }),
    downloadReport: (id, file) => download(`/meetings/${id}/report/`, { file }, `meeting-report-${id}.${file}`),
  },

  // decisions, risks and questions share the same review endpoints
  items: (kind) => ({
    update: (id, data) => request(`/${kind}s/${id}/`, { method: 'PATCH', body: data }),
    approve: (id) => request(`/${kind}s/${id}/approve/`, { method: 'POST' }),
    reject: (id) => request(`/${kind}s/${id}/reject/`, { method: 'POST' }),
    reset: (id) => request(`/${kind}s/${id}/reset/`, { method: 'POST' }),
  }),
  questions: { list: (params) => request('/questions/', { params }), exportCsv: (params) => download('/reports/questions/export/', params, 'meettrack-questions.csv') },

  tasks: {
    list: (params) => request('/tasks/', { params }),
    create: (data) => request('/tasks/', { method: 'POST', body: data }),
    update: (id, data) => request(`/tasks/${id}/`, { method: 'PATCH', body: data }),
    remove: (id) => request(`/tasks/${id}/`, { method: 'DELETE' }),
    exportCsv: (params) => download('/tasks/export/', params, 'meettrack-tasks.csv'),
  },

  dashboard: () => request('/dashboard/stats/'),
}
