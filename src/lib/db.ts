import { supabase } from './supabase'
import type {
  AdminTutor, AvailabilityRow, BookingRow, Conversation, Message, Notification, OwnTutorProfile,
  PublicReview, PublicTutor, Verification,
} from './types'

function client() {
  if (!supabase) throw new Error('EduPath is not connected to Supabase yet. See README → Configuration.')
  return supabase
}
function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
async function uid() {
  const { data } = await client().auth.getUser()
  if (!data.user) throw new Error('Please sign in.')
  return data.user.id
}

// ---- Discovery --------------------------------------------------------------------------------
export type TutorFilters = {
  kind: 'tutor' | 'mentor'; q?: string; subject?: string; level?: string; location?: string
  minPrice?: number; maxPrice?: number; mode?: string; day?: number; sort?: 'rating' | 'price_asc' | 'price_desc'
}
export async function listTutors(f: TutorFilters): Promise<PublicTutor[]> {
  let q = client().from('public_tutors').select('*').eq('kind', f.kind)
  if (f.subject) q = q.contains('subjects', [f.subject])
  if (f.level) q = q.contains('grade_levels', [f.level])
  if (f.location) q = q.eq('service_area', f.location)
  if (f.mode) q = q.contains('teaching_modes', [f.mode])
  if (f.day !== undefined && f.day >= 0) q = q.contains('available_days', [f.day])
  if (f.minPrice !== undefined) q = q.gte('hourly_rate_etb', f.minPrice)
  if (f.maxPrice !== undefined) q = q.lte('hourly_rate_etb', f.maxPrice)
  const sort = f.sort ?? 'rating'
  q = sort === 'price_asc' ? q.order('hourly_rate_etb', { ascending: true, nullsFirst: false })
    : sort === 'price_desc' ? q.order('hourly_rate_etb', { ascending: false, nullsFirst: false })
    : q.order('avg_rating', { ascending: false }).order('review_count', { ascending: false })
  const rows = ok(await q.limit(200)) as PublicTutor[]
  const needle = (f.q ?? '').trim().toLowerCase()
  if (!needle) return rows
  return rows.filter(t => [t.display_name, t.headline, t.university, t.field_of_study, t.service_area, ...t.subjects].join(' ').toLowerCase().includes(needle))
}
export async function listFacets() {
  const rows = ok(await client().from('public_tutors').select('subjects, grade_levels, service_area')) as { subjects: string[]; grade_levels: string[]; service_area: string | null }[]
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))
  return {
    subjects: uniq(rows.flatMap(r => r.subjects)), levels: uniq(rows.flatMap(r => r.grade_levels)),
    locations: uniq(rows.map(r => r.service_area ?? '').filter(Boolean)),
  }
}
export async function getTutor(id: string): Promise<PublicTutor | null> {
  return ok(await client().from('public_tutors').select('*').eq('user_id', id).maybeSingle()) as PublicTutor | null
}
export async function getTutorReviews(id: string): Promise<PublicReview[]> {
  return ok(await client().from('public_reviews').select('*').eq('tutor_id', id).order('created_at', { ascending: false }).limit(50)) as PublicReview[]
}
export async function getAvailability(tutorId: string): Promise<AvailabilityRow[]> {
  return ok(await client().from('tutor_availability').select('id, weekday, start_min, end_min').eq('tutor_id', tutorId).order('weekday').order('start_min')) as AvailabilityRow[]
}
export async function getBusySlots(tutorId: string, from: Date, to: Date) {
  return ok(await client().rpc('tutor_busy_slots', { p_tutor: tutorId, p_from: from.toISOString(), p_to: to.toISOString() })) as { starts_at: string; ends_at: string }[]
}

// ---- Favorites --------------------------------------------------------------------------------
export async function listFavoriteIds(): Promise<string[]> {
  return (ok(await client().from('favorites').select('tutor_id')) as { tutor_id: string }[]).map(r => r.tutor_id)
}
export async function listFavoriteTutors(): Promise<PublicTutor[]> {
  const ids = await listFavoriteIds()
  if (!ids.length) return []
  return ok(await client().from('public_tutors').select('*').in('user_id', ids)) as PublicTutor[]
}
export async function setFavorite(tutorId: string, on: boolean) {
  const me = await uid()
  const c = client()
  if (on) { const { error } = await c.from('favorites').insert({ user_id: me, tutor_id: tutorId }); if (error && !/duplicate/i.test(error.message)) throw new Error(error.message) }
  else ok(await c.from('favorites').delete().eq('user_id', me).eq('tutor_id', tutorId))
}

// ---- Bookings ---------------------------------------------------------------------------------
export async function requestBooking(i: { tutorId: string; subject: string; mode: string; startsAt: Date; duration: number; note: string }) {
  return ok(await client().rpc('request_booking', { p_tutor: i.tutorId, p_subject: i.subject, p_mode: i.mode, p_starts_at: i.startsAt.toISOString(), p_duration: i.duration, p_note: i.note || null })) as string
}
export async function listBookings(): Promise<BookingRow[]> {
  return ok(await client().from('booking_details').select('*').order('starts_at', { ascending: false }).limit(300)) as BookingRow[]
}
export const respondBooking = async (id: string, accept: boolean) => ok(await client().rpc('respond_booking', { p_booking: id, p_accept: accept }))
export const cancelBooking = async (id: string, reason?: string) => ok(await client().rpc('cancel_booking', { p_booking: id, p_reason: reason || null }))
export const completeBooking = async (id: string) => ok(await client().rpc('complete_booking', { p_booking: id }))
export async function submitReview(i: { bookingId: string; tutorId: string; rating: number; comment: string }) {
  const me = await uid()
  ok(await client().from('reviews').insert({ booking_id: i.bookingId, tutor_id: i.tutorId, student_id: me, rating: i.rating, comment: i.comment.trim() || null }))
}

// ---- Messaging --------------------------------------------------------------------------------
export async function listConversations(): Promise<Conversation[]> {
  return ok(await client().from('my_conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(100)) as Conversation[]
}
export async function listMessages(conversationId: string): Promise<Message[]> {
  return ok(await client().from('messages').select('*').eq('conversation_id', conversationId).order('created_at').limit(500)) as Message[]
}
export async function sendMessage(conversationId: string, body: string) {
  const me = await uid()
  ok(await client().from('messages').insert({ conversation_id: conversationId, sender_id: me, body: body.trim() }))
}
export const markConversationRead = async (id: string) => ok(await client().rpc('mark_conversation_read', { p_conversation: id }))

// ---- Notifications ----------------------------------------------------------------------------
export async function listNotifications(): Promise<Notification[]> {
  return ok(await client().from('notifications').select('id, type, title, body, link, is_read, created_at').order('created_at', { ascending: false }).limit(30)) as Notification[]
}
export const markNotificationsRead = async (ids?: string[]) => ok(await client().rpc('mark_notifications_read', { p_ids: ids ?? null }))

// ---- Own profile / tutor profile --------------------------------------------------------------
export async function updateProfile(displayName: string, language: string) {
  const me = await uid()
  ok(await client().from('profiles').update({ display_name: displayName.trim(), preferred_language: language }).eq('id', me))
}
export async function getMyTutorProfile(): Promise<OwnTutorProfile | null> {
  const me = await uid()
  return ok(await client().from('tutor_profiles').select('*').eq('user_id', me).maybeSingle()) as OwnTutorProfile | null
}
export type TutorEdit = Pick<OwnTutorProfile, 'headline' | 'bio' | 'teaching_modes' | 'subjects' | 'grade_levels' | 'languages' | 'hourly_rate_etb' | 'service_area' | 'travel_radius_km' | 'university' | 'field_of_study' | 'qualifications' | 'accepting_bookings'>
export async function updateMyTutorProfile(p: TutorEdit) {
  const me = await uid()
  ok(await client().from('tutor_profiles').update(p).eq('user_id', me))
}
export const submitForVerification = async () => ok(await client().rpc('submit_for_verification'))
export const becomeTutor = async (kind: 'tutor' | 'mentor') => ok(await client().rpc('become_tutor', { p_kind: kind }))
export async function addAvailability(w: { weekday: number; start_min: number; end_min: number }) {
  const me = await uid()
  ok(await client().from('tutor_availability').insert({ tutor_id: me, ...w }))
}
export async function removeAvailability(id: string) { ok(await client().from('tutor_availability').delete().eq('id', id)) }

// ---- Admin ------------------------------------------------------------------------------------
export async function adminListTutors(status?: Verification): Promise<AdminTutor[]> {
  return ok(await client().rpc('admin_list_tutors', { p_status: status ?? null })) as AdminTutor[]
}
export const adminSetVerification = async (userId: string, status: Verification, note?: string) =>
  ok(await client().rpc('admin_set_verification', { p_user: userId, p_status: status, p_note: note || null }))
