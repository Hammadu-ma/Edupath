import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, EmptyState, PageShell, Spinner } from '../components/ui'
import { adminListTutors, adminSetVerification } from '../lib/db'
import { etb, formatDay, friendlyError } from '../lib/booking'
import type { AdminTutor, Verification } from '../lib/types'

const TABS: { id: Verification | 'all'; label: string }[] = [{ id: 'pending', label: 'Awaiting review' }, { id: 'verified', label: 'Verified' }, { id: 'rejected', label: 'Rejected' }, { id: 'incomplete', label: 'Incomplete' }]
export default function Admin() {
  const [tab, setTab] = useState<Verification>('pending')
  const [rows, setRows] = useState<AdminTutor[] | null>(null)
  const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [note, setNote] = useState<Record<string, string>>({})
  const [working, setWorking] = useState('')
  const load = useCallback(async () => { setRows(null); try { setRows(await adminListTutors(tab)) } catch (e) { setError(friendlyError((e as Error).message)); setRows([]) } }, [tab])
  useEffect(() => { void load() }, [load])
  async function decide(t: AdminTutor, status: Verification) {
    setError(''); setNotice('')
    if (status === 'rejected' && !(note[t.user_id] ?? '').trim()) { setError('Add a note explaining what needs to change.'); return }
    setWorking(t.user_id + status)
    try { await adminSetVerification(t.user_id, status, note[t.user_id]); setNotice(`${t.display_name}: ${status}.`); await load() }
    catch (e) { setError(friendlyError((e as Error).message)) } finally { setWorking('') }
  }
  return <PageShell title="Tutor verification" subtitle="Review credentials before a profile becomes public.">
    <div className="tabs" role="tablist">{TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id as Verification)}>{t.label}</button>)}</div>
    {notice && <Alert kind="success">{notice}</Alert>}{error && <Alert kind="error">{error}</Alert>}
    {rows === null ? <Spinner /> : rows.length === 0 ? <EmptyState title="Nothing here" /> : <ul className="booking-list">{rows.map(t => <li className="card booking-item" key={t.user_id}>
      <div className="booking-top"><div><h3>{t.display_name} <small>({t.kind})</small></h3><p className="muted">{t.email}{t.verification_submitted_at && <> · submitted {formatDay(t.verification_submitted_at)}</>}</p></div><span className={`status-badge s-${t.verification_status === 'verified' ? 'accepted' : t.verification_status === 'rejected' ? 'rejected' : 'pending'}`}>{t.verification_status}</span></div>
      <dl className="facts"><div><dt>Headline</dt><dd>{t.headline || '—'}</dd></div><div><dt>Bio</dt><dd className="prose">{t.bio || '—'}</dd></div><div><dt>Qualifications</dt><dd className="prose">{t.qualifications || '—'}</dd></div>
        <div><dt>Subjects</dt><dd>{t.subjects.join(', ') || '—'}</dd></div><div><dt>Levels</dt><dd>{t.grade_levels.join(', ') || '—'}</dd></div><div><dt>Price / location</dt><dd>{etb(t.hourly_rate_etb)} · {t.service_area || '—'}</dd></div>
        {(t.university || t.field_of_study) && <div><dt>Background</dt><dd>{[t.field_of_study, t.university].filter(Boolean).join(' · ')}</dd></div>}</dl>
      <label className="field">Note to the educator <small>(required to reject)</small><input value={note[t.user_id] ?? ''} maxLength={500} onChange={e => setNote({ ...note, [t.user_id]: e.target.value })} /></label>
      <div className="booking-actions">{t.verification_status !== 'verified' && <Button small busy={working === t.user_id + 'verified'} onClick={() => decide(t, 'verified')}>Verify</Button>}
        {t.verification_status !== 'rejected' && <Button small variant="danger" busy={working === t.user_id + 'rejected'} onClick={() => decide(t, 'rejected')}>Reject</Button>}</div>
    </li>)}</ul>}
  </PageShell>
}
