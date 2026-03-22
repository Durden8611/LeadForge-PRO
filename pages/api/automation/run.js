import { requireApiUser } from '../../../lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { researchLeads } from '../../../lib/leadResearch'
import { discoverBuyers } from '../../../lib/buyerResearch'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

// Convert app lead to DB row
function leadToRow(lead, userId, market) {
  return {
    user_id: userId,
    external_id: lead.id || null,
    name: lead.name || 'Research Candidate',
    lead_type: lead.type || 'Seller',
    distressed: Boolean(lead.distressed),
    score: Number(lead.score) || 50,
    property_address: lead.propertyAddress || '',
    property_street: lead.propertyStreet || '',
    property_city: lead.propertyCity || market.city,
    property_state: lead.propertyState || market.state,
    property_zip: lead.propertyZip || market.zip || '',
    phone: lead.phone || '',
    email: lead.email || '',
    arv: Number(lead.arv) || 0,
    repair_cost: Number(lead.repairCost) || 0,
    mao: Number(lead.deal?.mao) || 0,
    offer_price: Number(lead.deal?.offer) || 0,
    assignment_fee: Number(lead.deal?.fee) || 0,
    stage: 'New Lead',
    distress_types: lead.distressTypes || [],
    motiv_tags: lead.motivTags || [],
    lead_source: 'Auto Research',
    source_mode: 'auto',
    timeline: lead.timeline || 'Flexible',
    notes: lead.notes || '',
    property_type: lead.propData?.propType || 'SFR',
    year_built: lead.propData?.yearBuilt || null,
    sqft: lead.propData?.sqft || null,
    bed_bath: lead.propData?.bedBath || null,
    assessed_value: lead.propData?.assessed || null,
    research_confidence: lead.researchConfidence || 0,
    activity_log: [{ time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), action: 'Auto-researched by LeadForge PRO' }],
  }
}

// Auto-stage stale leads based on rules
async function autoStageLeads(supabase, userId, autoFollowupDays, autoDeadDays) {
  const now = new Date()
  const followupCutoff = new Date(now - autoFollowupDays * 24 * 60 * 60 * 1000).toISOString()
  const deadCutoff = new Date(now - autoDeadDays * 24 * 60 * 60 * 1000).toISOString()

  let staged = 0

  // New leads older than followup threshold with no contact → add to follow-up queue
  // (We don't force-move them; we just update score to keep them visible)
  const { data: stale } = await supabase
    .from('leads')
    .select('id, stage, contact_count, last_contacted, created_at')
    .eq('user_id', userId)
    .in('stage', ['New Lead', 'Contacted'])
    .lt('created_at', followupCutoff)
    .is('last_contacted', null)
    .limit(50)

  for (const lead of stale || []) {
    // Mark as needing follow-up by appending to activity log
    await supabase
      .from('leads')
      .update({
        notes: `[Auto-flagged: no contact in ${autoFollowupDays}+ days]`,
        updated_at: now.toISOString(),
      })
      .eq('id', lead.id)
      .eq('stage', 'New Lead') // Only update if still New Lead
    staged++
  }

  // Leads older than dead threshold with no activity → suggest Dead Lead
  const { data: deadCandidates } = await supabase
    .from('leads')
    .select('id, stage')
    .eq('user_id', userId)
    .not('stage', 'in', '("Closed","Dead Lead","Assigned")')
    .lt('created_at', deadCutoff)
    .is('last_contacted', null)
    .eq('contact_count', 0)
    .limit(20)

  for (const lead of deadCandidates || []) {
    await supabase
      .from('leads')
      .update({ stage: 'Dead Lead', updated_at: now.toISOString() })
      .eq('id', lead.id)
    staged++
  }

  return staged
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const supabase = getServiceClient()
  const userId = auth.user.id

  try {
    // Load markets + automation settings
    const [{ data: markets }, { data: autoConfig }] = await Promise.all([
      supabase.from('user_markets').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('automation_settings').select('*').eq('user_id', userId).single(),
    ])

    if (!markets?.length) {
      return res.status(200).json({ message: 'No active markets configured. Add markets in the Command tab.', newLeads: 0, newBuyers: 0 })
    }

    const settings = autoConfig || { auto_followup_days: 3, auto_dead_days: 21, auto_buyers: true, auto_stage: true }
    let totalNewLeads = 0
    let totalNewBuyers = 0
    const errors = []

    for (const market of markets) {
      try {
        // --- LEAD RESEARCH ---
        const result = await researchLeads({
          city: market.city,
          county: market.county || '',
          state: market.state,
          zip: market.zip || '',
          lt: (market.lead_types || ['Sellers Only'])[0],
          price: market.price_range || 'any price range',
          count: 8,
          df: market.distress_filters || {},
          dc: 4,
          ft: market.fee_target || '$10,000',
        })

        if (result.leads?.length) {
          // Dedup against existing external_ids
          const { data: existing } = await supabase
            .from('leads')
            .select('external_id')
            .eq('user_id', userId)
            .not('external_id', 'is', null)

          const existingIds = new Set((existing || []).map((r) => r.external_id))
          const newLeads = result.leads.filter((l) => l.id && !existingIds.has(l.id))

          if (newLeads.length > 0) {
            const rows = newLeads.map((l) => leadToRow(l, userId, market))
            await supabase.from('leads').insert(rows)
            totalNewLeads += newLeads.length
          }
        }

        // --- BUYER DISCOVERY ---
        if (settings.auto_buyers !== false) {
          const { data: existingBuyers } = await supabase
            .from('buyers')
            .select('name')
            .eq('user_id', userId)
          const existingNames = (existingBuyers || []).map((b) => b.name)

          const discovered = await discoverBuyers(market.city, market.state, market.zip || '', existingNames)

          if (discovered.length > 0) {
            const rows = discovered.map((b) => ({
              user_id: userId,
              name: b.name,
              company: b.company || null,
              buyer_type: b.buyer_type || 'Fix & Flip',
              phone: b.phone || '',
              email: b.email || '',
              price_min: b.price_min || 0,
              price_max: b.price_max || 999999,
              criteria: b.criteria || [],
              locations: b.locations || [market.city],
              rehab_tolerance: b.rehab_tolerance || 'High',
              financing: b.financing || 'Cash',
              deals_closed: b.deals_closed || 0,
              notes: b.notes || '',
              is_active: true,
            }))
            await supabase.from('buyers').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })
            totalNewBuyers += discovered.length
          }
        }

        // Update market's last_researched timestamp
        await supabase
          .from('user_markets')
          .update({ last_researched: new Date().toISOString() })
          .eq('id', market.id)

      } catch (err) {
        errors.push(`${market.city}, ${market.state}: ${err?.message || 'unknown error'}`)
      }
    }

    // --- AUTO-STAGING ---
    let staged = 0
    if (settings.auto_stage !== false) {
      staged = await autoStageLeads(
        supabase,
        userId,
        settings.auto_followup_days || 3,
        settings.auto_dead_days || 21
      )
    }

    // Update last_auto_run
    await supabase
      .from('automation_settings')
      .upsert({ user_id: userId, last_auto_run: new Date().toISOString() }, { onConflict: 'user_id' })

    return res.status(200).json({
      message: `Auto-research complete across ${markets.length} market${markets.length !== 1 ? 's' : ''}: ${totalNewLeads} new leads, ${totalNewBuyers} buyers added.`,
      newLeads: totalNewLeads,
      newBuyers: totalNewBuyers,
      marketsProcessed: markets.length,
      staged,
      errors,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Automation run failed' })
  }
}
