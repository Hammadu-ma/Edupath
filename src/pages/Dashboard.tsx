import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Trash2 } from 'lucide-react'
import { Alert, Button, PageShell, Spinner } from '../components/ui'
import { addAvailability, getAvailability, getMyTutorProfile, removeAvailability, submitForVerification, updateMyTutorProfile, listBookings, type TutorEdit } from '../lib/db'
import { WEEKDAYS, friendlyError, minutesLabel, missingProfileItems, validateWindow } from '../lib/booking'
import { CITY_SUGGESTIONS, LEVELS, SUBJECT_SUGGESTIONS, type AvailabilityRow, type OwnTutorProfile } from '../lib/types'
import { useAuth } from '../lib/auth'

const LANGS = ['Amharic', 'English', 'Afan Oromo', 'Tigrinya', 'Somali']
const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export default function Dashboard() {
  const a = useAuth()
  const [p, setP] = useState<OwnTutorProfile | null | undefined>(undefined)
  const [form, setForm] = useState<TutorEdit | null>(null)
  const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false); const [submitting, setSubmitting] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [pending, setPending] = useState(0)

  const load = useCallback(async () => {
    try {
      const t = await getMyTutorProfile(); setP(t)
      if (t) setForm({ headline: t.headline, bio: t.bio, teaching_modes: t.teaching_modes, subjects: t.subjects, grade_levels: t.grade_levels, languages: t.languages, hourly_rate_etb: t.hourly_rate_etb, service_area: t.service_area, travel_radius_km: t.travel_radius_km, university: t.university, field_of_study: t.field_of_study, qualifications: t.qualifications, accepting_bookings: t.accepting_bookings })
      const b = await listBookings(); setPending(b.filter(x => x.status === 'pending' && x.tutor_id === a.user?.id).length)
    } catch (e) { setError(friendlyError((e as Error).message)); setP(null) }
  }, [a.user?.id])
  useEffect(() => { void load() }, [load])

  if (p === undefined) return <PageShell title="Dashboard"><Spinner /></PageShell>
  if (p === null || !form) return <PageShell title="Dashboard">{error ? <Alert kind="error">{error}</Alert> : <Alert kind="info">No tutor profile found for your account.</Alert>}</PageShell>

  const set = <K extends keyof TutorEdit>(k: K, v: TutorEdit[K]) => setForm({ ...form, [k]: v })
  const missing = missingProfileItems({ headline: form.headline, bio: form.bio, subjects: form.subjects, grade_levels: form.grade_levels, teaching_modes: form.teaching_modes, hourly_rate_etb: form.hourly_rate_etb, service_area: form.service_area, qualifications: form.qualifications })
  const canSubmit = (p.verification_status === 'incomplete' || p.verification_status === 'rejected') && missing.length === 0

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    if (form!.hourly_rate_etb != null && (form!.hourly_rate_etb < 0 || !Number.isFinite(form!.hourly_rate_etb))) { setError('Enter a valid price.'); return }
    setSaving(true)
    try {
      await updateMyTutorProfile({ ...form!, headline: form!.headline?.trim() || null, bio: form!.bio?.trim() || null, service_area: form!.service_area?.trim() || null, qualifications: form!.qualifications?.trim() || null, university: form!.university?.trim() || null, field_of_study: form!.field_of_study?.trim() || null })
      setNotice('Profile saved.'); await load()
    } catch (err) { setError(friendlyError((err as Error).message)) } finally { setSaving(false) }
  }
  async function submitVerification() {
    setError(''); setNotice(''); setSubmitting(true)
    try { await updateMyTutorProfile(form!); await submitForVerification(); setNotice('Submitted! An EduPath administrator will review your profile.'); await load() }
    catch (err) { setError(friendlyError((err as Error).message)) } finally { setSubmitting(false) }
  }
  const status = p.verification_status
  return <PageShell title={p.kind === 'mentor' ? 'Mentor dashboard' : 'Tutor dashboard'} subtitle="Manage your public profile, availability and requests."
    actions={<div className="head-actions"><Button to="/bookings" variant="secondary">Booking requests{pending > 0 && <span className="count">{pending}</span>}</Button>{status === 'verified' && <Button to={`/tutors/${p.user_id}`} variant="ghost">View public profile</Button>}</div>}>
    <section className={`card status-card v-${status}`}>
      {status === 'incomplete' && <><h2>Finish your profile</h2><p>Learners can’t see you until EduPath verifies your profile. {missing.length > 0 ? <>Still needed: {missing.join(', ')}.</> : 'Everything required is filled in — submit it for review.'}</p></>}
      {status === 'pending' && <><h2>Under review</h2><p>Your profile is waiting for an EduPath administrator. You’ll be notified of the outcome.</p></>}
      {status === 'verified' && <><h2><Check size={18} /> You’re verified</h2><p>Your profile is visible to learners{p.accepting_bookings ? '' : ', but you are currently not accepting new bookings'}.</p></>}
      {status === 'rejected' && <><h2>Changes needed</h2><p>{p.verification_note || 'Please review your details and resubmit.'}</p></>}
      {(status === 'incomplete' || status === 'rejected') && <Button onClick={submitVerification} busy={submitting} disabled={!canSubmit}>Submit for verification</Button>}
    </section>
    {notice && <Alert kind="success">{notice}</Alert>}{error && <Alert kind="error">{error}</Alert>}

    <form className="card form-card" onSubmit={save}>
      <h2>Public profile</h2>
      <label className="field">Headline<input value={form.headline ?? ''} maxLength={120} onChange={e => set('headline', e.target.value)} placeholder="e.g. Making high-school maths simple" /></label>
      <label className="field">About you<textarea rows={4} value={form.bio ?? ''} maxLength={1500} onChange={e => set('bio', e.target.value)} placeholder="Your experience and teaching approach (at least 30 characters)" /></label>
      {p.kind === 'mentor' && <div className="two-col"><label className="field">University<input value={form.university ?? ''} onChange={e => set('university', e.target.value)} /></label><label className="field">Field of study<input value={form.field_of_study ?? ''} onChange={e => set('field_of_study', e.target.value)} /></label></div>}
      <label className="field">Qualifications <small>(reviewed by EduPath; shown on your profile)</small><textarea rows={3} value={form.qualifications ?? ''} maxLength={1000} onChange={e => set('qualifications', e.target.value)} placeholder="Degrees, certificates, teaching experience" /></label>
      <fieldset className="field"><legend>Subjects</legend><div className="chips">{[...new Set([...SUBJECT_SUGGESTIONS, ...form.subjects])].map(s => <button type="button" key={s} aria-pressed={form.subjects.includes(s)} className={`chip toggle ${form.subjects.includes(s) ? 'on' : ''}`} onClick={() => set('subjects', toggle(form.subjects, s))}>{s}</button>)}</div>
        <div className="inline-add"><input aria-label="Add another subject" value={customSubject} maxLength={60} onChange={e => setCustomSubject(e.target.value)} placeholder="Add another subject" /><Button small variant="secondary" disabled={!customSubject.trim()} onClick={() => { const v = customSubject.trim(); if (v && !form.subjects.some(x => x.toLowerCase() === v.toLowerCase())) set('subjects', [...form.subjects, v]); setCustomSubject('') }}>Add</Button></div></fieldset>
      <fieldset className="field"><legend>Education levels</legend><div className="chips">{LEVELS.map(s => <button type="button" key={s} aria-pressed={form.grade_levels.includes(s)} className={`chip toggle ${form.grade_levels.includes(s) ? 'on' : ''}`} onClick={() => set('grade_levels', toggle(form.grade_levels, s))}>{s}</button>)}</div></fieldset>
      <fieldset className="field"><legend>Session types</legend><div className="chips">{[['online', 'Online'], ['in_person', 'In person']].map(([v, l]) => <button type="button" key={v} aria-pressed={form.teaching_modes.includes(v)} className={`chip toggle ${form.teaching_modes.includes(v) ? 'on' : ''}`} onClick={() => set('teaching_modes', toggle(form.teaching_modes, v))}>{l}</button>)}</div></fieldset>
      <fieldset className="field"><legend>Languages</legend><div className="chips">{LANGS.map(s => <button type="button" key={s} aria-pressed={form.languages.includes(s)} className={`chip toggle ${form.languages.includes(s) ? 'on' : ''}`} onClick={() => set('languages', toggle(form.languages, s))}>{s}</button>)}</div></fieldset>
      <div className="two-col">
        <label className="field">Price per hour (ETB)<input type="number" min={0} max={100000} inputMode="numeric" value={form.hourly_rate_etb ?? ''} onChange={e => set('hourly_rate_etb', e.target.value === '' ? null : Math.round(Number(e.target.value)))} /></label>
        <label className="field">Location (city)<input list="cities" value={form.service_area ?? ''} onChange={e => set('service_area', e.target.value)} /><datalist id="cities">{CITY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist></label>
      </div>
      {form.teaching_modes.includes('in_person') && <label className="field">Travel radius (km)<input type="number" min={0} max={999} value={form.travel_radius_km ?? ''} onChange={e => set('travel_radius_km', e.target.value === '' ? null : Number(e.target.value))} /></label>}
      <label className="check"><input type="checkbox" checked={form.accepting_bookings} onChange={e => set('accepting_bookings', e.target.checked)} /> I’m accepting new booking requests</label>
      <Button type="submit" busy={saving}>Save profile</Button>
    </form>
    <AvailabilityEditor />
  </PageShell>
}

function AvailabilityEditor() {
  const [rows, setRows] = useState<AvailabilityRow[] | null>(null)
  const [weekday, setWeekday] = useState(1); const [start, setStart] = useState(540); const [end, setEnd] = useState(1020)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const { user } = useAuth()
  const load = useCallback(async () => { if (user) setRows(await getAvailability(user.id)) }, [user])
  useEffect(() => { load().catch(e => { setError(friendlyError((e as Error).message)); setRows([]) }) }, [load])
  const options = Array.from({ length: 49 }, (_, i) => i * 30)
  async function add() {
    setError('')
    const problem = validateWindow({ weekday, start_min: start, end_min: end }, rows ?? [])
    if (problem) { setError(problem); return }
    setBusy(true)
    try { await addAvailability({ weekday, start_min: start, end_min: end }); await load() } catch (e) { setError(friendlyError((e as Error).message)) } finally { setBusy(false) }
  }
  async function del(id: string) { try { await removeAvailability(id); await load() } catch (e) { setError(friendlyError((e as Error).message)) } }
  return <section className="card form-card"><h2>Weekly availability</h2><p className="muted small">Times repeat every week, in Ethiopian time. Learners can request sessions inside these windows.</p>
    {rows === null ? <Spinner /> : rows.length === 0 ? <p className="muted">No availability yet — add your first window below.</p>
      : <ul className="avail-edit">{rows.map(r => <li key={r.id}><span><strong>{WEEKDAYS[r.weekday]}</strong> {minutesLabel(r.start_min)} – {minutesLabel(r.end_min)}</span><button className="icon-button" aria-label={`Remove ${WEEKDAYS[r.weekday]} ${minutesLabel(r.start_min)}`} onClick={() => del(r.id)}><Trash2 size={16} /></button></li>)}</ul>}
    <div className="avail-add">
      <label className="field">Day<select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <label className="field">From<select value={start} onChange={e => setStart(Number(e.target.value))}>{options.filter(m => m < 1440).map(m => <option key={m} value={m}>{minutesLabel(m)}</option>)}</select></label>
      <label className="field">To<select value={end} onChange={e => setEnd(Number(e.target.value))}>{options.filter(m => m > 0).map(m => <option key={m} value={m}>{m === 1440 ? '12:00 am (midnight)' : minutesLabel(m)}</option>)}</select></label>
      <Button variant="secondary" onClick={add} busy={busy}>Add window</Button>
    </div>
    {error && <Alert kind="error">{error}</Alert>}
    <p className="muted small">Pending and accepted bookings automatically block their time. <Link className="text-link" to="/bookings">See bookings</Link></p>
  </section>
}
