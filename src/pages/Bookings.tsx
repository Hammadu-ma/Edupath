import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, Clock, MessageCircle, Star } from 'lucide-react'
import { Alert, Button, EmptyState, PageShell, Spinner, StatusBadge } from '../components/ui'
import { useAuth } from '../lib/auth'
import { cancelBooking, completeBooking, listBookings, respondBooking, submitReview } from '../lib/db'
import { allowedActions, etb, formatRange, friendlyError, type BookingAction } from '../lib/booking'
import { MODE_LABEL, type BookingRow } from '../lib/types'

type Tab = 'upcoming' | 'completed' | 'closed'
export default function Bookings() {
  const a = useAuth()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState('')
  const [reviewing, setReviewing] = useState('')
  const tab = (['upcoming', 'completed', 'closed'].includes(params.get('tab') ?? '') ? params.get('tab') : 'upcoming') as Tab

  const load = useCallback(async () => {
    try { setRows(await listBookings()); setError('') } catch (e) { setError(friendlyError((e as Error).message)); setRows(r => r ?? []) }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    return () => clearInterval(t)
  }, [load])

  const me = a.user?.id
  const now = new Date()
  const groups = useMemo(() => {
    const r = rows ?? []
    return {
      upcoming: r.filter(b => b.status === 'pending' || b.status === 'accepted').sort((x, y) => +new Date(x.starts_at) - +new Date(y.starts_at)),
      completed: r.filter(b => b.status === 'completed'),
      closed: r.filter(b => b.status === 'cancelled' || b.status === 'rejected'),
    }
  }, [rows])
  const pendingForMe = (rows ?? []).filter(b => b.status === 'pending' && b.tutor_id === me).length

  async function run(b: BookingRow, action: BookingAction) {
    setNotice(''); setError('')
    if (action === 'cancel' && !window.confirm('Cancel this booking? The other person will be notified.')) return
    setWorking(b.id + action)
    try {
      if (action === 'accept') await respondBooking(b.id, true)
      else if (action === 'reject') await respondBooking(b.id, false)
      else if (action === 'cancel') await cancelBooking(b.id)
      else if (action === 'complete') await completeBooking(b.id)
      setNotice(({ accept: 'Request accepted. The learner has been notified.', reject: 'Request declined.', cancel: 'Booking cancelled.', complete: 'Session marked as completed.' } as Record<string, string>)[action] ?? 'Done.')
      await load()
    } catch (e) { setError(friendlyError((e as Error).message)); await load() }
    finally { setWorking('') }
  }

  const list = groups[tab]
  return <PageShell title="My bookings" subtitle="Requests and sessions you’ve sent or received.">
    <div className="tabs" role="tablist" aria-label="Booking filters">
      {(['upcoming', 'completed', 'closed'] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} onClick={() => setParams({ tab: t })}>
        {t === 'upcoming' ? 'Upcoming' : t === 'completed' ? 'Completed' : 'Cancelled / declined'} <span className="count">{groups[t].length}</span></button>)}
    </div>
    {pendingForMe > 0 && tab === 'upcoming' && <Alert kind="info">You have {pendingForMe} request{pendingForMe > 1 ? 's' : ''} waiting for your answer.</Alert>}
    {notice && <Alert kind="success">{notice}</Alert>}
    {error && <Alert kind="error">{error}</Alert>}
    {rows === null ? <Spinner /> : list.length === 0
      ? <EmptyState title={tab === 'upcoming' ? 'No upcoming sessions' : tab === 'completed' ? 'No completed sessions yet' : 'Nothing here'} action={tab === 'upcoming' && a.isLearner ? <Button to="/" variant="secondary">Find a tutor</Button> : undefined}>{tab === 'upcoming' ? 'Requests you send or receive will appear here.' : 'Sessions will show here once they change status.'}</EmptyState>
      : <ul className="booking-list">{list.map(b => {
        const party = b.tutor_id === me ? 'tutor' : 'student'
        const actions = allowedActions(b, party, now)
        const other = party === 'tutor' ? b.student_name : b.tutor_name
        return <li key={b.id} className="card booking-item">
          <div className="booking-top"><div><h3>{b.subject} <small>with {other}</small></h3><p className="muted"><CalendarDays size={14} /> {formatRange(b.starts_at, b.ends_at)}</p></div><StatusBadge status={b.status} /></div>
          <div className="booking-meta"><span><Clock size={14} /> {b.duration_minutes} min</span><span>{MODE_LABEL[b.mode]}</span><span>{etb(b.price_etb)}</span><span className="role-tag">{party === 'tutor' ? 'You are the tutor' : 'You are the learner'}</span></div>
          {b.note && <p className="booking-note">“{b.note}”</p>}
          {b.status === 'cancelled' && <p className="muted small">Cancelled by {b.cancelled_by === me ? 'you' : 'the other person'}{b.cancel_reason ? ` — ${b.cancel_reason}` : ''}.</p>}
          {b.status === 'pending' && party === 'student' && <p className="muted small">Waiting for {other} to respond. This time is held for you but not confirmed yet.</p>}
          <div className="booking-actions">
            {actions.includes('accept') && <Button small busy={working === b.id + 'accept'} onClick={() => run(b, 'accept')}>Accept</Button>}
            {actions.includes('reject') && <Button small variant="secondary" busy={working === b.id + 'reject'} onClick={() => run(b, 'reject')}>Decline</Button>}
            {actions.includes('complete') && <Button small busy={working === b.id + 'complete'} onClick={() => run(b, 'complete')}>Mark completed</Button>}
            {actions.includes('review') && <Button small variant="secondary" onClick={() => setReviewing(reviewing === b.id ? '' : b.id)}><Star size={14} /> Leave a review</Button>}
            {actions.includes('message') && b.conversation_id && <Button small variant="ghost" to={`/messages/${b.conversation_id}`}><MessageCircle size={14} /> Message</Button>}
            {actions.includes('cancel') && <Button small variant="danger" busy={working === b.id + 'cancel'} onClick={() => run(b, 'cancel')}>Cancel</Button>}
            {party === 'student' && <Link className="text-link small" to={`/tutors/${b.tutor_id}`}>View tutor</Link>}
          </div>
          {reviewing === b.id && <ReviewForm booking={b} onDone={async () => { setReviewing(''); setNotice('Thanks! Your review is now public on the tutor’s profile.'); await load() }} />}
        </li>
      })}</ul>}
  </PageShell>
}

function ReviewForm({ booking, onDone }: { booking: BookingRow; onDone: () => Promise<void> }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!rating) { setError('Choose a star rating.'); return }
    setBusy(true)
    try { await submitReview({ bookingId: booking.id, tutorId: booking.tutor_id, rating, comment }); await onDone() }
    catch (err) { setError(/duplicate/i.test((err as Error).message) ? 'You already reviewed this session.' : friendlyError((err as Error).message)) }
    finally { setBusy(false) }
  }
  return <form className="review-form" onSubmit={submit}>
    <fieldset><legend>Your rating for {booking.tutor_name}</legend>
      <div className="star-input" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map(n => <button type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>)}</div></fieldset>
    <label className="field">Comment <small>(optional)</small><textarea rows={3} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} placeholder="What went well? Reviews are public and show your first name only." /></label>
    {error && <Alert kind="error">{error}</Alert>}
    <Button type="submit" busy={busy}>Submit review</Button>
  </form>
}
