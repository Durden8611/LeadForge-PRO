// pages/api/leads/skiptrace-batch.js
// Batch skip trace up to 10 leads in one call.
// Uses BatchData native batch API when key is set, otherwise runs scrapers in parallel.
// Called automatically by the frontend after lead search results load.

import { requireApiUser } from '../../../lib/serverAuth'
import { runBatchDataSkipTrace } from '../../../lib/skipTrace'
import { scrapeSkipTrace } from '../../../lib/skipTraceScrape'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  const { leads } = body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads array required' })
  }

  const batch = leads.slice(0, 10) // cap at 10 per call

  try {
    let results

    if (process.env.BATCHDATA_API_KEY) {
      // BatchData supports native batch — one API call for all leads
      const raw = await runBatchDataSkipTrace(batch)
      results = raw.map((r, i) => ({
        leadId: batch[i].id,
        phones: r.phones,
        emails: r.emails,
        ownerName: r.ownerName || null,
        found: r.phones.length > 0 || r.emails.length > 0,
        source: 'BatchData',
      }))
    } else {
      // No API key — run scrapers in parallel (best-effort, may hit rate limits)
      const scraped = await Promise.all(
        batch.map((lead) => scrapeSkipTrace({
          name: /^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i.test((lead.name || '').trim())
            ? null : lead.name,
          street: lead.propertyStreet || lead.street || '',
          city: lead.propertyCity || lead.city || '',
          state: lead.propertyState || lead.state || '',
          zip: lead.propertyZip || lead.zip || '',
        }).catch(() => ({ phones: [], emails: [], found: false })))
      )
      results = scraped.map((r, i) => ({
        leadId: batch[i].id,
        phones: r.phones,
        emails: r.emails,
        ownerName: r.ownerName || null,
        found: r.found,
        source: r.sources?.[0] || 'Scrape',
      }))
    }

    return res.status(200).json({ results })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Batch skip trace failed' })
  }
}