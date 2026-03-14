import { createClient } from '../../lib/supabase'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

// This page handles the redirect after:
// - Email magic link clicks
// - Google OAuth callback
// - Apple OAuth callback
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    // Supabase SSR automatically exchanges the code in the URL for a session
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // If a pending profile was stored during signup, upsert it now (after session is established)
        try {
          const raw = localStorage.getItem('pending_profile')
          if (raw) {
            const pending = JSON.parse(raw)
            if (pending && pending.username) {
              // Attempt to upsert into profiles table; ignore if table doesn't exist
              supabase.from('profiles').upsert([{ id: session.user.id, username: pending.username, full_name: pending.username }])
                .then(() => { try { localStorage.removeItem('pending_profile') } catch (e) {} })
                .catch(() => {})
            }
          }
        } catch (e) {}
        router.replace('/app')
      } else {
        router.replace('/login?error=auth_failed')
      }
    })
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '1rem',
      fontFamily: 'sans-serif',
      color: '#f5f0e8'
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '2px solid #2a2a2a', borderTopColor: '#c9a84c',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#5a5040', letterSpacing: '0.1em' }}>
        SIGNING YOU IN…
      </p>
    </div>
  )
}
