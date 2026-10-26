// Pure booking/availability logic. The database is the source of truth (RPCs + constraints re-check
// everything); this module only powers the UI (slot lists, which buttons to show, form hints).

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed'
export type Party = 'student' | 'tutor'

export const TZ = 'Africa/Addis_Ababa'
const OFFSET_MS = 3 * 60 * 60 * 1000 // Ethiopia is UTC+3 year-round (no daylight saving)
export const DURATIONS = [30, 60, 90, 120] as const
export const MIN_LEAD_MS = 60 * 60 * 1000
export const MAX_AHEAD_DAYS = 60

export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['cancelled', 'completed'],
  rejected: [],
  cancelled: [],
  completed: [],
}
export const canTransition = (from: BookingStatus, to: BookingStatus) => TRANSITIONS[from].includes(to)

export type BookingAction = 'accept' | 'reject' | 'cancel' | 'complete' | 'review' | 'message'
export function allowedActions(
  b: { status: BookingStatus; starts_at: string; has_review?: boolean },
  party: Party,
  now: Date = new Date(),
): BookingAction[] {
  const started = new Date(b.starts_at).getTime() <= now.getTime()
  const out: BookingAction[] = []
  if (b.status === 'pending') {
    if (party === 'tutor' && !started) out.push('accept')
    if (party === 'tutor') out.push('reject')
    out.push('cancel')
  }
  if (b.status === 'accepted') {
    if (!started) out.push('cancel')
    if (party === 'tutor' && started) out.push('complete')
  }
  if (b.status === 'completed' && party === 'student' && !b.has_review) out.push('review')
  if (b.status !== 'rejected' && b.status !== 'cancelled') out.push('message')
  return out
}

// ---- Addis Ababa wall-clock helpers (weekday 0 = Sunday, matching the database) ----
export type AddisParts = { year: number; month: number; day: number; weekday: number; minutes: number }
export function addisParts(d: Date): AddisParts {
  const s = new Date(d.getTime() + OFFSET_MS)
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate(), weekday: s.getUTCDay(), minutes: s.getUTCHours() * 60 + s.getUTCMinutes() }
}
export const addisToDate = (year: number, month: number, day: number, minutes: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, minutes) - OFFSET_MS)

export type Window = { weekday: number; start_min: number; end_min: number }
export type Range = { starts_at: string; ends_at: string }
export type SlotDay = { key: string; weekday: number; date: Date; slots: Date[] }

export function generateSlots(opts: {
  availability: Window[]; busy: Range[]; durationMin: number; now?: Date; days?: number
}): SlotDay[] {
  const now = opts.now ?? new Date()
  const days = Math.min(opts.days ?? 14, MAX_AHEAD_DAYS)
  const earliest = now.getTime() + MIN_LEAD_MS
  const latest = now.getTime() + MAX_AHEAD_DAYS * 86400000
  const busy = opts.busy.map(b => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const)
  const today = addisParts(now)
  const result: SlotDay[] = []
  for (let i = 0; i < days; i++) {
    const noon = addisToDate(today.year, today.month, today.day + i, 12 * 60)
    const p = addisParts(noon)
    const slots: Date[] = []
    for (const w of opts.availability.filter(a => a.weekday === p.weekday).sort((a, b) => a.start_min - b.start_min)) {
      for (let m = w.start_min; m + opts.durationMin <= w.end_min; m += 30) {
        const start = addisToDate(p.year, p.month, p.day, m)
        const s = start.getTime(), e = s + opts.durationMin * 60000
        if (s < earliest || s > latest) continue
        if (busy.some(([bs, be]) => s < be && e > bs)) continue
        slots.push(start)
      }
    }
    if (slots.length) result.push({ key: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, weekday: p.weekday, date: noon, slots })
  }
  return result
}

// ---- Formatting (always Addis Ababa time, so both parties see the same clock) ----
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o })
export const formatDate = (d: Date | string) => fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
export const formatTime = (d: Date | string) => fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(d))
export const formatDay = (d: Date | string) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d))
export const formatRange = (start: string, end: string) => `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)}`
export const minutesLabel = (m: number) => formatTime(addisToDate(2000, 1, 1, m))
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const etb = (n: number | null | undefined) => (n == null ? '—' : `${new Intl.NumberFormat('en-US').format(n)} ETB`)
export const sessionPrice = (hourly: number, durationMin: number) => Math.round((hourly * durationMin) / 60)

// ---- Availability editing ----
export function windowsOverlap(a: Window, b: Window) {
  return a.weekday === b.weekday && a.start_min < b.end_min && b.start_min < a.end_min
}
export function validateWindow(w: Window, existing: Window[]): string | null {
  if (w.start_min % 30 || w.end_min % 30) return 'Times must be on the hour or half hour.'
  if (w.end_min <= w.start_min) return 'End time must be after the start time.'
  if (existing.some(e => windowsOverlap(w, e))) return 'This overlaps a time you already added.'
  return null
}

// ---- Tutor profile completeness (mirrors submit_for_verification in the database) ----
export type TutorDraft = {
  headline: string | null; bio: string | null; subjects: string[]; grade_levels: string[]
  teaching_modes: string[]; hourly_rate_etb: number | null; service_area: string | null; qualifications: string | null
}
export function missingProfileItems(t: TutorDraft): string[] {
  const m: string[] = []
  if (!t.headline?.trim()) m.push('headline')
  if ((t.bio ?? '').length < 30) m.push('bio (at least 30 characters)')
  if (!t.subjects.length) m.push('at least one subject')
  if (!t.grade_levels.length) m.push('at least one education level')
  if (!t.teaching_modes.length) m.push('session type (online / in person)')
  if (t.hourly_rate_etb == null) m.push('hourly price')
  if (!t.service_area?.trim()) m.push('location')
  if (!t.qualifications?.trim()) m.push('qualifications')
  return m
}

export function validateBookingInput(i: { subject: string; mode: string; start: Date | null; durationMin: number; note: string }): string | null {
  if (!i.subject) return 'Choose a subject.'
  if (!i.mode) return 'Choose online or in person.'
  if (!(DURATIONS as readonly number[]).includes(i.durationMin)) return 'Choose a session length.'
  if (!i.start) return 'Pick a date and time.'
  if (i.note.length > 500) return 'Notes can be at most 500 characters.'
  return null
}

export function friendlyError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Network problem. Check your connection and try again.'
  if (/JWT expired|invalid.*token|not authenticated/i.test(message)) return 'Your session has expired. Please sign in again.'
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.'
  return message
}
