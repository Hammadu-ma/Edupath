import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Client-side key is intentionally publishable. All data access is protected by Row Level Security
// and security-definer functions in supabase/migrations. Never put a secret/service-role key here.
export const supabase = url && publishableKey
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export const isSupabaseConfigured = Boolean(supabase)

/** Absolute URL for auth e-mail links. Uses VITE_SITE_URL when set, otherwise the current origin. */
export const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined) || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')
