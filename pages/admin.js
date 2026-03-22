import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [activity, setActivity] = useState([])
  const [summary, setSummary] = useState({ totalUsers: 0, pageViews: 0, signIns: 0 })
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return router.replace('/login')
      // Access is controlled by the server-side-backed profile admin flag.
      supabase.from('profiles').select('is_admin').eq('id', session.user.id).single()
        .then(({ data, error }) => {
          const isAdmin = data && data.is_admin
          if (!isAdmin) {
            router.replace('/app')
            return
          }

          Promise.all([loadProfiles(supabase), loadActivity(supabase)])
        })
        .catch(() => { router.replace('/app') })
    })
  }, [])

  async function loadProfiles(supabase) {
    setLoading(true)
    setMsg(null)

    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      setLoading(false)
      return
    }

    setProfiles(data || [])
    setLoading(false)
  }

  async function loadActivity(supabase) {
    const [
      usersResult,
      pageViewsResult,
      signInsResult,
      activityResult,
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('user_activity').select('*', { count: 'exact', head: true }).eq('event_type', 'page_view'),
      supabase.from('user_activity').select('*', { count: 'exact', head: true }).eq('event_type', 'sign_in'),
      supabase.from('user_activity').select('id, user_id, event_type, path, created_at').order('created_at', { ascending: false }).limit(50),
    ])

    if (activityResult.error) {
      setMsg({ type: 'error', text: activityResult.error.message })
      return
    }

    setSummary({
      totalUsers: usersResult.count || 0,
      pageViews: pageViewsResult.count || 0,
      signIns: signInsResult.count || 0,
    })
    setActivity(activityResult.data || [])
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
    return JSON.stringify(p).toLowerCase().includes(q)
  })

  function getUserLabel(userId) {
    const profile = profiles.find((item) => item.id === userId)
    return profile?.email || profile?.full_name || userId
  }

  return (
    <>
      <Head>
        <title>Admin — LeadForge PRO</title>
      </Head>
      <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
        <h2>Admin — Manage Profiles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Tracked users" value={summary.totalUsers} />
          <SummaryCard label="App page views" value={summary.pageViews} />
          <SummaryCard label="Sign-ins" value={summary.signIns} />
        </div>

        <div style={{ marginBottom: 20, padding: 12, border: '1px solid #ddd', borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>Recent user activity</h3>
          {activity.length === 0 && <div style={{ color: '#666', fontSize: 14 }}>No tracked activity yet. Run migration 004 and sign in to start collecting it.</div>}
          {activity.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {activity.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
                  <div>
                    <strong>{item.event_type}</strong> by {getUserLabel(item.user_id)}
                    {item.path ? <span> on {item.path}</span> : null}
                  </div>
                  <div style={{ color: '#666', whiteSpace: 'nowrap' }}>{new Date(item.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <input placeholder="Search profile row JSON or id" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:8, width:320 }} />
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

function SummaryCard({ label, value }) {
  return (
    <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function ProfileRow({ profile, onSave, onDelete }) {
  const [edit, setEdit] = useState(false)
  const [isAdmin, setIsAdmin] = useState(!!profile.is_admin)
  const rawProfile = JSON.stringify(profile, null, 2)

  return (
    <div style={{ padding:12, border: '1px solid #ddd', borderRadius:6, display:'flex', gap:12, alignItems:'center' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, color:'#666' }}>{profile.id}</div>
        {!edit && <div style={{ fontWeight:600 }}>{profile.is_admin ? 'Admin user' : 'Standard user'}</div>}
        {!edit && <pre style={{ fontSize:12, color:'#444', margin:'8px 0 0', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{rawProfile}</pre>}
        {edit && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)} /> Admin
            </label>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {!edit && <button onClick={()=>setEdit(true)}>Edit</button>}
        {edit && <button onClick={() => { onSave({ id: profile.id, is_admin: isAdmin }); setEdit(false) }}>Save</button>}
        <button onClick={() => onDelete(profile.id)} style={{ color:'crimson' }}>Delete</button>
      </div>
    </div>
  )
}
