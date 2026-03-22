import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export default async function handler(req, res) {
  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const supabase = getServiceClient()
  const userId = auth.user.id

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_markets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ markets: data || [] })
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { data, error } = await supabase
      .from('user_markets')
      .insert({ ...body, user_id: userId })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ market: data })
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { id, ...updates } = body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data, error } = await supabase
      .from('user_markets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ market: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase
      .from('user_markets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
