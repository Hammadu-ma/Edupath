import { Link } from 'react-router-dom'
import { GraduationCap, Loader2 } from 'lucide-react'
import type { BookingStatus } from '../lib/booking'

export function Avatar({ initials, color = 'blue', size = 'normal' }: { initials: string; color?: string; size?: string }) {
  return <div className={`avatar ${color} ${size}`} aria-hidden="true">{initials}</div>
}
export function Brand() {
  return <Link className="brand" to="/"><span className="brand-mark"><GraduationCap size={22} /></span><span>Edu<span>Path</span></span></Link>
}
type BtnProps = {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; onClick?: () => void
  type?: 'button' | 'submit'; disabled?: boolean; busy?: boolean; to?: string; small?: boolean; ariaLabel?: string
}
export function Button({ children, variant = 'primary', onClick, type = 'button', disabled, busy, to, small, ariaLabel }: BtnProps) {
  const cls = `button ${variant}${small ? ' small' : ''}${busy || disabled ? ' is-disabled' : ''}`
  if (to && !disabled) return <Link className={cls} to={to} aria-label={ariaLabel}>{children}</Link>
  return <button type={type} onClick={onClick} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} aria-label={ariaLabel}>
    {busy && <Loader2 size={15} className="spin" aria-hidden="true" />}{children}
  </button>
}
export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: React.ReactNode }) {
  return <p className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>
}
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-block" role="status"><Loader2 className="spin" size={20} aria-hidden="true" /> <span>{label}</span></div>
}
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="empty-block"><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>
}
const STATUS_LABEL: Record<BookingStatus, string> = { pending: 'Pending', accepted: 'Accepted', rejected: 'Declined', cancelled: 'Cancelled', completed: 'Completed' }
export const StatusBadge = ({ status }: { status: BookingStatus }) => <span className={`status-badge s-${status}`}>{STATUS_LABEL[status]}</span>
export function PageShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <main className="page container"><div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions}</div>{children}</main>
}
export function ConfigMissing() {
  return <main className="page container"><Alert kind="error">EduPath is not connected to its database. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see README → Configuration), then reload.</Alert></main>
}
