import type { BookingStatus } from './booking'

export type Kind = 'tutor' | 'mentor'
export type Verification = 'incomplete' | 'pending' | 'verified' | 'rejected'

export type PublicTutor = {
  user_id: string; kind: Kind; display_name: string; headline: string | null; bio: string | null
  teaching_modes: string[]; subjects: string[]; grade_levels: string[]; languages: string[]
  hourly_rate_etb: number | null; service_area: string | null; travel_radius_km: number | null
  university: string | null; field_of_study: string | null; qualifications: string | null
  accepting_bookings: boolean; avg_rating: number; review_count: number; available_days: number[]
}
export type OwnTutorProfile = Omit<PublicTutor, 'display_name' | 'avg_rating' | 'review_count' | 'available_days'> & {
  verification_status: Verification; is_searchable: boolean; verification_note: string | null
}
export type PublicReview = { id: string; tutor_id: string; rating: number; comment: string | null; created_at: string; reviewer_first_name: string }
export type BookingRow = {
  id: string; student_id: string; tutor_id: string; subject: string; mode: 'online' | 'in_person'
  starts_at: string; ends_at: string; duration_minutes: number; note: string | null; price_etb: number
  status: BookingStatus; cancelled_by: string | null; cancel_reason: string | null; created_at: string
  student_name: string; tutor_name: string; conversation_id: string | null; has_review: boolean
}
export type Conversation = {
  id: string; booking_id: string; last_message_at: string | null; student_id: string; tutor_id: string
  other_name: string; subject: string; booking_status: BookingStatus; starts_at: string; unread: number
}
export type Message = { id: string; conversation_id: string; sender_id: string; body: string; read_at: string | null; created_at: string }
export type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string }
export type AvailabilityRow = { id: string; weekday: number; start_min: number; end_min: number }
export type AdminTutor = {
  user_id: string; kind: Kind; display_name: string; email: string; headline: string | null; bio: string | null
  subjects: string[]; grade_levels: string[]; hourly_rate_etb: number | null; service_area: string | null
  university: string | null; field_of_study: string | null; qualifications: string | null
  verification_status: Verification; verification_note: string | null; verification_submitted_at: string | null
}

export const SUBJECT_SUGGESTIONS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Amharic', 'Afan Oromo', 'Geography', 'History', 'Civics', 'Economics', 'ICT / Computer science', 'Accounting', 'Business']
export const LEVELS = ['Grades 1–4', 'Grades 5–8', 'Grades 9–10', 'Grades 11–12', 'University', 'Grade 12 exam preparation']
export const CITY_SUGGESTIONS = ['Addis Ababa', 'Jimma', 'Adama', 'Hawassa', 'Bahir Dar', 'Gondar', 'Mekelle', 'Dire Dawa']
export const MODE_LABEL: Record<string, string> = { online: 'Online', in_person: 'In person' }
export const modesLabel = (m: string[]) => m.map(x => MODE_LABEL[x] ?? x).join(' · ')
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
const COLORS = ['blue', 'rose', 'violet']
export const colorOf = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
