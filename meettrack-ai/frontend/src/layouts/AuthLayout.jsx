import { Link, Navigate, Outlet } from 'react-router-dom'
import { FileSearch, ListChecks, ShieldCheck, UserCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const POINTS = [
  { icon: FileSearch, title: 'Notes in, structure out', text: 'Paste a transcript or upload a document. Get decisions, tasks, risks and open questions.' },
  { icon: UserCheck, title: 'You stay in control', text: 'Every item shows its source excerpt. Nothing is approved until you approve it.' },
  { icon: ShieldCheck, title: 'Never invents facts', text: 'Unknown owners and deadlines stay unknown instead of being guessed.' },
]

export default function AuthLayout() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/" replace />
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark"><ListChecks size={19} strokeWidth={2.6} /></span>
          <span>MeetTrack AI</span>
        </div>
        <div>
          <h2>Turn client meetings into clear, accountable action.</h2>
          <p className="lead">Built for project managers, consultants and agencies who cannot afford a missed follow-up.</p>
          <div className="auth-points">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <div className="auth-point" key={title}>
                <span className="ico"><Icon size={18} /></span>
                <div><strong>{title}</strong><span>{text}</span></div>
              </div>
            ))}
          </div>
        </div>
        <small style={{ color: '#64748b' }}>© {new Date().getFullYear()} MeetTrack AI</small>
      </aside>
      <main className="auth-main">
        <div className="auth-card"><Outlet /></div>
      </main>
    </div>
  )
}

export function AuthFooterLink({ text, to, label }) {
  return <p className="auth-foot">{text} <Link to={to} className="strong">{label}</Link></p>
}
