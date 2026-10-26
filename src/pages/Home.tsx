import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, BookOpen, CalendarDays, Check, GraduationCap, MapPin, Search, ShieldCheck, Sparkles, Star, Target, Users, Zap } from 'lucide-react'
import { Avatar, Button, EmptyState, Spinner, Alert } from '../components/ui'
import { TutorCard } from '../components/TutorCard'
import { listFacets, listTutors, type TutorFilters } from '../lib/db'
import { colorOf, initialsOf, type PublicTutor } from '../lib/types'
import { WEEKDAYS, friendlyError } from '../lib/booking'
import { isSupabaseConfigured } from '../lib/supabase'
import { useFavorites } from '../lib/useFavorites'

type Facets = { subjects: string[]; levels: string[]; locations: string[] }
export default function Home() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'Tutors' | 'Mentors'>('Tutors')
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState(''); const [level, setLevel] = useState(''); const [location, setLocation] = useState('')
  const [mode, setMode] = useState(''); const [day, setDay] = useState(''); const [sort, setSort] = useState<'rating' | 'price_asc' | 'price_desc'>('rating')
  const [minPrice, setMinPrice] = useState(''); const [maxPrice, setMaxPrice] = useState('')
  const [facets, setFacets] = useState<Facets>({ subjects: [], levels: [], locations: [] })
  const [results, setResults] = useState<PublicTutor[] | null>(null)
  const [error, setError] = useState('')
  const fav = useFavorites()
  const kind = activeTab === 'Tutors' ? 'tutor' : 'mentor'

  useEffect(() => { if (isSupabaseConfigured) listFacets().then(setFacets).catch(() => undefined) }, [])
  const filters = useMemo<TutorFilters>(() => ({
    kind, q: query, subject: subject || undefined, level: level || undefined, location: location || undefined, mode: mode || undefined,
    day: day === '' ? undefined : Number(day), sort,
    minPrice: minPrice === '' ? undefined : Math.max(0, Number(minPrice)), maxPrice: maxPrice === '' ? undefined : Math.max(0, Number(maxPrice)),
  }), [kind, query, subject, level, location, mode, day, sort, minPrice, maxPrice])
  useEffect(() => {
    if (!isSupabaseConfigured) { setResults([]); return }
    let stale = false
    setResults(null); setError('')
    const t = setTimeout(() => {
      listTutors(filters).then(r => { if (!stale) setResults(r) }).catch(e => { if (!stale) { setError(friendlyError((e as Error).message)); setResults([]) } })
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [filters])
  const activeFilterCount = [subject, level, location, mode, day, minPrice, maxPrice].filter(v => v !== '').length
  function clearFilters() { setQuery(''); setSubject(''); setLevel(''); setLocation(''); setMode(''); setDay(''); setMinPrice(''); setMaxPrice('') }

  return <>
    <main>
      <section className="hero container"><div className="hero-copy"><div className="eyebrow"><Sparkles size={15} /> YOUR LEARNING JOURNEY STARTS HERE</div><h1>Find your people.<br /><span>Shape your future.</span></h1><p className="hero-lede">Connect with trusted tutors and inspiring mentors who help you reach your goals — one step at a time.</p><div className="hero-ctas"><Button onClick={() => { setActiveTab('Tutors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Find a tutor <ArrowRight size={17} /></Button><Button variant="secondary" onClick={() => { setActiveTab('Mentors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore mentors <Target size={17} /></Button></div><div className="hero-proof"><div className="proof-avatars"><Avatar initials="AB" /><Avatar initials="HM" color="rose" /><Avatar initials="ST" color="violet" /></div><div><div className="proof-stars"><Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <b>Made for your next step</b></div><small>Trusted learning, built around you</small></div></div></div>
          <div className="hero-visual"><div className="visual-glow"></div><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="hero-main-card"><div className="hero-card-top"><span className="live-dot"></span> YOUR LEARNING SPACE <span className="hero-card-menu">•••</span></div><div className="welcome-row"><div><small>YOUR NEXT CHAPTER</small><h3>Big goals start<br />with small steps.</h3></div><div className="goal-illustration"><GraduationCap size={42} /></div></div><div className="goal-progress"><div className="progress-head"><span>How booking works</span></div><ul className="mini-steps"><li><Check size={14} /> Find a verified tutor</li><li><Check size={14} /> Request a time that suits you</li><li><Check size={14} /> Your tutor accepts — it’s confirmed</li></ul></div></div><div className="floating-card float-top"><span className="float-icon purple"><ShieldCheck size={19} /></span><div><strong>Verified tutors</strong><small>Reviewed by EduPath</small></div><Check size={17} className="float-check" /></div><div className="floating-card float-bottom"><span className="float-icon yellow"><Star size={18} fill="currentColor" /></span><div><strong>Find your next step</strong><small>Guidance that fits you</small></div><ArrowDownRight size={18} /></div><div className="decor decor-one"></div><div className="decor decor-two"></div></div></section>
          <section className="trust-strip container"><div><ShieldCheck /><span><strong>Trust comes first</strong><small>Verification and safety-minded design</small></span></div><div><MapPin /><span><strong>Near you or online</strong><small>Learning that fits your life</small></span></div><div><Target /><span><strong>Built around your goals</strong><small>Subjects, university and careers</small></span></div><div><Zap /><span><strong>Your pace, your path</strong><small>Flexible learning journeys</small></span></div></section>
          <section className="discover-section section" id="discover"><div className="container"><div className="section-heading"><div><div className="eyebrow">YOUR NEXT STEP IS CLOSER</div><h2>People who help you <span>grow.</span></h2><p>Find the right support for where you are — and where you want to go.</p></div></div>
        <div className="discovery-panel"><div className="discovery-top"><div className="tabs" role="tablist"><button role="tab" aria-selected={activeTab === 'Tutors'} className={activeTab === 'Tutors' ? 'selected' : ''} onClick={() => setActiveTab('Tutors')}><BookOpen size={16} /> Tutors</button><button role="tab" aria-selected={activeTab === 'Mentors'} className={activeTab === 'Mentors' ? 'selected' : ''} onClick={() => setActiveTab('Mentors')}><Target size={16} /> Mentors</button></div>
          <label className="location-chip"><MapPin size={15} /><span className="sr-only">Location</span><select aria-label="Location" value={location} onChange={e => setLocation(e.target.value)}><option value="">All locations</option>{facets.locations.map(l => <option key={l}>{l}</option>)}</select></label></div>
          <div className="search-row"><div className="search-input"><Search size={18} /><input aria-label="Search people" placeholder={activeTab === 'Tutors' ? 'Try “Mathematics” or a tutor name' : 'Try “Medicine”, “Engineering” or a university'} value={query} onChange={e => setQuery(e.target.value)} /></div></div>
          <div className="filters" role="group" aria-label="Filters">
            <select aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)}><option value="">All subjects</option>{facets.subjects.map(s => <option key={s}>{s}</option>)}</select>
            <select aria-label="Education level" value={level} onChange={e => setLevel(e.target.value)}><option value="">All levels</option>{facets.levels.map(s => <option key={s}>{s}</option>)}</select>
            <select aria-label="Session type" value={mode} onChange={e => setMode(e.target.value)}><option value="">Online or in person</option><option value="online">Online</option><option value="in_person">In person</option></select>
            <select aria-label="Available on" value={day} onChange={e => setDay(e.target.value)}><option value="">Any day</option>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
            <input aria-label="Minimum price in ETB per hour" type="number" min={0} inputMode="numeric" placeholder="Min ETB/h" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
            <input aria-label="Maximum price in ETB per hour" type="number" min={0} inputMode="numeric" placeholder="Max ETB/h" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
            <select aria-label="Sort by" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="rating">Top rated</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
            {(activeFilterCount > 0 || query) && <button className="link-btn" onClick={clearFilters}>Clear filters</button>}
          </div>
          <div id="results" aria-live="polite">
            {error && <Alert kind="error">{error}</Alert>}
            {fav.error && <Alert kind="error">{fav.error}</Alert>}
            {results === null ? <Spinner label="Finding people…" />
            : results.length === 0 ? <EmptyState title={activeFilterCount || query ? 'No matches for those filters' : activeTab === 'Tutors' ? 'No tutors are listed yet' : 'No mentors are listed yet'} action={activeFilterCount || query ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : <Button variant="secondary" to={`/get-started?role=${kind}`}>Become a {kind}</Button>}>{activeFilterCount || query ? 'Try removing a filter or searching a different subject.' : 'Profiles appear here once educators have joined and been verified by EduPath.'}</EmptyState>
            : activeTab === 'Tutors' ? <div className="tutor-grid">{results.map(t => <TutorCard key={t.user_id} tutor={t} saved={fav.ids.has(t.user_id)} onToggleSave={fav.toggle} />)}</div>
            : <div className="mentor-grid" id="mentor-list">{results.map(m => <article className="mentor-card" key={m.user_id}><Avatar initials={initialsOf(m.display_name)} color={colorOf(m.user_id)} size="large" /><div className="mentor-details"><span className="mentor-kicker">FUTURE GOALS MENTOR</span><h3>{m.display_name}</h3><p>{[m.field_of_study, m.university].filter(Boolean).join(' · ') || m.service_area}</p><small>{m.headline || m.bio}</small><Button to={`/tutors/${m.user_id}`}>Explore profile <ArrowRight size={15} /></Button></div><span className="mentor-spark"><Sparkles size={22} /></span></article>)}</div>}
          </div>
        </div></div></section>
      <section className="goals-section section" id="mentors"><div className="container goals-layout"><div className="goals-copy"><div className="eyebrow">MORE THAN A LESSON</div><h2>Your future deserves <span>a plan.</span></h2><p>Big dreams can feel far away. Get guidance from people who know the path — and turn “someday” into your next step.</p><ul className="check-list"><li><Check size={16} /> Explore universities and departments</li><li><Check size={16} /> Understand career paths and possibilities</li><li><Check size={16} /> Make a plan that feels achievable</li></ul><Button onClick={() => { setActiveTab('Mentors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Meet your mentor <ArrowRight size={16} /></Button></div><div className="path-card"><div className="path-header"><div className="path-icon"><GraduationCap size={24} /></div><div><small>YOUR FUTURE PATH</small><h3>From curious to confident</h3></div><span className="path-menu">•••</span></div><div className="path-step"><span className="step-number">01</span><div><strong>Discover what excites you</strong><small>Interests, subjects and strengths</small></div><Check size={17} /></div><div className="path-connector"></div><div className="path-step"><span className="step-number">02</span><div><strong>Explore your possibilities</strong><small>Universities, fields and careers</small></div><ArrowRight size={16} /></div><div className="path-connector"></div><div className="path-step"><span className="step-number">03</span><div><strong>Build your next-step plan</strong><small>Small actions, steady progress</small></div><Target size={17} /></div><div className="path-footer"><Sparkles size={16} /> Your goals can grow with you.</div></div></div></section>
          <section className="how-section section" id="how"><div className="container"><div className="center-heading"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>A better way to <span>move forward.</span></h2><p>From first search to your next breakthrough, keep learning simple.</p></div><div className="steps-grid"><div className="step-card"><span className="step-icon blue-bg"><Search /></span><span className="step-count">STEP 01</span><h3>Find your fit</h3><p>Search by subject, learning level, language or location.</p></div><div className="step-card"><span className="step-icon purple-bg"><Users /></span><span className="step-count">STEP 02</span><h3>Connect with confidence</h3><p>Explore profiles, experience and available learning modes.</p></div><div className="step-card"><span className="step-icon green-bg"><CalendarDays /></span><span className="step-count">STEP 03</span><h3>Make progress</h3><p>Plan sessions, work toward goals and celebrate your growth.</p></div></div></div></section>
          <section className="cta-section container"><div className="cta-orb"></div><div className="cta-content"><span className="cta-label"><Sparkles size={15} /> YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready to take your<br />next <span>big step?</span></h2><p>Find support for today's subjects and tomorrow's dreams.</p><Button onClick={() => navigate('/get-started')}>Start your EduPath <ArrowRight size={17} /></Button></div><div className="cta-art"><div className="cta-cap"><GraduationCap size={88} /></div><span className="cta-star star-a">✦</span><span className="cta-star star-b">✧</span><span className="cta-star star-c">✦</span><div className="cta-book"></div></div></section>
        </main>
  </>
}
