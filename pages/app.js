import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import LeadForgePro from '../components/LeadForgePro'
import { createClient } from '../lib/supabase'
import { ensureProfile } from '../lib/ensureProfile'

export default function AppPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }

      await ensureProfile(supabase, session.user)
      setUser(session.user)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        router.replace('/login')
        return
      }

      await ensureProfile(supabase, session.user)
      setUser(session.user)
    })

    return () => {
      sub?.subscription?.unsubscribe()
    }
  }, [router])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f0e8' }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#5a5040' }}>Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>LeadForge PRO</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        height: 44,
        background: '#0d0d0d',
        borderBottom: '1px solid #1f1f1f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
      }}>
        <div style={{ color: '#c9a84c', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em' }}>
          {user?.email || 'LeadForge User'}
        </div>
        <button
          onClick={handleSignOut}
          style={{
            background: 'transparent',
            color: '#f5f0e8',
            border: '1px solid #3a3a3a',
            borderRadius: 4,
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Sign Out
        </button>
      </div>

      <LeadForgePro userId={user?.id} />
    </>
  )
}
