import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../../lib/supabase'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

function readHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

export default function ResetPassword() {
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [supabase, setSupabase] = useState(null)

  useEffect(() => {
    setSupabase(createClient())
  }, [])

  useEffect(() => {
    if (!supabase) return

    async function init() {
      setError('')
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const hashParams = readHashParams()
      const errorCode = url.searchParams.get('error_code')
      const hashError = hashParams.get('error')
      const authType = hashParams.get('type') || url.searchParams.get('type')

      if (errorCode || hashError) {
        setError('This reset link is invalid or has expired. Please request a new one.')
        return
      }

      if (code) {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchErr) {
          setError('This reset link is invalid or has expired. Please request a new one.')
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!session || authType && authType !== 'recovery') {
        setError('This reset link is invalid or has expired. Please request a new one.')
        return
      }

      setReady(true)
    }
    init()
  }, [supabase])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!supabase) {
      setError('Authentication is still loading. Please try again.')
      return
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.')
      return
    }
    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }
    setMessage('Password updated successfully. Redirecting to app...')
    setTimeout(() => router.replace('/app'), 1500)
  }

  return (
    <>
      <Head>
        <title>LeadForge PRO | Reset Password</title>
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
          <h1 style={{ margin: 0, fontSize: 30, fontFamily: 'Playfair Display, serif' }}>LeadForge PRO</h1>
          <p style={{ marginTop: 6, color: '#6a6153', fontSize: 14 }}>Set a new password</p>

          {error && (
            <div style={{ marginBottom: 16, border: '1px solid #e2a5a5', background: '#fff0f0', color: '#8c1f1f', borderRadius: 8, padding: 10, fontSize: 13 }}>
              {error}
              {!ready && (
                <div style={{ marginTop: 8 }}>
                  <a href="/login" style={{ color: '#8c1f1f', fontWeight: 700 }}>Back to login →</a>
                </div>
              )}
            </div>
          )}

          {message && (
            <div style={{ marginBottom: 16, border: '1px solid #a6d9a6', background: '#f1fff1', color: '#1f6a1f', borderRadius: 8, padding: 10, fontSize: 13 }}>
              {message}
            </div>
          )}

          {ready && !message && (
            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#695f52' }}>New Password</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
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
              <p style={{ marginTop: 0, marginBottom: 12, color: '#786c5c', fontSize: 12, lineHeight: 1.45 }}>
                At least 8 characters — uppercase, lowercase, number, and special character.
              </p>
              <button
                disabled={loading}
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
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </form>
          )}
        </section>
      </main>
    </>
  )
}
