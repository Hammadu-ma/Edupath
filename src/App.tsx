import { useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownRight, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronDown,
  Compass, GraduationCap, Heart, MapPin, Menu, MessageCircle, Search, ShieldCheck,
  Sparkles, Star, Target, Users, X, Zap
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Tutor = { id: number; name: string; initials: string; subject: string; level: string; rate: number; rating: string; reviews: number; distance: string; mode: string; color: string; verified: boolean; bio: string }
const tutors: Tutor[] = [
  { id: 1, name: 'Ale mu Bekele'.replace(' ', ''), initials: 'AB', subject: 'Mathematics', level: 'Grades 9–12', rate: 450, rating: '4.9', reviews: 124, distance: '1.2 km away', mode: 'In person · Online', color: 'blue', verified: true, bio: 'Makes challenging concepts feel simple with patient, practical lessons.' },
  { id: 2, name: 'Hana Mammo', initials: 'HM', subject: 'Physics', level: 'Grades 9–12', rate: 400, rating: '4.8', reviews: 86, distance: '2.4 km away', mode: 'In person', color: 'rose', verified: true, bio: 'Build confidence through clear explanations and guided practice.' },
  { id: 3, name: 'Daniel Tesfaye', initials: 'DT', subject: 'Chemistry', level: 'Grades 10–12', rate: 350, rating: '4.9', reviews: 63, distance: '3.1 km away', mode: 'Online', color: 'violet', verified: true, bio: 'Exam preparation and strong foundations, one concept at a time.' },
]
const mentors = [
  { name: 'Selamawit Tadesse', field: 'Medicine · Jimma University', initials: 'ST', color: 'rose', detail: 'University preparation and medical career guidance' },
  { name: 'Dereje Alemu', field: 'Engineering · AAU', initials: 'DA', color: 'blue', detail: 'Engineering pathways and application planning' },
]
function Avatar({ initials, color = 'blue', size = 'normal' }: { initials: string; color?: string; size?: string }) {
  return <div className={`avatar ${color} ${size}`} aria-label={initials}>{initials}</div>
}
function Brand() {
  return <Link className="brand" to="/"><span className="brand-mark"><GraduationCap size={22} /></span><span>Edu<span>Path</span></span></Link>
}
function Button({ children, variant = 'primary', onClick, type = 'button' }: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} className={`button ${variant}`}>{children}</button>
}
function TutorCard({ tutor, onBook }: { tutor: Tutor; onBook: (t: Tutor) => void }) {
  const [saved, setSaved] = useState(false)
  return <article className="tutor-card">
    <div className={`tutor-art ${tutor.color}`}><Avatar initials={tutor.initials} color={tutor.color} size="large" /><button className={`save ${saved ? 'saved' : ''}`} onClick={() => setSaved(!saved)} aria-label="Save tutor"><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>{tutor.verified && <span className="verified"><ShieldCheck size={13} /> Verified</span>}</div>
    <div className="tutor-info"><div className="tutor-title"><div><h3>{tutor.name}</h3><p>{tutor.subject} <span>·</span> {tutor.level}</p></div><div className="rating"><Star size={14} fill="currentColor" /> {tutor.rating} <small>({tutor.reviews})</small></div></div>
      <p className="tutor-bio">{tutor.bio}</p><div className="tutor-meta"><span><MapPin size={14} /> {tutor.distance}</span><span><BookOpen size={14} /> {tutor.mode}</span></div>
      <div className="tutor-bottom"><div><strong>{tutor.rate} ETB</strong><small> / session</small></div><Button onClick={() => onBook(tutor)}>View profile <ArrowRight size={15} /></Button></div>
    </div>
  </article>
}
function App() {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'Tutors' | 'Mentors'>('Tutors')
  const [modal, setModal] = useState<Tutor | 'signin' | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [filter, setFilter] = useState('All subjects')
  const location = useLocation()
  const navigate = useNavigate()
  const visibleTutors = useMemo(() => tutors.filter(t => {
    const textMatch = `${t.name} ${t.subject} ${t.level}`.toLowerCase().includes(query.toLowerCase())
    const subjectMatch = filter === 'All subjects' || t.subject === filter
    return textMatch && subjectMatch
  }), [query, filter])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setAuthMessage('')
    if (!supabase) { setAuthMessage('Connect your Supabase project in .env to enable authentication.'); return }
    setAuthBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthBusy(false)
    if (error) setAuthMessage(error.message)
    else { setAuthMessage('Signed in successfully.'); setModal(null); navigate('/') }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="nav-inner"><Brand /><nav className={mobileMenu ? 'nav-links open' : 'nav-links'}><Link className={location.pathname === '/' ? 'active' : ''} to="/" onClick={() => setMobileMenu(false)}>Home</Link><a href="#discover" onClick={() => setMobileMenu(false)}>Find a tutor</a><a href="#mentors" onClick={() => { setActiveTab('Mentors'); setMobileMenu(false) }}>Find a mentor</a><a href="#how" onClick={() => setMobileMenu(false)}>How it works</a></nav><div className="nav-actions"><button className="icon-button notification" aria-label="Notifications"><Bell size={19} /></button><Button variant="ghost" onClick={() => setModal('signin')}>Log in</Button><Button onClick={() => navigate('/get-started')}>Get started <ArrowRight size={16} /></Button></div><button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button></div></header>
    <Routes>
      <Route path="/get-started" element={<GetStarted onBack={() => navigate('/')} />} />
      <Route path="*" element={<>
        <main>
          <section className="hero container"><div className="hero-copy"><div className="eyebrow"><Sparkles size={15} /> YOUR LEARNING JOURNEY STARTS HERE</div><h1>Find your people.<br /><span>Shape your future.</span></h1><p className="hero-lede">Connect with trusted tutors and inspiring mentors who help you reach your goals — one step at a time.</p><div className="hero-ctas"><Button onClick={() => { setActiveTab('Tutors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Find a tutor <ArrowRight size={17} /></Button><Button variant="secondary" onClick={() => { setActiveTab('Mentors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore mentors <Target size={17} /></Button></div><div className="hero-proof"><div className="proof-avatars"><Avatar initials="AB" /><Avatar initials="HM" color="rose" /><Avatar initials="ST" color="violet" /></div><div><div className="proof-stars"><Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <Star size={13} fill="currentColor" /> <b>Made for your next step</b></div><small>Trusted learning, built around you</small></div></div></div>
          <div className="hero-visual"><div className="visual-glow"></div><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="hero-main-card"><div className="hero-card-top"><span className="live-dot"></span> YOUR LEARNING SPACE <span className="hero-card-menu">•••</span></div><div className="welcome-row"><div><small>MONDAY, YOUR NEXT CHAPTER</small><h3>Big goals start<br />with small steps.</h3></div><div className="goal-illustration"><GraduationCap size={42} /></div></div><div className="goal-progress"><div className="progress-head"><span>Math confidence</span><strong>72%</strong></div><div className="progress-track"><span style={{ width: '72%' }}></span></div><small>You're making great progress</small></div><div className="mini-session"><Avatar initials="AB" /><div><strong>Mathematics tutoring</strong><small>Today · 4:00 PM</small></div><span className="session-status">Upcoming</span></div></div><div className="floating-card float-top"><span className="float-icon purple"><ShieldCheck size={19} /></span><div><strong>Trusted people</strong><small>Profiles reviewed</small></div><Check size={17} className="float-check" /></div><div className="floating-card float-bottom"><span className="float-icon yellow"><Star size={18} fill="currentColor" /></span><div><strong>Find your next step</strong><small>Guidance that fits you</small></div><ArrowDownRight size={18} /></div><div className="decor decor-one"></div><div className="decor decor-two"></div></div></section>
          <section className="trust-strip container"><div><ShieldCheck /><span><strong>Trust comes first</strong><small>Verification and safety-minded design</small></span></div><div><MapPin /><span><strong>Near you or online</strong><small>Learning that fits your life</small></span></div><div><Target /><span><strong>Built around your goals</strong><small>Subjects, university and careers</small></span></div><div><Zap /><span><strong>Your pace, your path</strong><small>Flexible learning journeys</small></span></div></section>
          <section className="discover-section section" id="discover"><div className="container"><div className="section-heading"><div><div className="eyebrow">YOUR NEXT STEP IS CLOSER</div><h2>People who help you <span>grow.</span></h2><p>Find the right support for where you are — and where you want to go.</p></div><a className="text-link" href="#discover">Explore all <ArrowRight size={16} /></a></div>
            <div className="discovery-panel"><div className="discovery-top"><div className="tabs"><button className={activeTab === 'Tutors' ? 'selected' : ''} onClick={() => setActiveTab('Tutors')}><BookOpen size={16} /> Tutors</button><button className={activeTab === 'Mentors' ? 'selected' : ''} onClick={() => setActiveTab('Mentors')}><Target size={16} /> Mentors</button></div><div className="location-chip"><MapPin size={15} /> Jimma, Ethiopia <ChevronDown size={14} /></div></div>
              <div className="search-row"><div className="search-input"><Search size={18} /><input aria-label="Search people" placeholder={activeTab === 'Tutors' ? 'Try “Mathematics” or a tutor name' : 'Try “Medicine”, “Engineering” or a university'} value={query} onChange={setQuery} /></div>{activeTab === 'Tutors' && <select aria-label="Subject filter" value={filter} onChange={e => setFilter(e.target.value)}><option>All subjects</option><option>Mathematics</option><option>Physics</option><option>Chemistry</option></select>}<Button onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Search <Search size={15} /></Button></div>
              <div id="results">{activeTab === 'Tutors' ? <div className="tutor-grid">{visibleTutors.map(t => <TutorCard key={t.id} tutor={t} onBook={setModal} />)}{visibleTutors.length === 0 && <div className="empty-state">No demo tutors match that search. Try another subject.</div>}</div> : <div className="mentor-grid" id="mentors">{mentors.map(m => <article className="mentor-card" key={m.name}><Avatar initials={m.initials} color={m.color} size="large" /><div className="mentor-details"><span className="mentor-kicker">FUTURE GOALS MENTOR</span><h3>{m.name}</h3><p>{m.field}</p><small>{m.detail}</small><Button onClick={() => setModal('signin')}>Explore profile <ArrowRight size={15} /></Button></div><span className="mentor-spark"><Sparkles size={22} /></span></article>)}</div>}</div><div className="demo-note"><span className="demo-dot"></span> Preview profiles for the design prototype · connect a backend before real bookings</div>
            </div></div></section>
          <section className="goals-section section" id="mentors"><div className="container goals-layout"><div className="goals-copy"><div className="eyebrow">MORE THAN A LESSON</div><h2>Your future deserves <span>a plan.</span></h2><p>Big dreams can feel far away. Get guidance from people who know the path — and turn “someday” into your next step.</p><ul className="check-list"><li><Check size={16} /> Explore universities and departments</li><li><Check size={16} /> Understand career paths and possibilities</li><li><Check size={16} /> Make a plan that feels achievable</li></ul><Button onClick={() => { setActiveTab('Mentors'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }) }}>Meet your mentor <ArrowRight size={16} /></Button></div><div className="path-card"><div className="path-header"><div className="path-icon"><GraduationCap size={24} /></div><div><small>YOUR FUTURE PATH</small><h3>From curious to confident</h3></div><span className="path-menu">•••</span></div><div className="path-step"><span className="step-number">01</span><div><strong>Discover what excites you</strong><small>Interests, subjects and strengths</small></div><Check size={17} /></div><div className="path-connector"></div><div className="path-step"><span className="step-number">02</span><div><strong>Explore your possibilities</strong><small>Universities, fields and careers</small></div><ArrowRight size={16} /></div><div className="path-connector"></div><div className="path-step"><span className="step-number">03</span><div><strong>Build your next-step plan</strong><small>Small actions, steady progress</small></div><Target size={17} /></div><div className="path-footer"><Sparkles size={16} /> Your goals can grow with you.</div></div></div></section>
          <section className="how-section section" id="how"><div className="container"><div className="center-heading"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>A better way to <span>move forward.</span></h2><p>From first search to your next breakthrough, keep learning simple.</p></div><div className="steps-grid"><div className="step-card"><span className="step-icon blue-bg"><Search /></span><span className="step-count">STEP 01</span><h3>Find your fit</h3><p>Search by subject, learning level, language or location.</p></div><div className="step-card"><span className="step-icon purple-bg"><Users /></span><span className="step-count">STEP 02</span><h3>Connect with confidence</h3><p>Explore profiles, experience and available learning modes.</p></div><div className="step-card"><span className="step-icon green-bg"><CalendarDays /></span><span className="step-count">STEP 03</span><h3>Make progress</h3><p>Plan sessions, work toward goals and celebrate your growth.</p></div></div></div></section>
          <section className="cta-section container"><div className="cta-orb"></div><div className="cta-content"><span className="cta-label"><Sparkles size={15} /> YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready to take your<br />next <span>big step?</span></h2><p>Find support for today's subjects and tomorrow's dreams.</p><Button onClick={() => navigate('/get-started')}>Start your EduPath <ArrowRight size={17} /></Button></div><div className="cta-art"><div className="cta-cap"><GraduationCap size={88} /></div><span className="cta-star star-a">✦</span><span className="cta-star star-b">✧</span><span className="cta-star star-c">✦</span><div className="cta-book"></div></div></section>
        </main>
        <footer className="footer"><div className="container footer-top"><div className="footer-brand"><Brand /><p>Learn today. Achieve tomorrow.<br />Your path, your possibilities.</p></div><div className="footer-col"><strong>Discover</strong><a href="#discover">Find a tutor</a><a href="#mentors">Meet a mentor</a><a href="#how">How it works</a></div><div className="footer-col"><strong>EduPath</strong><a href="#how">About us</a><a href="#how">Trust & safety</a><a href="#how">Contact</a></div><div className="footer-col"><strong>For educators</strong><a href="/get-started">Become a tutor</a><a href="/get-started">Become a mentor</a></div></div><div className="container footer-bottom"><span>© 2026 EduPath. Built for brighter futures.</span><span><ShieldCheck size={14} /> Designed with trust in mind</span></div></footer>
      </>} />
    </Routes>
    <nav className="mobile-bottom-nav"><Link to="/"><BookOpen size={19} /><span>Home</span></Link><a href="#discover"><Compass size={19} /><span>Discover</span></a><button onClick={() => setModal('signin')}><CalendarDays size={19} /><span>Bookings</span></button><button onClick={() => setModal('signin')}><MessageCircle size={19} /><span>Messages</span></button></nav>
    {modal && <div className="modal-backdrop" onClick={() => { setModal(null); setAuthMessage('') }}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => { setModal(null); setAuthMessage('') }} aria-label="Close"><X size={19} /></button>{modal === 'signin' ? <><div className="modal-symbol"><GraduationCap size={25} /></div><h2>Welcome back</h2><p className="modal-subtitle">Your next step is waiting for you.</p><form onSubmit={handleSignIn} className="auth-form"><label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></label><Button type="submit">{authBusy ? 'Signing in…' : 'Log in'} <ArrowRight size={16} /></Button>{authMessage && <p className="auth-message">{authMessage}</p>}</form><p className="modal-foot">New to EduPath? <Link to="/get-started" onClick={() => setModal(null)}>Create an account</Link></p></> : <><div className={`modal-profile ${modal.color}`}><Avatar initials={modal.initials} color={modal.color} size="large" /></div><div className="modal-verified"><ShieldCheck size={14} /> Demo profile · verification not connected</div><h2>{modal.name}</h2><p className="modal-subtitle">{modal.subject} · {modal.level}</p><div className="profile-rating"><Star size={16} fill="currentColor" /> {modal.rating} <span>({modal.reviews} demo reviews)</span></div><p className="profile-bio">{modal.bio}</p><div className="profile-details"><span><MapPin size={16} /> {modal.distance}</span><span><BookOpen size={16} /> {modal.mode}</span><span><ShieldCheck size={16} /> Verification workflow required</span></div><div className="modal-book-row"><div><strong>{modal.rate} ETB</strong><small> / session · sample price</small></div><Button onClick={() => setModal('signin')}>Log in to continue <ArrowRight size={15} /></Button></div></>}</div></div>}
  </div>
}

function GetStarted({ onBack }: { onBack: () => void }) {
  const [role, setRole] = useState('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (!supabase) { setMessage('Supabase is not configured yet. Add the project URL and publishable key to your .env file.'); return }
    setBusy(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })
    setBusy(false)
    if (error) setMessage(error.message)
    else setMessage('Account request created. Check your email if email confirmation is enabled. Role selection will be finalized through the secure onboarding API.')
  }
  return <main className="signup-page"><div className="signup-card"><button className="back-link" onClick={onBack}>← Back to home</button><div className="signup-heading"><div className="modal-symbol"><GraduationCap size={25} /></div><div className="eyebrow">WELCOME TO EDUPATH</div><h1>Let's start your<br /><span>next chapter.</span></h1><p>Create an account to find learning support that fits your goals.</p></div><form className="auth-form" onSubmit={submit}><label>I’m joining as</label><div className="role-picker">{[{id:'student',label:'Student',sub:'Grow your skills',icon:<BookOpen size={20} />},{id:'parent',label:'Parent',sub:'Support a learner',icon:<Heart size={20} />},{id:'tutor',label:'Tutor / mentor',sub:'Share your knowledge',icon:<GraduationCap size={20} />}].map(r => <button type="button" key={r.id} className={`role-option ${role === r.id ? 'chosen' : ''}`} onClick={() => setRole(r.id)}>{r.icon}<strong>{r.label}</strong><small>{r.sub}</small>{role === r.id && <span className="role-check"><Check size={13} /></span>}</button>)}</div><label>Full name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" autoComplete="name" /></label><label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label><label>Password<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label><Button type="submit">{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={16} /></Button>{message && <p className="auth-message">{message}</p>}<p className="privacy-note"><ShieldCheck size={15} /> Your information stays private. We only share what’s needed to connect you safely.</p></form></div><aside className="signup-aside"><div className="signup-aside-inner"><span className="aside-spark">✦</span><div className="aside-art"><GraduationCap size={88} /></div><h2>Every big future<br />starts <span>somewhere.</span></h2><p>Find your people, build your confidence, and make your next step count.</p><div className="aside-pill"><ShieldCheck size={15} /> Trust-minded learning</div><div className="aside-pill"><MapPin size={15} /> Near you or online</div><div className="aside-pill"><Target size={15} /> Your goals, your path</div></div></aside></main>
}

export default App
