import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { trackUserActivity } from '../lib/activityTracker'
import { createClient } from '../lib/supabase'
import { ensureProfile } from '../lib/ensureProfile'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

function getRedirectUrl(path) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${baseUrl}${path}`
}

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [supabase, setSupabase] = useState(null)

  useEffect(() => {
    setSupabase(createClient())
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/app')
    })
  }, [router, supabase])

  useEffect(() => {
    if (!router.isReady) return

    const nextError = router.query?.error
    if (!nextError || Array.isArray(nextError)) return

    if (nextError === 'verify_email') {
      setMode('signin')
      setMessage('Check your inbox, verify your email, then sign in.')
      setError('')
      return
    }

    if (nextError === 'callback_failed') {
      setMode('signin')
      setError('The sign-in link was invalid or expired. Please try again.')
      setMessage('')
      return
    }

    if (nextError === 'no_session') {
      setMode('signin')
      setError('No session was created from that sign-in attempt. Please try again.')
      setMessage('')
    }
  }, [router.isReady, router.query])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!supabase) {
      setError('Authentication is still loading. Please try again.')
      return
    }

    if (!email) {
      setError('Please enter your email address.')
      return
    }

    if (mode === 'forgot') {
      setLoading(true)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl('/auth/reset-password'),
      })
      if (resetError) {
        setError(resetError.message)
      } else {
        setMessage('Password reset email sent. Check your inbox and follow the link to set a new password.')
      }
      setLoading(false)
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    if (mode === 'signup' && !PASSWORD_REGEX.test(password)) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl('/auth/callback'),
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      if (data?.session) {
        await supabase.auth.signOut()
      }

      setMessage('Registration successful. Check your email and verify your account before signing in.')
      setMode('signin')
      setLoading(false)
      return
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    if (!data?.user?.email_confirmed_at) {
      await supabase.auth.signOut()
      setError('Please verify your email address first, then sign in.')
      setLoading(false)
      return
    }

    await ensureProfile(supabase, data.user)
    await trackUserActivity(supabase, {
      userId: data.user.id,
      eventType: 'sign_in',
      path: '/login',
    })
    router.replace('/app')
  }

  return (
    <>
      <Head>
        <title>LeadForge PRO | Sign In</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #0f0f0f 0%, #171717 100%)',
        padding: 20,
      }}>
        <section style={{
          width: '100%',
          maxWidth: 460,
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e6ddcf',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          padding: 24,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          <h1 style={{ margin: 0, fontSize: 30, fontFamily: 'Playfair Display, serif' }}>
            LeadForge PRO
          </h1>
          <p style={{ marginTop: 6, color: '#6a6153', fontSize: 14 }}>
            {mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Sign in to your account' : 'Reset your password'}
          </p>

          {mode !== 'forgot' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); setMessage('') }}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d8cebf',
                background: mode === 'signup' ? '#c9a84c' : '#f7f3ec',
                color: mode === 'signup' ? '#111' : '#5f5648',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); setMessage('') }}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d8cebf',
                background: mode === 'signin' ? '#c9a84c' : '#f7f3ec',
                color: mode === 'signin' ? '#111' : '#5f5648',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Sign In
            </button>
          </div>
          )}

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#695f52' }}>
              Email (used as username)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              autoComplete="email"
              required
              style={{
                width: '100%',
                border: '1px solid #d4c9b8',
                borderRadius: 8,
                padding: '12px 12px',
                marginBottom: 12,
                fontSize: 14,
              }}
            />

            {mode !== 'forgot' && (
              <>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#695f52' }}>
                  Password
                </label>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    style={{
                      width: '100%',
                      border: '1px solid #d4c9b8',
                      borderRadius: 8,
                      padding: '12px 70px 12px 12px',
                      fontSize: 14,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 7,
                      border: '1px solid #d8cebf',
                      borderRadius: 6,
                      background: '#f7f3ec',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </>
            )}

            {mode === 'signup' && (
              <p style={{ marginTop: 0, marginBottom: 12, color: '#786c5c', fontSize: 12, lineHeight: 1.45 }}>
                Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
              </p>
            )}

            {mode === 'signin' && (
              <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                  style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div style={{ marginBottom: 12, border: '1px solid #e2a5a5', background: '#fff0f0', color: '#8c1f1f', borderRadius: 8, padding: 10, fontSize: 13 }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{ marginBottom: 12, border: '1px solid #a6d9a6', background: '#f1fff1', color: '#1f6a1f', borderRadius: 8, padding: 10, fontSize: 13 }}>
                {message}
              </div>
            )}

            <button
              disabled={loading || !supabase}
              type="submit"
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 8,
                background: '#111',
                color: '#f7f1e7',
                padding: '12px 14px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Please wait...' : !supabase ? 'Loading...' : mode === 'signup' ? 'Register' : mode === 'signin' ? 'Sign In' : 'Send Reset Email'}
            </button>

            {mode === 'forgot' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); setMessage('') }}
                  style={{ background: 'none', border: 'none', color: '#6a6153', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0 }}
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </form>
        </section>
      </main>
    </>
  )
}
