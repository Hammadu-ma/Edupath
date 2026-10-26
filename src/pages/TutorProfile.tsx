import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, CalendarDays, GraduationCap, Heart, Languages, MapPin, ShieldCheck, Star } from 'lucide-react'
import { Alert, Avatar, Button, EmptyState, Spinner } from '../components/ui'
import { Rating } from '../components/TutorCard'
import { useAuth } from '../lib/auth'
import { getAvailability, getBusySlots, getTutor, getTutorReviews, requestBooking } from '../lib/db'
import { DURATIONS, MAX_AHEAD_DAYS, WEEKDAYS, etb, formatDay, formatRange, formatTime, friendlyError, generateSlots, minutesLabel, sessionPrice, validateBookingInput } from '../lib/booking'
import { colorOf, initialsOf, modesLabel, MODE_LABEL, type AvailabilityRow, type PublicReview, type PublicTutor } from '../lib/types'
import { useFavorites } from '../lib/useFavorites'

export default function TutorProfile() {
  const { id = '' } = useParams()
  const fav = useFavorites()
  const [tutor, setTutor] = useState<PublicTutor | null | undefined>(undefined)
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [avail, setAvail] = useState<AvailabilityRow[]>([])
  const [busy, setBusy] = useState<{ starts_at: string; ends_at: string }[]>([])
  const [error, setError] = useState('')

  const loadBusy = useCallback(async () => {
    const now = new Date()
    setBusy(await getBusySlots(id, now, new Date(now.getTime() + MAX_AHEAD_DAYS * 86400000)))
  }, [id])
  useEffect(() => {
    let stale = false
    setTutor(undefined); setError('')
    Promise.all([getTutor(id), getTutorReviews(id), getAvailability(id), loadBusy()])
      .then(([t, r, av]) => { if (!stale) { setTutor(t); setReviews(r); setAvail(av) } })
      .catch(e => { if (!stale) { setError(friendlyError((e as Error).message)); setTutor(null) } })
    return () => { stale = true }
  }, [id, loadBusy])

  if (tutor === undefined) return <main className="page container"><Spinner label="Loading profile…" /></main>
  if (tutor === null) return <main className="page container"><EmptyState title="This profile isn’t available" action={<Button to="/" variant="secondary">Back to discover</Button>}>{error || 'It may have been removed, or it hasn’t been verified yet.'}</EmptyState></main>

  const color = colorOf(tutor.user_id)
  const saved = fav.ids.has(tutor.user_id)
  const byDay = WEEKDAYS.map((d, i) => ({ d, rows: avail.filter(r => r.weekday === i) })).filter(x => x.rows.length)
  return <main className="page container profile-page">
    <Link className="back-link" to="/">← Back to discover</Link>
    <div className="profile-layout">
      <div className="profile-main">
        <section className="card profile-head">
          <Avatar initials={initialsOf(tutor.display_name)} color={color} size="large" />
          <div className="profile-head-text">
            <span className="verified inline"><ShieldCheck size={13} /> Verified by EduPath</span>
            <h1>{tutor.display_name}</h1>
            {tutor.headline && <p className="headline">{tutor.headline}</p>}
            <div className="tutor-meta"><Rating avg={tutor.avg_rating} count={tutor.review_count} />{tutor.service_area && <span><MapPin size={14} /> {tutor.service_area}</span>}<span><BookOpen size={14} /> {modesLabel(tutor.teaching_modes)}</span></div>
          </div>
          <button className={`button secondary${saved ? ' saved' : ''}`} onClick={() => fav.toggle(tutor.user_id)} aria-pressed={saved}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
        </section>
        {fav.error && <Alert kind="error">{fav.error}</Alert>}
        {tutor.bio && <section className="card"><h2>About</h2><p className="prose">{tutor.bio}</p></section>}
        <section className="card"><h2>Teaching</h2>
          <dl className="facts">
            <div><dt><GraduationCap size={15} /> Subjects</dt><dd className="chips">{tutor.subjects.map(s => <span className="chip" key={s}>{s}</span>)}</dd></div>
            <div><dt>Levels</dt><dd className="chips">{tutor.grade_levels.map(s => <span className="chip" key={s}>{s}</span>)}</dd></div>
            {tutor.languages.length > 0 && <div><dt><Languages size={15} /> Languages</dt><dd>{tutor.languages.join(', ')}</dd></div>}
            {(tutor.university || tutor.field_of_study) && <div><dt>Background</dt><dd>{[tutor.field_of_study, tutor.university].filter(Boolean).join(' · ')}</dd></div>}
            {tutor.qualifications && <div><dt>Qualifications</dt><dd className="prose">{tutor.qualifications}</dd></div>}
            {tutor.travel_radius_km != null && tutor.teaching_modes.includes('in_person') && <div><dt>Travel radius</dt><dd>{tutor.travel_radius_km} km</dd></div>}
          </dl>
        </section>
        <section className="card"><h2><CalendarDays size={18} /> Weekly availability</h2>
          {byDay.length === 0 ? <p className="muted">This tutor hasn’t published availability yet.</p> : <ul className="avail-list">{byDay.map(x => <li key={x.d}><strong>{x.d}</strong><span>{x.rows.map(r => `${minutesLabel(r.start_min)} – ${minutesLabel(r.end_min)}`).join(', ')}</span></li>)}</ul>}
          <p className="muted small">Times are shown in Ethiopian time (Africa/Addis Ababa).</p>
        </section>
        <section className="card"><h2><Star size={18} /> Reviews {tutor.review_count > 0 && <small>({tutor.review_count})</small>}</h2>
          {reviews.length === 0 ? <p className="muted">No reviews yet. Reviews appear after a learner completes a session.</p> : <ul className="reviews">{reviews.map(r => <li key={r.id}><div className="review-top"><strong>{r.reviewer_first_name}</strong><span className="stars" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><small>{formatDay(r.created_at)}</small></div>{r.comment && <p>{r.comment}</p>}</li>)}</ul>}
        </section>
      </div>
      <aside className="profile-side"><BookingPanel tutor={tutor} avail={avail} busy={busy} reloadBusy={loadBusy} /></aside>
    </div>
  </main>
}

function BookingPanel({ tutor, avail, busy, reloadBusy }: { tutor: PublicTutor; avail: AvailabilityRow[]; busy: { starts_at: string; ends_at: string }[]; reloadBusy: () => Promise<void> }) {
  const a = useAuth()
  const [subject, setSubject] = useState(tutor.subjects[0] ?? '')
  const [mode, setMode] = useState(tutor.teaching_modes[0] ?? '')
  const [duration, setDuration] = useState<number>(60)
  const [days, setDays] = useState(14)
  const [start, setStart] = useState<Date | null>(null)
  const [dayKey, setDayKey] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const slotDays = useMemo(() => generateSlots({ availability: avail, busy, durationMin: duration, days }), [avail, busy, duration, days])
  const activeDay = slotDays.find(d => d.key === dayKey) ?? slotDays[0]
  useEffect(() => { if (start && !slotDays.some(d => d.slots.some(s => s.getTime() === start.getTime()))) setStart(null) }, [slotDays, start])

  const price = tutor.hourly_rate_etb == null ? null : sessionPrice(tutor.hourly_rate_etb, duration)
  const isSelf = a.user?.id === tutor.user_id

  if (!a.session) return <div className="card booking-card"><h2>Request a session</h2><p className="muted">Log in or create a free account to request a time with {tutor.display_name.split(' ')[0]}.</p><Button to="/login" >Log in to continue</Button><Link className="text-link small" to="/get-started">Create an account</Link></div>
  if (isSelf) return <div className="card booking-card"><h2>This is your public profile</h2><p className="muted">Learners see this page. Manage your details and availability in your dashboard.</p><Button to="/dashboard" variant="secondary">Open dashboard</Button></div>
  if (!a.loading && !a.isLearner) return <div className="card booking-card"><h2>Student account needed</h2><p className="muted">Only student and parent accounts can request sessions.</p></div>
  if (!tutor.accepting_bookings) return <div className="card booking-card"><h2>Not taking bookings</h2><p className="muted">{tutor.display_name.split(' ')[0]} isn’t accepting new requests right now. You can save this profile and check back later.</p></div>
  if (tutor.hourly_rate_etb == null || avail.length === 0) return <div className="card booking-card"><h2>Not bookable yet</h2><p className="muted">This tutor hasn’t finished setting up a price and availability.</p></div>

  if (done) return <div className="card booking-card"><Alert kind="success">Request sent! {tutor.display_name.split(' ')[0]} will accept or decline it. Your session is only confirmed once it’s accepted.</Alert><Button to="/bookings">View my bookings</Button><Button variant="secondary" onClick={() => { setDone(false); setStart(null); setNote('') }}>Request another time</Button></div>

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const problem = validateBookingInput({ subject, mode, start, durationMin: duration, note })
    if (problem) { setError(problem); return }
    setSubmitting(true)
    try { await requestBooking({ tutorId: tutor.user_id, subject, mode, startsAt: start!, duration, note: note.trim() }); setDone(true); void reloadBusy() }
    catch (err) { setError(friendlyError((err as Error).message)); setStart(null); void reloadBusy().catch(() => undefined) }
    finally { setSubmitting(false) }
  }
  return <form className="card booking-card" onSubmit={submit} noValidate>
    <h2>Request a session</h2>
    <label className="field">Subject<select value={subject} onChange={e => setSubject(e.target.value)}>{tutor.subjects.map(s => <option key={s}>{s}</option>)}</select></label>
    <fieldset className="field"><legend>Session type</legend><div className="seg">{tutor.teaching_modes.map(m => <label key={m} className={mode === m ? 'on' : ''}><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {MODE_LABEL[m] ?? m}</label>)}</div></fieldset>
    <label className="field">Length<select value={duration} onChange={e => setDuration(Number(e.target.value))}>{DURATIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}</select></label>
    <div className="field"><span className="field-label">Pick a day</span>
      {slotDays.length === 0 ? <p className="muted small">No open times in the next {days} days for a {duration}-minute session.{days < MAX_AHEAD_DAYS && <> <button type="button" className="link-btn" onClick={() => setDays(Math.min(MAX_AHEAD_DAYS, days + 14))}>Look further ahead</button></>}</p>
      : <><div className="day-strip" role="radiogroup" aria-label="Day">{slotDays.map(d => <button type="button" role="radio" aria-checked={d.key === activeDay?.key} key={d.key} className={d.key === activeDay?.key ? 'on' : ''} onClick={() => { setDayKey(d.key); setStart(null) }}>{formatDay(d.date)}</button>)}</div>
        {days < MAX_AHEAD_DAYS && <button type="button" className="link-btn" onClick={() => setDays(Math.min(MAX_AHEAD_DAYS, days + 14))}>Show later dates</button>}
        <span className="field-label">Pick a time <small>(Ethiopian time)</small></span>
        <div className="slot-grid" role="radiogroup" aria-label="Time">{activeDay?.slots.map(s => <button type="button" role="radio" aria-checked={start?.getTime() === s.getTime()} key={s.toISOString()} className={start?.getTime() === s.getTime() ? 'on' : ''} onClick={() => setStart(s)}>{formatTime(s)}</button>)}</div></>}
    </div>
    <label className="field">Note for the tutor <small>(optional)</small><textarea rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="What would you like to focus on?" /><small className="muted">{note.length}/500</small></label>
    {mode === 'in_person' && <p className="muted small">For in-person sessions, agree the place with your tutor in messages after they accept.</p>}
    <div className="price-row"><span>Estimated price</span><strong>{etb(price)}</strong></div>
    {start && <p className="muted small">{formatRange(start.toISOString(), new Date(start.getTime() + duration * 60000).toISOString())}</p>}
    <p className="muted small">No payment is taken in EduPath. Agree payment directly with your tutor.</p>
    {error && <Alert kind="error">{error}</Alert>}
    <Button type="submit" busy={submitting} disabled={!start}>{submitting ? 'Sending request…' : 'Send request'}</Button>
  </form>
}
