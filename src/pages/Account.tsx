import { useState } from 'react'
import { Alert, Button, PageShell } from '../components/ui'
import { useAuth } from '../lib/auth'
import { becomeTutor, updateProfile } from '../lib/db'
import { friendlyError } from '../lib/booking'
import { supabase } from '../lib/supabase'

export default function Account() {
  const a = useAuth()
  const [name, setName] = useState(a.displayName)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [pw, setPw] = useState(''); const [pwBusy, setPwBusy] = useState(false); const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('')
  const [becoming, setBecoming] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setErr('')
    if (name.trim().length < 2) { setErr('Enter your name.'); return }
    setSaving(true)
    try { await updateProfile(name, a.language); await a.refresh(); setMsg('Saved.') } catch (x) { setErr(friendlyError((x as Error).message)) } finally { setSaving(false) }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(''); setPwErr('')
    if (pw.length < 8) { setPwErr('Use at least 8 characters.'); return }
    setPwBusy(true)
    const { error } = await supabase!.auth.updateUser({ password: pw })
    setPwBusy(false)
    if (error) setPwErr(friendlyError(error.message)); else { setPw(''); setPwMsg('Password updated.') }
  }
  async function become(kind: 'tutor' | 'mentor') {
    setBecoming(kind); setErr('')
    try { await becomeTutor(kind); await a.refresh(); setMsg(`Your ${kind} profile has been created. Complete it from your dashboard.`) } catch (x) { setErr(friendlyError((x as Error).message)) } finally { setBecoming('') }
  }
  return <PageShell title="Account settings">
    <form className="card form-card" onSubmit={save}>
      <h2>Profile</h2>
      <label className="field">Email<input value={a.user?.email ?? ''} disabled readOnly /></label>
      <label className="field">Full name<input value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
      <p className="muted small">Account type: {a.roles.length ? a.roles.join(', ') : '—'}{a.isAdmin ? ' · administrator' : ''}</p>
      {msg && <Alert kind="success">{msg}</Alert>}{err && <Alert kind="error">{err}</Alert>}
      <Button type="submit" busy={saving}>Save changes</Button>
    </form>
    {!a.isEducator && <section className="card form-card"><h2>Teach on EduPath</h2><p className="muted">Offer tutoring or mentoring. Your profile becomes visible after EduPath verifies it.</p>
      <div className="head-actions"><Button variant="secondary" busy={becoming === 'tutor'} onClick={() => become('tutor')}>Become a tutor</Button><Button variant="secondary" busy={becoming === 'mentor'} onClick={() => become('mentor')}>Become a mentor</Button></div></section>}
    <form className="card form-card" onSubmit={changePw}>
      <h2>Change password</h2>
      <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={e => setPw(e.target.value)} /></label>
      {pwMsg && <Alert kind="success">{pwMsg}</Alert>}{pwErr && <Alert kind="error">{pwErr}</Alert>}
      <Button type="submit" busy={pwBusy} variant="secondary">Update password</Button>
    </form>
  </PageShell>
}
