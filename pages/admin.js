import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return router.replace('/login')
      setUser(session.user)
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(s=>s.trim()).filter(Boolean)
      const isEnvAdmin = adminEmails.includes(session.user.email)
      // Fetch profile to see is_admin flag
      supabase.from('profiles').select('is_admin').eq('id', session.user.id).single()
        .then(({ data, error }) => {
          const isAdmin = isEnvAdmin || (data && data.is_admin)
          if (!isAdmin) {
            router.replace('/app')
            return
          }
          // load profiles
          loadProfiles(supabase)
        })
        .catch(() => { if (isEnvAdmin) loadProfiles(supabase); else router.replace('/app') })
    })
  }, [])

  function loadProfiles(supabase) {
    setLoading(true); setMsg(null)
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (error) return setMsg({ type: 'error', text: error.message })
        setProfiles(data || [])
      })
      .finally(() => setLoading(false))
  }

  async function handleSave(p) {
    const supabase = createClient()
    setMsg(null)
    const { error } = await supabase.from('profiles').upsert([p])
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: 'Saved' })
    // refresh
    loadProfiles(supabase)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this profile row? This will not remove the auth user.')) return
    const supabase = createClient()
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: 'Deleted' })
    loadProfiles(supabase)
  }

  const rows = profiles.filter(p => {
    if (!query) return true
    const q = query.toLowerCase()
    return (p.username || '').toLowerCase().includes(q) || (p.full_name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q)
  })

  return (
    <>
      <Head>
        <title>Admin — LeadForge PRO</title>
      </Head>
      <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
        <h2>Admin — Manage Profiles</h2>
        <div style={{ marginBottom: 12 }}>
          <input placeholder="Search username, id or name" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:8, width:320 }} />
          <button onClick={() => { setQuery('') }} style={{ marginLeft:8 }}>Clear</button>
        </div>
        {msg && <div style={{ marginBottom: 12, color: msg.type === 'error' ? 'crimson' : 'green' }}>{msg.text}</div>}
        {loading && <div>Loading…</div>}
        {!loading && rows.length === 0 && <div>No profiles found.</div>}
        {!loading && rows.length > 0 && (
          <div style={{ display:'grid', gap:8 }}>
            {rows.map(p => (
              <ProfileRow key={p.id} profile={p} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ProfileRow({ profile, onSave, onDelete }) {
  const [edit, setEdit] = useState(false)
  const [username, setUsername] = useState(profile.username || '')
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [isAdmin, setIsAdmin] = useState(!!profile.is_admin)

  return (
    <div style={{ padding:12, border: '1px solid #ddd', borderRadius:6, display:'flex', gap:12, alignItems:'center' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, color:'#666' }}>{profile.id}</div>
        {!edit && <div style={{ fontWeight:600 }}>{username || '(no username)'}</div>}
        {!edit && <div style={{ fontSize:13, color:'#444' }}>{fullName || ''}</div>}
        {edit && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="username" />
            <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Full name" />
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)} /> Admin
            </label>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {!edit && <button onClick={()=>setEdit(true)}>Edit</button>}
        {edit && <button onClick={() => { onSave({ id: profile.id, username: username || null, full_name: fullName || null, is_admin: isAdmin || null }); setEdit(false) }}>Save</button>}
        <button onClick={() => onDelete(profile.id)} style={{ color:'crimson' }}>Delete</button>
      </div>
    </div>
  )
}
