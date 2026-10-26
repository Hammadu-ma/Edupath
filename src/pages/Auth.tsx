import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, GraduationCap, Heart, MapPin, ShieldCheck, Target } from 'lucide-react'
import { supabase, siteUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/booking'
import { Alert, Button, ConfigMissing, Spinner } from '../components/ui'

function CenterCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <main className="auth-center"><div className="modal static"><div className="modal-symbol"><GraduationCap size={25} /></div><h1 className="modal-title">{title}</h1>{subtitle && <p className="modal-subtitle">{subtitle}</p>}{children}</div></main>
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Login() {
  const a = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const next = (loc.state as { next?: string } | null)?.next ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [info, setInfo] = useState('')
  if (!supabase) return <ConfigMissing />
  if (a.session && !a.loading) return <Navigate to={next} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo(''); setNeedsConfirm(false)
    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return }
    if (!password) { setError('Enter your password.'); return }
    setBusy(true)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      if (/email not confirmed/i.test(error.message)) { setNeedsConfirm(true); setError('Please confirm your email first. Check your inbox for the confirmation link.') }
      else if (/invalid login credentials/i.test(error.message)) setError('Incorrect email or password.')
      else setError(friendlyError(error.message))
      return
    }
    a.clearExpired(); nav(next, { replace: true })
  }
  async function resend() {
    setInfo(''); const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${siteUrl}/auth/callback` } })
    if (error) setError(friendlyError(error.message)); else setInfo('Confirmation email sent. It may take a minute to arrive.')
  }
  return <CenterCard title="Welcome back" subtitle="Your next step is waiting for you.">
    {a.sessionExpired && <Alert kind="info">Your session expired. Please log in again.</Alert>}
    <form onSubmit={submit} className="auth-form" noValidate>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></label>
      <Link className="text-link small" to="/forgot-password">Forgot your password?</Link>
      <Button type="submit" busy={busy}>{busy ? 'Signing in…' : 'Log in'} <ArrowRight size={16} /></Button>
      {error && <Alert kind="error">{error}</Alert>}
      {needsConfirm && <Button variant="secondary" onClick={resend} disabled={!EMAIL_RE.test(email)}>Resend confirmation email</Button>}
      {info && <Alert kind="success">{info}</Alert>}
    </form>
    <p className="modal-foot">New to EduPath? <Link to="/get-started">Create an account</Link></p>
  </CenterCard>
}

const ROLES = [
  { id: 'student', label: 'Student', sub: 'Grow your skills', icon: <BookOpen size={20} /> },
  { id: 'parent', label: 'Parent', sub: 'Support a learner', icon: <Heart size={20} /> },
  { id: 'tutor', label: 'Tutor', sub: 'Teach subjects', icon: <GraduationCap size={20} /> },
  { id: 'mentor', label: 'Mentor', sub: 'Guide futures', icon: <Target size={20} /> },
] as const

export function SignUp() {
  const a = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const initial = ROLES.some(r => r.id === params.get('role')) ? (params.get('role') as string) : 'student'
  const [role, setRole] = useState(initial)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [info, setInfo] = useState('')
  if (!supabase) return <ConfigMissing />
  if (a.session && !a.loading) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) { setError('Enter your full name.'); return }
    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return }
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
    setBusy(true)
    // The role is only a *request*: the database trigger whitelists it (never "admin"), and tutor/mentor
    // profiles stay hidden from the public until an administrator verifies them.
    const { data, error } = await supabase!.auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: name.trim(), role }, emailRedirectTo: `${siteUrl}/auth/callback` },
    })
    setBusy(false)
    if (error) { setError(/already registered/i.test(error.message) ? 'An account with this email already exists. Try logging in.' : friendlyError(error.message)); return }
    if (data.user && data.user.identities && data.user.identities.length === 0) { setError('An account with this email already exists. Try logging in.'); return }
    if (data.session) { nav(role === 'tutor' || role === 'mentor' ? '/dashboard' : '/', { replace: true }); return }
    setSent(true)
  }
  async function resend() {
    setInfo(''); const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${siteUrl}/auth/callback` } })
    if (error) setError(friendlyError(error.message)); else setInfo('Confirmation email sent again.')
  }
  return <main className="signup-page"><div className="signup-card">
    <Link className="back-link" to="/">← Back to home</Link>
    <div className="signup-heading"><div className="modal-symbol"><GraduationCap size={25} /></div><div className="eyebrow">WELCOME TO EDUPATH</div><h1>Let's start your<br /><span>next chapter.</span></h1><p>Create an account to find learning support that fits your goals.</p></div>
    {sent ? <div className="auth-form"><Alert kind="success">Almost there! We sent a confirmation link to <strong>{email}</strong>. Open it to activate your account, then log in.</Alert>
      <Button variant="secondary" onClick={resend}>Resend email</Button>{info && <Alert kind="success">{info}</Alert>}{error && <Alert kind="error">{error}</Alert>}
      <Button to="/login">Go to log in <ArrowRight size={16} /></Button></div>
    : <form className="auth-form" onSubmit={submit} noValidate>
      <fieldset className="role-fieldset"><legend>I’m joining as</legend>
        <div className="role-picker four" role="radiogroup" aria-label="Account type">{ROLES.map(r => <button type="button" role="radio" aria-checked={role === r.id} key={r.id} className={`role-option ${role === r.id ? 'chosen' : ''}`} onClick={() => setRole(r.id)}>{r.icon}<strong>{r.label}</strong><small>{r.sub}</small>{role === r.id && <span className="role-check"><Check size={13} /></span>}</button>)}</div>
        {(role === 'tutor' || role === 'mentor') && <p className="hint">Tutor and mentor profiles become visible to learners only after EduPath verifies them.</p>}
      </fieldset>
      <label>Full name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" autoComplete="name" maxLength={100} /></label>
      <label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
      <label>Password<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label>
      <Button type="submit" busy={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={16} /></Button>
      {error && <Alert kind="error">{error}</Alert>}
      <p className="privacy-note"><ShieldCheck size={15} /> Your information stays private. We only share what’s needed to connect you safely.</p>
      <p className="modal-foot">Already have an account? <Link to="/login">Log in</Link></p>
    </form>}
  </div>
  <aside className="signup-aside"><div className="signup-aside-inner"><span className="aside-spark">✦</span><div className="aside-art"><GraduationCap size={88} /></div><h2>Every big future<br />starts <span>somewhere.</span></h2><p>Find your people, build your confidence, and make your next step count.</p><div className="aside-pill"><ShieldCheck size={15} /> Trust-minded learning</div><div className="aside-pill"><MapPin size={15} /> Near you or online</div></div></aside></main>
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  if (!supabase) return <ConfigMissing />
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return }
    setBusy(true)
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${siteUrl}/reset-password` })
    setBusy(false)
    if (error && !/rate limit|security purposes/i.test(error.message)) { setError(friendlyError(error.message)); return }
    if (error) { setError('Please wait a minute before requesting another email.'); return }
    setDone(true)
  }
  return <CenterCard title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
    {done ? <Alert kind="success">If an account exists for that address, a reset link is on its way. Check your inbox.</Alert>
    : <form className="auth-form" onSubmit={submit} noValidate>
      <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
      <Button type="submit" busy={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>{error && <Alert kind="error">{error}</Alert>}</form>}
    <p className="modal-foot"><Link to="/login">← Back to log in</Link></p>
  </CenterCard>
}

export function ResetPassword() {
  const a = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false)
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t) }, [])
  if (!supabase) return <ConfigMissing />
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (pw.length < 8) { setError('Use a password of at least 8 characters.'); return }
    if (pw !== pw2) { setError('The two passwords do not match.'); return }
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setError(friendlyError(error.message)); return }
    setDone(true); setTimeout(() => nav('/', { replace: true }), 1500)
  }
  return <CenterCard title="Choose a new password">
    {done ? <Alert kind="success">Password updated. Taking you home…</Alert>
    : a.session ? <form className="auth-form" onSubmit={submit} noValidate>
      <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required /></label>
      <Button type="submit" busy={busy}>{busy ? 'Saving…' : 'Update password'}</Button>{error && <Alert kind="error">{error}</Alert>}</form>
    : waited || !a.loading && waited ? <><Alert kind="error">This reset link is invalid or has expired.</Alert><Button to="/forgot-password">Request a new link</Button></>
    : <Spinner label="Checking your reset link…" />}
  </CenterCard>
}

export function AuthCallback() {
  const a = useAuth()
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 3000); return () => clearTimeout(t) }, [])
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const err = hashParams.get('error_description') || new URLSearchParams(window.location.search).get('error_description')
  if (!supabase) return <ConfigMissing />
  if (err) return <CenterCard title="That link didn’t work"><Alert kind="error">{err.replace(/\+/g, ' ')}</Alert><Button to="/login">Go to log in</Button></CenterCard>
  if (a.session && !a.loading) return <Navigate to={a.isEducator ? '/dashboard' : '/'} replace />
  if (waited) return <CenterCard title="Email confirmed"><Alert kind="success">Your email is confirmed. Please log in to continue.</Alert><Button to="/login">Log in</Button></CenterCard>
  return <CenterCard title="Confirming your email…"><Spinner label="Signing you in…" /></CenterCard>
}
