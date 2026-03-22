import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { discoverBuyers } from '../../../lib/buyerResearch'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  const { city, state, zip } = body

  if (!city || !state) return res.status(400).json({ error: 'city and state are required' })

  try {
    const supabase = getServiceClient()

    // Get existing buyer names to avoid duplicates
    const { data: existingBuyers } = await supabase
      .from('buyers')
      .select('name')
      .eq('user_id', auth.user.id)
    const existingNames = (existingBuyers || []).map((b) => b.name)

    // Run discovery across all sources
    const discovered = await discoverBuyers(city, state, zip || '', existingNames)

    // Auto-save to DB
    let saved = 0
    if (discovered.length > 0) {
      const rows = discovered.map((b) => ({
        user_id: auth.user.id,
        name: b.name,
        company: b.company || null,
        buyer_type: b.buyer_type || 'Fix & Flip',
        phone: b.phone || '',
        email: b.email || '',
        price_min: b.price_min || 0,
        price_max: b.price_max || 999999,
        criteria: b.criteria || [],
        locations: b.locations || [city],
        rehab_tolerance: b.rehab_tolerance || 'High',
        financing: b.financing || 'Cash',
        deals_closed: b.deals_closed || 0,
        notes: b.notes || '',
        is_active: true,
      }))

      const { error: upsertError } = await supabase
        .from('buyers')
        .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })

      if (!upsertError) saved = rows.length
    }

    return res.status(200).json({
      buyers: discovered,
      saved,
      count: discovered.length,
      message: discovered.length > 0
        ? `Found ${discovered.length} buyers in ${city}, ${state} — ${saved} added to your list`
        : `No buyers found in ${city}, ${state}. Try a larger city or check your API keys.`,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Buyer discovery failed' })
  }
}
