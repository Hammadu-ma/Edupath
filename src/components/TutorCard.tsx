import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Heart, MapPin, ShieldCheck, Star } from 'lucide-react'
import { Avatar } from './ui'
import { colorOf, initialsOf, modesLabel, type PublicTutor } from '../lib/types'
import { etb } from '../lib/booking'

export function Rating({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="rating new">New</span>
  return <span className="rating"><Star size={14} fill="currentColor" aria-hidden="true" /> {Number(avg).toFixed(1)} <small>({count})</small></span>
}

export function TutorCard({ tutor, saved, onToggleSave }: { tutor: PublicTutor; saved: boolean; onToggleSave: (id: string) => void }) {
  const color = colorOf(tutor.user_id)
  return <article className="tutor-card">
    <div className={`tutor-art ${color}`}>
      <Avatar initials={initialsOf(tutor.display_name)} color={color} size="large" />
      <button className={`save ${saved ? 'saved' : ''}`} onClick={() => onToggleSave(tutor.user_id)} aria-pressed={saved} aria-label={saved ? `Remove ${tutor.display_name} from saved tutors` : `Save ${tutor.display_name}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
      <span className="verified"><ShieldCheck size={13} /> Verified</span>
    </div>
    <div className="tutor-info">
      <div className="tutor-title"><div><h3>{tutor.display_name}</h3><p>{tutor.subjects.slice(0, 2).join(', ') || '—'}{tutor.grade_levels[0] && <> <span>·</span> {tutor.grade_levels[0]}{tutor.grade_levels.length > 1 ? ` +${tutor.grade_levels.length - 1}` : ''}</>}</p></div><Rating avg={tutor.avg_rating} count={tutor.review_count} /></div>
      <p className="tutor-bio">{tutor.headline || tutor.bio}</p>
      <div className="tutor-meta">{tutor.service_area && <span><MapPin size={14} /> {tutor.service_area}</span>}<span><BookOpen size={14} /> {modesLabel(tutor.teaching_modes)}</span></div>
      <div className="tutor-bottom"><div><strong>{etb(tutor.hourly_rate_etb)}</strong><small> / hour</small></div><Link className="button primary" to={`/tutors/${tutor.user_id}`}>View profile <ArrowRight size={15} /></Link></div>
    </div>
  </article>
}
