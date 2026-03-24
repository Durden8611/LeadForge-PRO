import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

function appLeadToRow(lead, userId) {
  return {
    user_id: userId,
    external_id: lead.id || null,
    name: lead.name || 'Research Candidate',
    lead_type: lead.type || 'Seller',
    distressed: Boolean(lead.distressed),
    score: Number(lead.score) || 50,
    property_address: lead.propertyAddress || null,
    property_street: lead.propertyStreet || null,
    property_city: lead.propertyCity || null,
    property_state: lead.propertyState || null,
    property_zip: lead.propertyZip || null,
    area: lead.area || null,
    phone: lead.phone || null,
    alt_phone: lead.altPhone || null,
    email: lead.email || null,
    contact_pref: lead.contactPref || 'Any',
    contact_count: Number(lead.contactCount) || 0,
    last_contacted: lead.lastContacted ? new Date(lead.lastContacted).toISOString() : null,
    property_type: lead.propData?.propType || lead.property || 'SFR',
    year_built: lead.propData?.yearBuilt || null,
    sqft: lead.propData?.sqft || null,
    bed_bath: lead.propData?.bedBath || null,
    lot_size: lead.propData?.lotSize || null,
    assessed_value: lead.propData?.assessed || null,
    mortgage_estimate: lead.propData?.mortgageEst || null,
    equity_estimate: lead.propData?.equityEst || null,
    arv: Number(lead.arv) || 0,
    repair_cost: Number(lead.repairCost) || 0,
    mao: lead.deal?.mao || 0,
    offer_price: lead.deal?.offer || 0,
    assignment_fee: lead.deal?.fee || 0,
    buyer_equity: lead.deal?.equity || 0,
    stage: lead.stage || 'New Lead',
    distress_types: lead.distressTypes || [],
    motiv_tags: lead.motivTags || [],
    violations: lead.violations || [],
    tax_owed: lead.taxOwed ? Number(String(lead.taxOwed).replace(/[^0-9.]/g, '')) : null,
    tax_years: lead.taxYears || null,
    tax_lien: lead.taxLien === 'Yes' || lead.taxLien === true || null,
    lead_source: lead.leadSource || 'Live Research',
    source_mode: lead.sourceMode || 'live-research',
    source_urls: lead.sourceUrls || [],
    research_confidence: Number(lead.researchConfidence) || 0,
    timeline: lead.timeline || 'Flexible',
    budget: lead.budget || null,
    tags: lead.tags || [],
    notes: lead.notes || '',
    user_notes: lead.userNotes || '',
    marketing_cost: Number(lead.marketingCost) || 0,
    activity_log: lead.activityLog || [],
  }
}

function rowToAppLead(row) {
  const deal = {
    arv: Number(row.arv) || 0,
    rep: Number(row.repair_cost) || 0,
    fee: Number(row.assignment_fee) || 0,
    mao: Number(row.mao) || 0,
    offer: Number(row.offer_price) || 0,
    equity: Number(row.buyer_equity) || 0,
    profit: Number(row.offer_price) || 0,
    roiPct: row.mao > 0 ? Math.round((Number(row.assignment_fee) / Number(row.mao)) * 100) : 0,
  }

  return {
    id: row.external_id || row.id,
    dbId: row.id,
    name: row.name,
    type: row.lead_type,
    distressed: row.distressed,
    score: row.score,
    area: row.area || '',
    propertyAddress: row.property_address || '',
    propertyStreet: row.property_street || '',
    propertyCity: row.property_city || '',
    propertyState: row.property_state || '',
    propertyZip: row.property_zip || '',
    phone: row.phone || '',
    altPhone: row.alt_phone || null,
    email: row.email || '',
    contactPref: row.contact_pref || 'Any',
    contactCount: row.contact_count || 0,
    lastContacted: row.last_contacted || null,
    budget: row.budget || '',
    timeline: row.timeline || 'Flexible',
    tags: row.tags || [],
    notes: row.notes || '',
    property: row.property_type || 'SFR',
    arv: Number(row.arv) || 0,
    repairCost: Number(row.repair_cost) || 0,
    deal,
    stage: row.stage || 'New Lead',
    distressTypes: row.distress_types || [],
    violations: row.violations || [],
    taxOwed: row.tax_owed ? `$${Number(row.tax_owed).toLocaleString()}` : null,
    taxYears: row.tax_years || null,
    taxLien: row.tax_lien,
    userNotes: row.user_notes || '',
    dripDone: [],
    leadSource: row.lead_source || 'Live Research',
    motivTags: row.motiv_tags || [],
    propData: {
      yearBuilt: row.year_built || 1988,
      sqft: row.sqft || 0,
      assessed: Number(row.assessed_value) || 0,
      mortgageEst: Number(row.mortgage_estimate) || 0,
      equityEst: Number(row.equity_estimate) || 0,
      propType: row.property_type || 'SFR',
      lotSize: row.lot_size || '',
      bedBath: row.bed_bath || '3/2',
    },
    activityLog: row.activity_log || [],
    marketingCost: Number(row.marketing_cost) || 0,
    sourceUrls: row.source_urls || [],
    sourceMode: row.source_mode || 'live-research',
    researchConfidence: row.research_confidence || 0,
    leadModelVersion: 'v2-normalized',
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

  // GET - Load all leads for user
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(500)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ leads: (data || []).map(rowToAppLead) })
    return
  }

  // POST - Save one or more leads
  if (req.method === 'POST') {
    const leads = Array.isArray(body.leads) ? body.leads : (body.lead ? [body.lead] : [])
    if (leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' })
      return
    }

    const rows = leads.map((lead) => appLeadToRow(lead, userId))
    const { data, error } = await supabase
      .from('leads')
      .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
      .select()

    if (error) {
      // If upsert fails (missing constraint), try plain insert
      const { data: insertData, error: insertError } = await supabase
        .from('leads')
        .insert(rows)
        .select()
      if (insertError) {
        res.status(500).json({ error: insertError.message })
        return
      }
      res.status(200).json({ saved: (insertData || []).length })
      return
    }
    res.status(200).json({ saved: (data || []).length })
    return
  }

  // PATCH - Update a lead
  if (req.method === 'PATCH') {
    const { id, updates } = body
    if (!id) {
      res.status(400).json({ error: 'Lead id required' })
      return
    }

    const allowedFields = ['stage', 'score', 'user_notes', 'contact_count', 'last_contacted', 'notes', 'activity_log', 'phone', 'email']
    const patch = {}
    for (const key of allowedFields) {
      if (updates && updates[key] !== undefined) patch[key] = updates[key]
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No valid update fields' })
      return
    }

    const { error } = await supabase
      .from('leads')
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

  // DELETE - Remove a lead
  if (req.method === 'DELETE') {
    const { id } = body
    if (!id) {
      res.status(400).json({ error: 'Lead id required' })
      return
    }

    const { error } = await supabase
      .from('leads')
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
