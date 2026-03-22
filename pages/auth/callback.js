import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../../lib/supabase'
import { ensureProfile } from '../../lib/ensureProfile'

function readHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    async function finishAuth() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const errorCode = url.searchParams.get('error_code')
      const hashParams = readHashParams()
      const hashError = hashParams.get('error')

      if (errorCode || hashError) {
        router.replace('/login?error=callback_failed')
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          router.replace('/login?error=callback_failed')
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login?error=no_session')
        return
      }

      await ensureProfile(supabase, session.user)

      const authType = hashParams.get('type') || url.searchParams.get('type')

      if (authType !== 'recovery' && !session.user?.email_confirmed_at) {
        await supabase.auth.signOut()
        router.replace('/login?error=verify_email')
        return
      }

      router.replace(authType === 'recovery' ? '/auth/reset-password' : '/app')
    }

    finishAuth()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111',
      color: '#f5f0e8',
      display: 'grid',
      placeItems: 'center',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      Finishing sign in...
    </div>
  )
}
