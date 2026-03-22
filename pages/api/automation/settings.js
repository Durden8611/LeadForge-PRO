import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

const DEFAULT_SETTINGS = {
  auto_mode: false,
  frequency_hours: 24,
  auto_buyers: true,
  auto_stage: true,
  auto_followup_days: 3,
  auto_dead_days: 21,
  last_auto_run: null,
}

export default async function handler(req, res) {
  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const supabase = getServiceClient()
  const userId = auth.user.id

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('user_id', userId)
      .single()
    return res.status(200).json({ settings: data || DEFAULT_SETTINGS })
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { data, error } = await supabase
      .from('automation_settings')
      .upsert({ ...body, user_id: userId }, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ settings: data })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
