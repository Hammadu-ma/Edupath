import { useEffect, useState } from 'react'
import { Alert, Button, EmptyState, PageShell, Spinner } from '../components/ui'
import { TutorCard } from '../components/TutorCard'
import { listFavoriteTutors } from '../lib/db'
import { friendlyError } from '../lib/booking'
import { useFavorites } from '../lib/useFavorites'
import type { PublicTutor } from '../lib/types'

export default function Favorites() {
  const [rows, setRows] = useState<PublicTutor[] | null>(null)
  const [error, setError] = useState('')
  const fav = useFavorites()
  useEffect(() => { listFavoriteTutors().then(setRows).catch(e => { setError(friendlyError((e as Error).message)); setRows([]) }) }, [])
  const visible = (rows ?? []).filter(t => fav.ids.has(t.user_id))
  return <PageShell title="Saved tutors" subtitle="People you’ve bookmarked.">
    {error && <Alert kind="error">{error}</Alert>}
    {fav.error && <Alert kind="error">{fav.error}</Alert>}
    {rows === null ? <Spinner /> : visible.length === 0
      ? <EmptyState title="No saved tutors yet" action={<Button to="/" variant="secondary">Find a tutor</Button>}>Tap the heart on a profile to save it here.</EmptyState>
      : <div className="tutor-grid">{visible.map(t => <TutorCard key={t.user_id} tutor={t} saved onToggleSave={fav.toggle} />)}</div>}
  </PageShell>
}
