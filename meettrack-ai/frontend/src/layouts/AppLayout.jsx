import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, ChevronRight, CheckSquare, LayoutDashboard, ListChecks, LogOut, Menu as MenuIcon, Plus, Settings } from 'lucide-react'
import Button from '../components/Button'
import Menu, { MenuItem } from '../components/Menu'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { displayName, initials } from '../utils/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/meetings', label: 'Meetings', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function pageTitle(pathname) {
  if (pathname === '/') return { title: 'Dashboard' }
  if (pathname === '/meetings') return { title: 'Meetings' }
  if (pathname === '/meetings/new') return { title: 'New meeting', parent: { to: '/meetings', label: 'Meetings' } }
  if (/^\/meetings\/\d+\/edit$/.test(pathname)) return { title: 'Edit meeting', parent: { to: '/meetings', label: 'Meetings' } }
  if (/^\/meetings\/\d+$/.test(pathname)) return { title: 'Review', parent: { to: '/meetings', label: 'Meetings' } }
  if (pathname === '/tasks') return { title: 'Tasks' }
  if (pathname === '/reports') return { title: 'Reports' }
  if (pathname === '/settings') return { title: 'Settings' }
  return { title: 'MeetTrack AI' }
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const { title, parent } = pageTitle(pathname)

  useEffect(() => { setNavOpen(false); window.scrollTo(0, 0) }, [pathname])
  useEffect(() => { document.title = `${title} · MeetTrack AI` }, [title])

  async function signOut() {
    await logout()
    toast.info('You have been signed out.')
    navigate('/login', { replace: true })
  }

  return (
    <div className="app">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brand-mark"><ListChecks size={19} strokeWidth={2.6} /></span>
          <span>MeetTrack AI<small>Meeting-to-action tracker</small></span>
        </Link>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={18} aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>Human-reviewed AI</strong>
          Nothing becomes a task until you approve it.
        </div>
      </aside>
      <div className={`scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation"><MenuIcon size={20} /></button>
          <div className="crumbs">
            {parent && <><Link to={parent.to}>{parent.label}</Link><ChevronRight size={15} aria-hidden="true" /></>}
            <strong className="truncate">{title}</strong>
          </div>
          <span className="spacer" />
          <Button variant="primary" icon={Plus} to="/meetings/new"><span className="hide-sm">New Meeting</span><span className="sr-only">New Meeting</span></Button>
          <Menu
            trigger={({ toggle, open }) => (
              <button className="user-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
                <span className="avatar">{initials(user)}</span>
              </button>
            )}
          >
            <div style={{ padding: '8px 10px' }}>
              <div className="strong truncate">{displayName(user)}</div>
              <div className="small muted truncate">{user?.email}</div>
            </div>
            <div className="menu-sep" />
            <MenuItem icon={Settings} onClick={() => navigate('/settings')}>Settings</MenuItem>
            <MenuItem icon={LogOut} onClick={signOut}>Sign out</MenuItem>
          </Menu>
        </header>
        <main className="content" id="main"><Outlet /></main>
      </div>
    </div>
  )
}
