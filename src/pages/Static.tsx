import { ShieldCheck } from 'lucide-react'
import { Button, EmptyState, PageShell } from '../components/ui'

export function Trust() {
  return <PageShell title="Trust & safety" subtitle="How EduPath keeps learning safer.">
    <section className="card prose-card"><h2><ShieldCheck size={18} /> Verification</h2>
      <p>Tutor and mentor profiles are hidden from learners until an EduPath administrator reviews the qualifications and details they submit and marks the profile as verified. Only verified profiles show the “Verified” badge.</p>
      <p>Verification today is a manual review of the information provided. It is not a background check, and document upload is not available yet.</p></section>
    <section className="card prose-card"><h2>Booking and messaging</h2>
      <p>A session is confirmed only after the tutor accepts your request. Keep conversations inside EduPath messages so there is a record of what was agreed.</p></section>
    <section className="card prose-card"><h2>Tips for in-person sessions</h2>
      <p>Meet in a public or well-known place for a first lesson, tell a parent or friend where you’ll be, and cancel the session if anything feels wrong. Parents are welcome to book on behalf of a learner and be present.</p></section>
    <section className="card prose-card"><h2>Payments</h2><p>EduPath doesn’t process payments. Agree prices and payment directly with your tutor, and never share passwords or one-time codes.</p></section>
  </PageShell>
}
export function NotFound() {
  return <main className="page container"><EmptyState title="Page not found" action={<Button to="/" variant="secondary">Back to home</Button>}>The page you’re looking for doesn’t exist.</EmptyState></main>
}
