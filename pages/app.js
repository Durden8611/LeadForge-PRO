import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClient } from '../lib/supabase'

const FONTS = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"

export default function AppPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const rootRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setUser(session.user)
        // Try to fetch profile row from `profiles` (optional)
        supabase.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data, error }) => {
            if (!error && data) setProfile(data)
          })
          .finally(() => setLoading(false))
      }
    })
  }, [])

  // Mount the LeadForge React app once the container is ready
  useEffect(() => {
    if (!loading && user && rootRef.current && !mountedRef.current) {
      mountedRef.current = true
      // Dynamically load the pre-compiled app script, then mount
      const script = document.createElement('script')
      script.src = '/leadforge-app.js'
      script.onload = () => {
        if (window.LeadForgePro && window.React && window.ReactDOM) {
          const root = window.ReactDOM.createRoot(rootRef.current)
          root.render(window.React.createElement(window.LeadForgePro, null))
        }
      }
      document.body.appendChild(script)
    }
  }, [loading, user])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const displayName = user?.user_metadata?.full_name
    || profile?.username
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || user?.phone
    || 'User'

  const avatarLetter = displayName.charAt(0).toUpperCase()

  if (loading) {
    return (
      <>
        <Head>
          <title>LeadForge PRO</title>
          <link href={FONTS} rel="stylesheet" />
        </Head>
        <div style={{
          minHeight: '100vh', background: '#f5f0e8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '1rem',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '2px solid #d4c9b0', borderTopColor: '#c9a84c',
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>LeadForge PRO</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* React UMD for the pre-compiled app */}
        <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossOrigin="anonymous" />
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossOrigin="anonymous" />
      </Head>

      {/* Top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 38, zIndex: 9999,
        background: '#0d0d0d', borderBottom: '1px solid #1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: '#c9a84c',
            color: '#0d0d0d', fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.7rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarLetter}
          </div>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: '0.44rem',
            letterSpacing: '0.14em', color: '#5a5040', textTransform: 'uppercase',
          }}>
            {displayName}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            background: 'transparent', border: '1px solid #1f1f1f',
            color: '#3a3a3a', fontFamily: "'DM Mono', monospace",
            fontSize: '0.4rem', letterSpacing: '0.12em', padding: '0.28rem 0.6rem',
            borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase',
          }}
        >
          Sign Out
        </button>
      </div>

      {/* App container */}
      <div style={{ paddingTop: 38, minHeight: '100vh', background: '#f5f0e8' }}>
        <div ref={rootRef} id="lf-root" />
      </div>
    </>
  )
}
