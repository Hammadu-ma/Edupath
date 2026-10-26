import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'student' | 'parent' | 'tutor' | 'mentor'
type Ctx = {
  loading: boolean; session: Session | null; user: User | null
  displayName: string; language: string; roles: Role[]; isAdmin: boolean
  isLearner: boolean; isEducator: boolean; sessionExpired: boolean
  refresh: () => Promise<void>; signOut: () => Promise<void>; clearExpired: () => void
}
const AuthContext = createContext<Ctx | null>(null)
export const useAuth = () => { const c = useContext(AuthContext); if (!c) throw new Error('useAuth outside AuthProvider'); return c }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [language, setLanguage] = useState('en')
  const [roles, setRoles] = useState<Role[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [expired, setExpired] = useState(false)
  const manualSignOut = useRef(false)

  // Restore the persisted session on load, then follow auth events (sign-in, refresh, sign-out, expiry).
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let active = true
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); if (!data.session) setLoading(false) } })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Do not call Supabase from inside this callback; just record state (see supabase-js docs).
      setSession(next)
      if (event === 'SIGNED_OUT') {
        if (!manualSignOut.current) setExpired(true)
        manualSignOut.current = false
        setRoles([]); setIsAdmin(false); setDisplayName(''); setLoading(false)
      }
      if (event === 'SIGNED_IN') setExpired(false)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const userId = session?.user.id ?? null
  const load = useCallback(async () => {
    if (!supabase || !userId) return
    const [p, r, a] = await Promise.all([
      supabase.from('profiles').select('display_name, preferred_language').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.rpc('is_admin'),
    ])
    setDisplayName(p.data?.display_name ?? '')
    setLanguage(p.data?.preferred_language ?? 'en')
    setRoles(((r.data ?? []) as { role: Role }[]).map(x => x.role))
    setIsAdmin(a.data === true)
    setLoading(false)
  }, [userId])
  useEffect(() => { if (userId) void load() }, [userId, load])

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo<Ctx>(() => ({
    loading, session, user: session?.user ?? null, displayName, language, roles, isAdmin,
    isLearner: roles.includes('student') || roles.includes('parent'),
    isEducator: roles.includes('tutor') || roles.includes('mentor'),
    sessionExpired: expired, refresh: load, signOut, clearExpired: () => setExpired(false),
  }), [loading, session, displayName, language, roles, isAdmin, expired, load, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
