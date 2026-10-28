import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { formatDate, initials, todayISO } from '../utils/format'
import { ApiError } from '../services/api'
import { ReviewBadge, PriorityBadge } from '../components/Badge'
import { ConfirmDialog } from '../components/Modal'
import { ToastProvider } from '../hooks/useToast'
import { AuthProvider } from '../hooks/useAuth'
import Login from '../pages/Login'

describe('format helpers', () => {
  it('formats dates and handles missing ones', () => {
    expect(formatDate('2026-11-05')).toBe('05 Nov 2026')
    expect(formatDate(null)).toBeNull()
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(initials({ first_name: 'Dev', last_name: 'Patel' })).toBe('DP')
  })
})

describe('ApiError', () => {
  it('exposes code, details and field messages', () => {
    const err = new ApiError(400, { error: { code: 'validation_error', message: 'Bad', details: { title: ['Required'] }, retryable: false } })
    expect(err.message).toBe('Bad')
    expect(err.fieldError('title')).toBe('Required')
    expect(err.fieldError('other')).toBeUndefined()
  })
})

describe('badges', () => {
  it('shows the four review labels', () => {
    render(<><ReviewBadge status="draft" /><ReviewBadge status="needs_confirmation" /><ReviewBadge status="approved" /><ReviewBadge status="rejected" /></>)
    for (const label of ['AI Draft', 'Needs Confirmation', 'Approved', 'Rejected']) expect(screen.getByText(label)).toBeInTheDocument()
  })
  it('never invents a priority', () => {
    render(<PriorityBadge priority={null} />)
    expect(screen.getByText('Not specified')).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('calls confirm and cancel handlers', async () => {
    const onConfirm = vi.fn(), onCancel = vi.fn()
    render(<ConfirmDialog open title="Delete?" confirmLabel="Yes" onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).toHaveBeenCalledOnce(); expect(onCancel).toHaveBeenCalledOnce()
  })
  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="Hidden" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Hidden')).toBeNull()
  })
})

describe('Login page', () => {
  const renderLogin = () => render(<MemoryRouter><ToastProvider><AuthProvider><Login /></AuthProvider></ToastProvider></MemoryRouter>)
  it('starts empty (no prefilled credentials) and validates required fields', async () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })
  it('toggles password visibility', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
  })
})
