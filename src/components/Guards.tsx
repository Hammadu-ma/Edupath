import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Alert, PageShell, Spinner, Button } from './ui'

export function RequireAuth({ children, need }: { children: React.ReactNode; need?: 'learner' | 'educator' | 'admin' }) {
  const a = useAuth()
  const loc = useLocation()
  if (a.loading) return <PageShell title=""><Spinner /></PageShell>
  if (!a.session) return <Navigate to="/login" replace state={{ next: loc.pathname + loc.search }} />
  const allowed = !need || (need === 'learner' && a.isLearner) || (need === 'educator' && a.isEducator) || (need === 'admin' && a.isAdmin)
  if (!allowed) {
    return <PageShell title="Not available for your account">
      <Alert kind="info">{need === 'admin' ? 'This area is for EduPath administrators.' : need === 'educator' ? 'This area is for tutor and mentor accounts.' : 'This area is for student and parent accounts.'}</Alert>
      <Button to="/" variant="secondary">Back to home</Button>
    </PageShell>
  }
  return <>{children}</>
}
