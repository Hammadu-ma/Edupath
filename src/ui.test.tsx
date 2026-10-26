// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const signIn = vi.fn(); const signUp = vi.fn(); const resetEmail = vi.fn()
let session: unknown = null
vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true, siteUrl: 'https://edupath3h.vercel.app',
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: (...a: unknown[]) => signIn(...a), signUp: (...a: unknown[]) => signUp(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetEmail(...a), signOut: () => Promise.resolve({}),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: 'Sara', preferred_language: 'en' } }), then: (r: (v: unknown) => void) => r({ data: [{ role: 'student' }] }) }) }) }),
    rpc: () => Promise.resolve({ data: false }),
  },
}))
const listTutors = vi.fn(); const listFacets = vi.fn()
vi.mock('./lib/db', async orig => ({ ...(await orig<typeof import('./lib/db')>()), listTutors: (...a: unknown[]) => listTutors(...a), listFacets: () => listFacets(), listFavoriteIds: () => Promise.resolve([]) }))

import { AuthProvider } from './lib/auth'
import { RequireAuth } from './components/Guards'
import { ForgotPassword, Login, SignUp } from './pages/Auth'
import Home from './pages/Home'

const wrap = (ui: React.ReactNode, path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider>{ui}</AuthProvider></MemoryRouter>)
beforeEach(() => { session = null; signIn.mockReset(); signUp.mockReset(); resetEmail.mockReset(); listTutors.mockReset(); listFacets.mockReset(); listFacets.mockResolvedValue({ subjects: [], levels: [], locations: [] }); window.scrollTo = () => {} })
afterEach(cleanup)

describe('route protection', () => {
  it('sends signed-out visitors to /login', async () => {
    wrap(<Routes><Route path="/login" element={<p>LOGIN PAGE</p>} /><Route path="/bookings" element={<RequireAuth><p>SECRET</p></RequireAuth>} /></Routes>, '/bookings')
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
    expect(screen.queryByText('SECRET')).toBeNull()
  })
})
describe('login', () => {
  it('validates the email before calling Supabase', async () => {
    wrap(<Login />)
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Enter a valid email address.')
    expect(signIn).not.toHaveBeenCalled()
  })
  it('shows a clear message for wrong credentials', async () => {
    signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    wrap(<Login />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.et'); await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect email or password.')
  })
  it('offers to resend the confirmation email when the address is unconfirmed', async () => {
    signIn.mockResolvedValue({ error: { message: 'Email not confirmed' } })
    wrap(<Login />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.et'); await userEvent.type(screen.getByLabelText(/password/i), 'whatever1')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('button', { name: /resend confirmation/i })).toBeTruthy()
  })
})
describe('sign up', () => {
  it('sends the requested role + production redirect URL and asks to confirm email', async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null })
    wrap(<SignUp />, '/get-started?role=tutor')
    expect(screen.getByRole('radio', { name: /tutor/i }).getAttribute('aria-checked')).toBe('true')
    await userEvent.type(screen.getByLabelText(/full name/i), 'Tigist Alemu'); await userEvent.type(screen.getByLabelText(/email/i), 'tigist@example.et'); await userEvent.type(screen.getByLabelText(/password/i), 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(signUp).toHaveBeenCalled())
    expect(signUp.mock.calls[0][0]).toMatchObject({ email: 'tigist@example.et', options: { data: { display_name: 'Tigist Alemu', role: 'tutor' }, emailRedirectTo: 'https://edupath3h.vercel.app/auth/callback' } })
    expect(await screen.findByText(/confirmation link/i)).toBeTruthy()
  })
  it('rejects short passwords client-side', async () => {
    wrap(<SignUp />)
    await userEvent.type(screen.getByLabelText(/full name/i), 'Sara Bekele'); await userEvent.type(screen.getByLabelText(/email/i), 'sara@example.et'); await userEvent.type(screen.getByLabelText(/password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 8/)
    expect(signUp).not.toHaveBeenCalled()
  })
  it('reports an already-registered email without creating anything', async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null })
    wrap(<SignUp />)
    await userEvent.type(screen.getByLabelText(/full name/i), 'Sara Bekele'); await userEvent.type(screen.getByLabelText(/email/i), 'sara@example.et'); await userEvent.type(screen.getByLabelText(/password/i), 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/already exists/)
  })
})
describe('password reset request', () => {
  it('requests a link that returns to the production /reset-password page', async () => {
    resetEmail.mockResolvedValue({ error: null })
    wrap(<ForgotPassword />)
    await userEvent.type(screen.getByLabelText(/email/i), 'sara@example.et')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/reset link is on its way/i)).toBeTruthy()
    expect(resetEmail).toHaveBeenCalledWith('sara@example.et', { redirectTo: 'https://edupath3h.vercel.app/reset-password' })
  })
})
describe('discovery', () => {
  it('shows an honest empty state (no fake tutors) when nobody is verified yet', async () => {
    listTutors.mockResolvedValue([])
    wrap(<Home />)
    expect(await screen.findByText('No tutors are listed yet')).toBeTruthy()
    expect(screen.queryByText(/demo/i)).toBeNull()
  })
  it('renders real results and passes the chosen filters to the query', async () => {
    listTutors.mockResolvedValue([{ user_id: 'u1', kind: 'tutor', display_name: 'Hana Mammo', headline: 'Physics made clear', bio: null, teaching_modes: ['online'], subjects: ['Physics'], grade_levels: ['Grades 11–12'], languages: [], hourly_rate_etb: 400, service_area: 'Jimma', travel_radius_km: null, university: null, field_of_study: null, qualifications: null, accepting_bookings: true, avg_rating: 0, review_count: 0, available_days: [1] }])
    listFacets.mockResolvedValue({ subjects: ['Physics'], levels: [], locations: ['Jimma'] })
    wrap(<Home />)
    expect(await screen.findByText('Hana Mammo')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()      // no reviews yet → no invented rating
    await userEvent.selectOptions(await screen.findByLabelText('Subject'), 'Physics')
    await waitFor(() => expect(listTutors.mock.calls.at(-1)![0]).toMatchObject({ kind: 'tutor', subject: 'Physics' }))
  })
})
