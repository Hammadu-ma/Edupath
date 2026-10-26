import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, BookOpen, CalendarDays, ChevronDown, Compass, Menu, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { Brand, Button } from './ui'
import { useAuth } from '../lib/auth'
import { listNotifications, markNotificationsRead } from '../lib/db'
import type { Notification } from '../lib/types'
import { isSupabaseConfigured } from '../lib/supabase'

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}

function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const close = useCallback(() => setOpen(false), [])
  const ref = useClickAway(open, close)
  const load = useCallback(async () => { try { setItems(await listNotifications()) } catch { /* transient; retried on next poll */ } }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    return () => clearInterval(t)
  }, [load])
  const unread = items.filter(i => !i.is_read).length
  async function readAll() { await markNotificationsRead().catch(() => undefined); await load() }
  async function openItem(n: Notification) {
    setOpen(false)
    if (!n.is_read) { await markNotificationsRead([n.id]).catch(() => undefined); void load() }
    if (n.link) navigate(n.link)
  }
  return <div className="menu-wrap" ref={ref}>
    <button className="icon-button notification" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load() }}>
      <Bell size={19} />{unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div className="dropdown notif-panel" role="dialog" aria-label="Notifications">
      <div className="dropdown-head"><strong>Notifications</strong>{unread > 0 && <button className="link-btn" onClick={readAll}>Mark all read</button>}</div>
      {items.length === 0 ? <p className="dropdown-empty">You’re all caught up.</p> : <ul>{items.map(n => <li key={n.id}>
        <button className={n.is_read ? '' : 'unread'} onClick={() => openItem(n)}><strong>{n.title}</strong>{n.body && <span>{n.body}</span>}<small>{new Date(n.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Addis_Ababa', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></button>
      </li>)}</ul>}
    </div>}
  </div>
}

function AccountMenu() {
  const a = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useClickAway(open, close)
  const go = (to: string) => { setOpen(false); navigate(to) }
  return <div className="menu-wrap" ref={ref}>
    <button className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="account-initial" aria-hidden="true">{(a.displayName || a.user?.email || '?')[0]?.toUpperCase()}</span>
      <span className="account-name">{a.displayName || 'Account'}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="dropdown account-panel" role="menu">
      <button role="menuitem" onClick={() => go('/bookings')}>My bookings</button>
      <button role="menuitem" onClick={() => go('/messages')}>Messages</button>
      {a.isLearner && <button role="menuitem" onClick={() => go('/favorites')}>Saved tutors</button>}
      {a.isEducator && <button role="menuitem" onClick={() => go('/dashboard')}>Tutor dashboard</button>}
      {a.isAdmin && <button role="menuitem" onClick={() => go('/admin')}>Admin</button>}
      <button role="menuitem" onClick={() => go('/account')}>Account settings</button>
      <button role="menuitem" className="danger" onClick={async () => { setOpen(false); await a.signOut(); navigate('/') }}>Log out</button>
    </div>}
  </div>
}

export default function Layout() {
  const a = useAuth()
  const loc = useLocation()
  const [mobileMenu, setMobileMenu] = useState(false)
  const authPage = ['/login', '/get-started', '/forgot-password', '/reset-password', '/auth/callback'].includes(loc.pathname)

  useEffect(() => { setMobileMenu(false) }, [loc.pathname, loc.hash])
  useEffect(() => {   // anchor links on the home page and scroll-to-top on route change
    if (loc.hash) { const el = document.getElementById(loc.hash.slice(1)); if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 30); return } }
    window.scrollTo(0, 0)
  }, [loc.pathname, loc.hash])

  const signedIn = Boolean(a.session)
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar"><div className="nav-inner"><Brand />
      <nav aria-label="Main" className={mobileMenu ? 'nav-links open' : 'nav-links'}>
        <NavLink to="/" end>Home</NavLink>
        <Link to={{ pathname: '/', hash: '#discover' }}>Find a tutor</Link>
        <Link to={{ pathname: '/', hash: '#mentors' }}>Find a mentor</Link>
        <Link to={{ pathname: '/', hash: '#how' }}>How it works</Link>
        <NavLink to="/trust">Trust &amp; safety</NavLink>
      </nav>
      <div className="nav-actions">
        {signedIn && isSupabaseConfigured && <NotificationBell />}
        {signedIn ? <AccountMenu /> : <><Button variant="ghost" to="/login">Log in</Button><Button to="/get-started">Get started <ArrowRight size={16} /></Button></>}
      </div>
      <button className="menu-toggle" aria-label="Toggle menu" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button>
    </div></header>
    <div id="main-content" tabIndex={-1}><Outlet /></div>
    {!authPage && <footer className="footer"><div className="container footer-top">
      <div className="footer-brand"><Brand /><p>Learn today. Achieve tomorrow.<br />Your path, your possibilities.</p></div>
      <div className="footer-col"><strong>Discover</strong><Link to={{ pathname: '/', hash: '#discover' }}>Find a tutor</Link><Link to={{ pathname: '/', hash: '#mentors' }}>Meet a mentor</Link><Link to={{ pathname: '/', hash: '#how' }}>How it works</Link></div>
      <div className="footer-col"><strong>EduPath</strong><Link to="/trust">Trust &amp; safety</Link></div>
      <div className="footer-col"><strong>For educators</strong><Link to="/get-started?role=tutor">Become a tutor</Link><Link to="/get-started?role=mentor">Become a mentor</Link></div>
    </div><div className="container footer-bottom"><span>© 2026 EduPath. Built for brighter futures.</span><span><ShieldCheck size={14} /> Designed with trust in mind</span></div></footer>}
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">
      <NavLink to="/" end><BookOpen size={19} /><span>Home</span></NavLink>
      <Link to={{ pathname: '/', hash: '#discover' }}><Compass size={19} /><span>Discover</span></Link>
      <NavLink to="/bookings"><CalendarDays size={19} /><span>Bookings</span></NavLink>
      <NavLink to="/messages"><MessageCircle size={19} /><span>Messages</span></NavLink>
    </nav>
  </div>
}
