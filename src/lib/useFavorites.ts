import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { listFavoriteIds, setFavorite } from './db'

export function useFavorites() {
  const a = useAuth()
  const navigate = useNavigate()
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const userId = a.user?.id
  useEffect(() => {
    if (!userId) { setIds(new Set()); return }
    listFavoriteIds().then(x => setIds(new Set(x))).catch(() => undefined)
  }, [userId])
  const toggle = useCallback(async (tutorId: string) => {
    if (!userId) { navigate('/login', { state: { next: window.location.pathname } }); return }
    const on = !ids.has(tutorId)
    setIds(prev => { const n = new Set(prev); if (on) n.add(tutorId); else n.delete(tutorId); return n }) // optimistic
    try { await setFavorite(tutorId, on); setError('') }
    catch (e) {
      setIds(prev => { const n = new Set(prev); if (on) n.delete(tutorId); else n.add(tutorId); return n }) // roll back
      setError((e as Error).message)
    }
  }, [ids, userId, navigate])
  return { ids, toggle, error }
}
