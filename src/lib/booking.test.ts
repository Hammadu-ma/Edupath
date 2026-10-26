import { describe, expect, it } from 'vitest'
import {
  addisParts, addisToDate, allowedActions, canTransition, etb, friendlyError, generateSlots,
  minutesLabel, missingProfileItems, sessionPrice, validateBookingInput, validateWindow, formatTime,
} from './booking'

describe('status transitions', () => {
  it('allows the documented transitions only', () => {
    expect(canTransition('pending', 'accepted')).toBe(true)
    expect(canTransition('pending', 'rejected')).toBe(true)
    expect(canTransition('pending', 'cancelled')).toBe(true)
    expect(canTransition('accepted', 'completed')).toBe(true)
    expect(canTransition('accepted', 'cancelled')).toBe(true)
  })
  it('rejects invalid transitions', () => {
    expect(canTransition('pending', 'completed')).toBe(false)
    expect(canTransition('rejected', 'accepted')).toBe(false)
    expect(canTransition('cancelled', 'accepted')).toBe(false)
    expect(canTransition('completed', 'cancelled')).toBe(false)
    expect(canTransition('accepted', 'pending')).toBe(false)
  })
})

describe('allowedActions', () => {
  const now = new Date('2026-11-02T09:00:00Z')
  const future = '2026-11-05T09:00:00Z', past = '2026-11-01T09:00:00Z'
  it('tutor can accept/reject pending future requests; student can only cancel', () => {
    expect(allowedActions({ status: 'pending', starts_at: future }, 'tutor', now)).toEqual(['accept', 'reject', 'cancel', 'message'])
    expect(allowedActions({ status: 'pending', starts_at: future }, 'student', now)).toEqual(['cancel', 'message'])
  })
  it('cannot accept a request whose time has passed', () => {
    expect(allowedActions({ status: 'pending', starts_at: past }, 'tutor', now)).not.toContain('accept')
  })
  it('only the tutor can complete, and only after the start', () => {
    expect(allowedActions({ status: 'accepted', starts_at: future }, 'tutor', now)).not.toContain('complete')
    expect(allowedActions({ status: 'accepted', starts_at: past }, 'tutor', now)).toContain('complete')
    expect(allowedActions({ status: 'accepted', starts_at: past }, 'student', now)).not.toContain('complete')
  })
  it('started sessions cannot be cancelled', () => {
    expect(allowedActions({ status: 'accepted', starts_at: past }, 'student', now)).not.toContain('cancel')
  })
  it('review is offered once, to the learner, after completion', () => {
    expect(allowedActions({ status: 'completed', starts_at: past, has_review: false }, 'student', now)).toContain('review')
    expect(allowedActions({ status: 'completed', starts_at: past, has_review: true }, 'student', now)).not.toContain('review')
    expect(allowedActions({ status: 'completed', starts_at: past }, 'tutor', now)).not.toContain('review')
    expect(allowedActions({ status: 'accepted', starts_at: future }, 'student', now)).not.toContain('review')
  })
  it('closed bookings offer no actions', () => {
    expect(allowedActions({ status: 'rejected', starts_at: future }, 'student', now)).toEqual([])
    expect(allowedActions({ status: 'cancelled', starts_at: future }, 'tutor', now)).toEqual([])
  })
})

describe('Addis Ababa time handling', () => {
  it('converts to UTC+3 wall clock', () => {
    const d = new Date('2026-11-02T07:30:00Z') // 10:30 in Addis, a Monday
    expect(addisParts(d)).toMatchObject({ year: 2026, month: 11, day: 2, weekday: 1, minutes: 630 })
  })
  it('rolls over midnight correctly', () => {
    const d = new Date('2026-11-01T22:00:00Z') // 01:00 Monday 2 Nov in Addis
    expect(addisParts(d)).toMatchObject({ day: 2, weekday: 1, minutes: 60 })
  })
  it('round-trips', () => {
    expect(addisToDate(2026, 11, 2, 630).toISOString()).toBe('2026-11-02T07:30:00.000Z')
  })
  it('formats clock labels', () => {
    expect(minutesLabel(540)).toMatch(/9:00\s?am/i)
    expect(formatTime('2026-11-02T07:30:00Z')).toMatch(/10:30\s?am/i)
  })
})

describe('generateSlots', () => {
  // Mon 2 Nov 2026, 06:00 UTC = 09:00 Addis
  const now = new Date('2026-11-02T06:00:00Z')
  const mon = { weekday: 1, start_min: 600, end_min: 720 } // Mon 10:00-12:00 local
  it('respects the 1-hour lead time and the end of the window', () => {
    const days = generateSlots({ availability: [mon], busy: [], durationMin: 60, now, days: 1 })
    // 10:00 is exactly 1h ahead (allowed); 10:30, 11:00 allowed; 11:30 would end 12:30 (not allowed)
    expect(days[0].slots.map(s => addisParts(s).minutes)).toEqual([600, 630, 660])
  })
  it('drops slots inside the lead time', () => {
    const late = new Date('2026-11-02T06:45:00Z') // 09:45 local -> earliest 10:45
    const days = generateSlots({ availability: [mon], busy: [], durationMin: 60, now: late, days: 1 })
    expect(days[0].slots.map(s => addisParts(s).minutes)).toEqual([660])
  })
  it('removes slots overlapping busy ranges but keeps adjacent ones', () => {
    const busy = [{ starts_at: addisToDate(2026, 11, 2, 630).toISOString(), ends_at: addisToDate(2026, 11, 2, 690).toISOString() }]
    const days = generateSlots({ availability: [mon], busy, durationMin: 30, now, days: 1 })
    expect(days[0].slots.map(s => addisParts(s).minutes)).toEqual([600, 690])
  })
  it('only returns days that have availability, mapped by Addis weekday', () => {
    const days = generateSlots({ availability: [mon], busy: [], durationMin: 60, now, days: 14 })
    expect(days.every(d => d.weekday === 1)).toBe(true)
    expect(days.length).toBe(2) // Mon 2 Nov and Mon 9 Nov
  })
  it('returns nothing when no availability', () => {
    expect(generateSlots({ availability: [], busy: [], durationMin: 60, now })).toEqual([])
  })
  it('caps the horizon at 60 days', () => {
    const days = generateSlots({ availability: [mon], busy: [], durationMin: 60, now, days: 400 })
    const last = days[days.length - 1].slots[0].getTime()
    expect(last - now.getTime()).toBeLessThanOrEqual(60 * 86400000)
  })
})

describe('availability windows', () => {
  const ex = [{ weekday: 1, start_min: 540, end_min: 720 }]
  it('detects overlaps and bad ranges', () => {
    expect(validateWindow({ weekday: 1, start_min: 600, end_min: 660 }, ex)).toMatch(/overlaps/)
    expect(validateWindow({ weekday: 1, start_min: 720, end_min: 780 }, ex)).toBeNull()
    expect(validateWindow({ weekday: 2, start_min: 540, end_min: 720 }, ex)).toBeNull()
    expect(validateWindow({ weekday: 1, start_min: 810, end_min: 780 }, ex)).toMatch(/after/)
    expect(validateWindow({ weekday: 1, start_min: 805, end_min: 900 }, ex)).toMatch(/half hour/)
  })
})

describe('profile completeness + booking input + helpers', () => {
  const empty = { headline: null, bio: null, subjects: [], grade_levels: [], teaching_modes: [], hourly_rate_etb: null, service_area: null, qualifications: null }
  it('lists what is missing', () => {
    expect(missingProfileItems(empty)).toHaveLength(8)
    expect(missingProfileItems({ ...empty, headline: 'x', bio: 'y'.repeat(30), subjects: ['Math'], grade_levels: ['G9'], teaching_modes: ['online'], hourly_rate_etb: 0, service_area: 'Jimma', qualifications: 'BSc' })).toEqual([])
  })
  it('validates booking input', () => {
    const ok = { subject: 'Math', mode: 'online', start: new Date(), durationMin: 60, note: '' }
    expect(validateBookingInput(ok)).toBeNull()
    expect(validateBookingInput({ ...ok, start: null })).toMatch(/date/)
    expect(validateBookingInput({ ...ok, subject: '' })).toMatch(/subject/)
    expect(validateBookingInput({ ...ok, durationMin: 45 })).toMatch(/length/)
    expect(validateBookingInput({ ...ok, note: 'x'.repeat(501) })).toMatch(/500/)
  })
  it('prices proportionally and formats ETB', () => {
    expect(sessionPrice(450, 90)).toBe(675)
    expect(sessionPrice(350, 30)).toBe(175)
    expect(etb(1200)).toBe('1,200 ETB')
    expect(etb(null)).toBe('—')
  })
  it('maps raw errors to readable messages', () => {
    expect(friendlyError('TypeError: Failed to fetch')).toMatch(/Network/)
    expect(friendlyError('JWT expired')).toMatch(/expired/)
    expect(friendlyError('new row violates row-level security policy')).toMatch(/permission/)
    expect(friendlyError('That time slot is no longer available.')).toBe('That time slot is no longer available.')
  })
})
