import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClient } from '../lib/supabase'

const FONTS = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"

const S = {
  page: {
    minHeight: '100vh',
    background: '#0d0d0d',
    display: 'flex',
    alignItems: 'stretch',
    fontFamily: "'DM Sans', sans-serif",
  },
  left: {
    flex: 1,
    background: '#0d0d0d',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 4rem',
    position: 'relative',
    overflow: 'hidden',
  },
  right: {
    width: 460,
    flexShrink: 0,
    background: '#0f0f0f',
    borderLeft: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2.5rem 2rem',
    overflowY: 'auto',
  },
  formWrap: { width: '100%', maxWidth: 360 },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '2.6rem',
    fontWeight: 900,
    color: '#f5f0e8',
    letterSpacing: '-0.03em',
    lineHeight: 1,
    marginBottom: '0.35rem',
  },
  tagline: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.5rem',
    letterSpacing: '0.28em',
    color: '#3a3a3a',
    textTransform: 'uppercase',
    marginBottom: '2.5rem',
  },
  divider: { width: 40, height: 1, background: '#c9a84c', opacity: 0.4, marginBottom: '2rem' },
  feature: { display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' },
  fDot: { width: 5, height: 5, borderRadius: '50%', background: '#c9a84c', opacity: 0.6, flexShrink: 0 },
  fText: { fontSize: '0.78rem', color: '#5a5040', lineHeight: 1.5 },

  // Right panel
  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.55rem',
    fontWeight: 700,
    color: '#f5f0e8',
    marginBottom: '0.25rem',
  },
  sub: { fontSize: '0.78rem', color: '#4a4a4a', marginBottom: '1.75rem', lineHeight: 1.6 },

  // Tabs
  tabs: { display: 'flex', gap: '0', marginBottom: '1.75rem', borderBottom: '1px solid #1f1f1f' },
  tab: {
    flex: 1, padding: '0.6rem', border: 'none', background: 'transparent',
    fontFamily: "'DM Mono', monospace", fontSize: '0.5rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', cursor: 'pointer', color: '#3a3a3a',
    borderBottom: '2px solid transparent', marginBottom: '-1px', transition: 'all 0.15s',
  },
  tabActive: { color: '#c9a84c', borderBottomColor: '#c9a84c' },

  // OAuth buttons
  oauthBtn: {
    width: '100%', padding: '0.75rem 1rem',
    background: '#111', border: '1px solid #222',
    borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '0.65rem', cursor: 'pointer', marginBottom: '0.6rem',
    fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', fontWeight: 500,
    color: '#d0c8b8', transition: 'all 0.15s',
  },
  oauthBtnHover: { background: '#161616', borderColor: '#2a2a2a' },

  // Divider
  orRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.1rem 0' },
  orLine: { flex: 1, height: 1, background: '#1a1a1a' },
  orText: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.45rem',
    letterSpacing: '0.15em', color: '#2a2a2a', textTransform: 'uppercase',
  },

  // Form fields
  field: { marginBottom: '0.9rem' },
  label: {
    display: 'block', fontFamily: "'DM Mono', monospace",
    fontSize: '0.44rem', letterSpacing: '0.18em',
    color: '#4a4a4a', textTransform: 'uppercase', marginBottom: '0.4rem',
  },
  input: {
    width: '100%', padding: '0.65rem 0.85rem',
    background: '#0a0a0a', border: '1px solid #1f1f1f',
    borderRadius: 3, fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.875rem', color: '#f5f0e8', outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputFocus: { borderColor: '#c9a84c', boxShadow: '0 0 0 3px rgba(201,168,76,0.08)' },

  submitBtn: {
    width: '100%', padding: '0.8rem',
    background: '#c9a84c', color: '#0d0d0d',
    border: 'none', borderRadius: 3,
    fontFamily: "'Playfair Display', serif",
    fontSize: '0.95rem', fontWeight: 700,
    cursor: 'pointer', marginTop: '0.4rem',
    transition: 'background 0.15s',
  },

  msg: {
    padding: '0.65rem 0.85rem', borderRadius: 3,
    fontSize: '0.78rem', marginBottom: '1rem', lineHeight: 1.5,
  },
  error: { background: 'rgba(200,80,60,0.1)', border: '1px solid rgba(200,80,60,0.25)', color: '#e08878' },
  success: { background: 'rgba(60,160,80,0.1)', border: '1px solid rgba(60,160,80,0.25)', color: '#70c088' },

  footer: {
    marginTop: '1.5rem', textAlign: 'center',
    fontFamily: "'DM Mono', monospace", fontSize: '0.42rem',
    letterSpacing: '0.12em', color: '#222', textTransform: 'uppercase',
  },
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="#f5f0e8">
      <path d="M12.24 0c.26 1.57-.46 3.14-1.45 4.22-.97 1.07-2.48 1.9-3.96 1.79-.3-1.53.55-3.13 1.47-4.12C9.3.84 10.87.06 12.24 0zM15.5 13.27c-.64 1.4-1.41 2.77-2.54 3.73-1.06.9-2.15 1-3.27 1-1.15 0-2.04-.28-2.88-.55-.88-.28-1.72-.55-2.77-.55-1.1 0-2.07.28-2.94.56-.84.27-1.63.52-2.6.52l-.1-.01C-.47 15.42 1.23 11.69 2.5 9.5 3.38 8 4.6 6.77 6.1 6.77c1.1 0 1.86.3 2.55.58.63.25 1.23.49 2.09.49.83 0 1.36-.23 1.95-.48.69-.29 1.47-.62 2.73-.62 1.34 0 2.69.62 3.58 1.68-2.24 1.13-3.04 4.04-.5 5.85z"/>
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 15.92v1z"/>
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState('signup') // 'signup' | 'login'
  const [method, setMethod] = useState('email') // 'email' | 'phone'
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'error'|'success', text: '' }
  const [hoveredBtn, setHoveredBtn] = useState(null)
  const [focusedInput, setFocusedInput] = useState(null)
  const supabase = createClient()

  // Check if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/app')
    })
    // Handle error param from callback
    if (router.query.error) {
      setMsg({ type: 'error', text: 'Sign in failed. Please try again.' })
    }
  }, [router.query.error])

  function clearMsg() { setMsg(null) }

  // ── EMAIL / PASSWORD ──────────────────────────────────
  async function handleEmailAuth(e) {
    e.preventDefault()
    if (!email) return setMsg({ type: 'error', text: 'Please enter your email address.' })
    setLoading(true); clearMsg()

    if (mode === 'signup') {
      if (!username) { setLoading(false); return setMsg({ type: 'error', text: 'Please choose a username.' }) }
      // Check username availability if a profiles table exists
      try {
        const { data: exists, error: chkErr } = await supabase.from('profiles').select('id').eq('username', username).limit(1)
        if (chkErr && chkErr.code !== '42P01') {
          console.warn('profiles check error', chkErr.message)
        } else if (exists && exists.length) {
          setLoading(false); return setMsg({ type: 'error', text: 'Username is already taken. Please choose another.' })
        }
      } catch (e) {
        console.warn('username availability check failed', e?.message || e)
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: password || undefined,
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` }
      })
      if (error) setMsg({ type: 'error', text: error.message })
      else {
        // If the signUp flow doesn't create a session immediately (magic link), persist pending profile
        try { localStorage.setItem('pending_profile', JSON.stringify({ email, username })) } catch (e) {}
        setMsg({ type: 'success', text: password
          ? 'Account created! Check your email to confirm your address, then sign in.'
          : 'Magic link sent! Check your email and click the link to sign in.' })
        // If data.user is available immediately (some providers), attempt to upsert profile now
        try {
          const user = data?.user
          if (user) {
            await supabase.from('profiles').upsert([{ id: user.id, username, full_name: username }])
            try { localStorage.removeItem('pending_profile') } catch (e) {}
          }
        } catch (e) { console.warn('upsert profile after signup failed', e?.message || e) }
      }
    } else {
      if (password) {
        // Password login
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg({ type: 'error', text: error.message })
        else router.replace('/app')
      } else {
        // Magic link login
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` }
        })
        if (error) setMsg({ type: 'error', text: error.message })
        else setMsg({ type: 'success', text: 'Magic link sent! Check your email and click the link to sign in.' })
      }
    }
    setLoading(false)
  }

  // ── PHONE / OTP ───────────────────────────────────────
  async function handleSendOtp(e) {
    e.preventDefault()
    if (!phone) return setMsg({ type: 'error', text: 'Please enter your phone number.' })
    setLoading(true); clearMsg()
    const cleaned = phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '')
    const { error } = await supabase.auth.signInWithOtp({ phone: cleaned })
    if (error) setMsg({ type: 'error', text: error.message })
    else { setOtpSent(true); setMsg({ type: 'success', text: 'Code sent! Enter the 6-digit code from your text message.' }) }
    setLoading(false)
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    if (!otp) return setMsg({ type: 'error', text: 'Please enter the code from your text message.' })
    setLoading(true); clearMsg()
    const cleaned = phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '')
    const { error } = await supabase.auth.verifyOtp({ phone: cleaned, token: otp, type: 'sms' })
    if (error) setMsg({ type: 'error', text: error.message })
    else router.replace('/app')
    setLoading(false)
  }

  // ── OAUTH ─────────────────────────────────────────────
  async function handleOAuth(provider) {
    setLoading(true); clearMsg()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` }
    })
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false) }
  }

  const inputStyle = (name) => ({
    ...S.input,
    ...(focusedInput === name ? S.inputFocus : {}),
  })

  return (
    <>
      <Head>
        <title>LeadForge PRO — Sign In</title>
      </Head>

      <div style={S.page}>
        {/* LEFT BRANDING PANEL */}
        <div style={S.left}>
          {/* Glow effects */}
          <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)',
            top:-80, left:-80, pointerEvents:'none' }} />
          <div style={{ position:'absolute', width:350, height:350, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)',
            bottom:-60, right:-60, pointerEvents:'none' }} />

          <div style={{ position:'relative', zIndex:1, maxWidth:340 }}>
            <div style={S.logo}>Lead<span style={{color:'#c9a84c'}}>Forge</span> PRO</div>
            <div style={S.tagline}>Real Estate Wholesaling CRM</div>
            <div style={S.divider} />
            {[
              'Find motivated sellers by city, state & ZIP',
              'Track every deal through your wholesale pipeline',
              'Generate scripts, drip sequences & contracts',
              'Daily Command Center with priority rankings',
              'Auto-match leads to your cash buyer network',
            ].map(f => (
              <div key={f} style={S.feature}>
                <div style={S.fDot} />
                <div style={S.fText}>{f}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT AUTH PANEL */}
        <div style={S.right}>
          <div style={S.formWrap}>
            {/* Mode tabs */}
            <div style={S.tabs}>
              {['signup', 'login'].map(m => (
                <button
                  key={m}
                  style={{ ...S.tab, ...(mode === m ? S.tabActive : {}) }}
                  onClick={() => { setMode(m); clearMsg(); setOtpSent(false) }}
                >
                  {m === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              ))}
            </div>

            <div style={S.heading}>{mode === 'signup' ? 'Join LeadForge PRO' : 'Welcome Back'}</div>
            <div style={S.sub}>
              {mode === 'signup'
                ? 'Create your free account to get started.'
                : 'Sign in to access your workspace.'}
            </div>

            {/* Message */}
            {msg && (
              <div style={{ ...S.msg, ...(msg.type === 'error' ? S.error : S.success) }}>
                {msg.text}
              </div>
            )}

            {/* OAuth buttons */}
            <button
              style={{ ...S.oauthBtn, ...(hoveredBtn === 'google' ? S.oauthBtnHover : {}) }}
              onMouseEnter={() => setHoveredBtn('google')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => handleOAuth('google')}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              style={{ ...S.oauthBtn, ...(hoveredBtn === 'apple' ? S.oauthBtnHover : {}) }}
              onMouseEnter={() => setHoveredBtn('apple')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => handleOAuth('apple')}
              disabled={loading}
            >
              <AppleIcon />
              Continue with Apple
            </button>

            {/* OR divider */}
            <div style={S.orRow}>
              <div style={S.orLine} />
              <div style={S.orText}>or</div>
              <div style={S.orLine} />
            </div>

            {/* Method toggle: Email / Phone */}
            <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem' }}>
              {['email','phone'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); clearMsg(); setOtpSent(false) }}
                  style={{
                    flex:1, padding:'0.45rem', border:'1px solid',
                    borderColor: method === m ? '#c9a84c' : '#1a1a1a',
                    borderRadius:3, background: method === m ? 'rgba(201,168,76,0.08)' : '#0a0a0a',
                    fontFamily:"'DM Mono', monospace", fontSize:'0.44rem',
                    letterSpacing:'0.15em', textTransform:'uppercase',
                    color: method === m ? '#c9a84c' : '#3a3a3a', cursor:'pointer',
                  }}
                >
                  {m === 'email' ? '✉ Email' : '📱 Phone'}
                </button>
              ))}
            </div>

            {/* EMAIL FORM */}
            {method === 'email' && (
              <form onSubmit={handleEmailAuth}>
                <div style={S.field}>
                  <label style={S.label}>Email Address</label>
                  <input
                    style={inputStyle('email')}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedInput('email')}
                    onBlur={() => setFocusedInput(null)}
                    autoComplete="email"
                    autoCapitalize="off"
                  />
                </div>
                {mode === 'signup' && (
                  <div style={S.field}>
                    <label style={S.label}>Choose a username</label>
                    <input
                      style={inputStyle('username')}
                      type="text"
                      placeholder="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      onFocus={() => setFocusedInput('username')}
                      onBlur={() => setFocusedInput(null)}
                      autoComplete="username"
                    />
                  </div>
                )}
                <div style={S.field}>
                  <label style={S.label}>
                    Password <span style={{color:'#2a2a2a'}}>(optional — leave blank for magic link)</span>
                  </label>
                  <input
                    style={inputStyle('password')}
                    type="password"
                    placeholder="Leave blank to get a magic link instead"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
                <button
                  type="submit"
                  style={S.submitBtn}
                  disabled={loading}
                >
                  {loading ? 'Please wait…' : mode === 'signup'
                    ? (password ? 'Create Account' : 'Send Magic Link')
                    : (password ? 'Sign In' : 'Send Magic Link')}
                </button>
              </form>
            )}

            {/* PHONE FORM */}
            {method === 'phone' && !otpSent && (
              <form onSubmit={handleSendOtp}>
                <div style={S.field}>
                  <label style={S.label}>Phone Number</label>
                  <div style={{ position:'relative' }}>
                    <input
                      style={{ ...inputStyle('phone'), paddingLeft:'2.5rem' }}
                      type="tel"
                      placeholder="(555) 000-0000"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onFocus={() => setFocusedInput('phone')}
                      onBlur={() => setFocusedInput(null)}
                      autoComplete="tel"
                    />
                    <div style={{ position:'absolute', left:'0.7rem', top:'50%', transform:'translateY(-50%)' }}>
                      <PhoneIcon />
                    </div>
                  </div>
                  <div style={{ fontSize:'0.65rem', color:'#2a2a2a', marginTop:'0.3rem' }}>
                    US numbers assumed. Include country code for international (e.g. +44…)
                  </div>
                </div>
                <button type="submit" style={S.submitBtn} disabled={loading}>
                  {loading ? 'Sending…' : 'Send Verification Code'}
                </button>
              </form>
            )}

            {method === 'phone' && otpSent && (
              <form onSubmit={handleVerifyOtp}>
                <div style={S.field}>
                  <label style={S.label}>6-Digit Code</label>
                  <input
                    style={{ ...inputStyle('otp'), letterSpacing:'0.3em', fontSize:'1.2rem', textAlign:'center' }}
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
                    onFocus={() => setFocusedInput('otp')}
                    onBlur={() => setFocusedInput(null)}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <button type="submit" style={S.submitBtn} disabled={loading}>
                  {loading ? 'Verifying…' : 'Verify & Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtp(''); clearMsg() }}
                  style={{ ...S.submitBtn, background:'transparent', color:'#4a4a4a',
                    border:'1px solid #1a1a1a', marginTop:'0.5rem' }}
                >
                  ← Change Number
                </button>
              </form>
            )}

            <div style={S.footer}>
              LeadForge PRO · Wholesaling CRM
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .auth-left { display: none !important; }
          .auth-right { width: 100% !important; border-left: none !important; }
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        input::placeholder { color: #2a2a2a; }
      `}</style>
    </>
  )
}
