import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

function rowToAppBuyer(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company || '',
    type: row.buyer_type || 'Fix & Flip',
    phone: row.phone || '',
    email: row.email || '',
    pr: [Number(row.price_min) || 0, Number(row.price_max) || 999999],
    criteria: row.criteria || [],
    locations: row.locations || [],
    rehabTol: row.rehab_tolerance || 'Medium',
    financing: row.financing || 'Cash',
    deals: row.deals_closed || 0,
    notes: row.notes || '',
    isActive: row.is_active !== false,
  }
}

export default async function handler(req, res) {
  const auth = await requireApiUser(req)
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const userId = auth.user.id
  const supabase = getServiceClient()
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

  // GET - List buyers
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('user_id', userId)
      .order('name')

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ buyers: (data || []).map(rowToAppBuyer) })
    return
  }

  // POST - Create buyer
  if (req.method === 'POST') {
    const { name, company, buyer_type, phone, email, price_min, price_max, criteria, locations, rehab_tolerance, financing, notes } = body
    if (!name) {
      res.status(400).json({ error: 'Buyer name is required' })
      return
    }

    const { data, error } = await supabase
      .from('buyers')
      .insert({
        user_id: userId,
        name,
        company: company || null,
        buyer_type: buyer_type || 'Fix & Flip',
        phone: phone || null,
        email: email || null,
        price_min: Number(price_min) || 0,
        price_max: Number(price_max) || 999999,
        criteria: criteria || [],
        locations: locations || [],
        rehab_tolerance: rehab_tolerance || 'Medium',
        financing: financing || 'Cash',
        notes: notes || '',
      })
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ buyer: rowToAppBuyer(data) })
    return
  }

  // PATCH - Update buyer
  if (req.method === 'PATCH') {
    const { id, ...updates } = body
    if (!id) {
      res.status(400).json({ error: 'Buyer id required' })
      return
    }

    const allowedFields = ['name', 'company', 'buyer_type', 'phone', 'email', 'price_min', 'price_max', 'criteria', 'locations', 'rehab_tolerance', 'financing', 'deals_closed', 'notes', 'is_active']
    const patch = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) patch[key] = updates[key]
    }

    const { error } = await supabase
      .from('buyers')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ updated: true })
    return
  }

  // DELETE - Remove buyer
  if (req.method === 'DELETE') {
    const { id } = body
    if (!id) {
      res.status(400).json({ error: 'Buyer id required' })
      return
    }

    const { error } = await supabase
      .from('buyers')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ deleted: true })
    return
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  res.status(405).json({ error: 'Method not allowed' })
}
