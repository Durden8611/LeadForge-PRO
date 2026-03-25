// pages/api/leads/skiptrace.js
// Skip trace a single lead.
// Primary: BatchData API (set BATCHDATA_API_KEY for high-quality results)
// Fallback: TruePeopleSearch / FastPeopleSearch scraping + web search

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
  const { name, street, city, state, zip } = body

  const isPlaceholder = !name || name.trim().length < 3 ||
    /^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i.test(name.trim())
  const hasAddress = street && street.trim().length > 3

  if (isPlaceholder && !hasAddress) {
    return res.status(200).json({
      phones: [], emails: [], found: false,
      message: 'No owner name or property address available to search.',
      sources: [],
    })
  }

  try {
    const result = await runSkipTrace({ name: isPlaceholder ? null : name, street, city, state, zip })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Skip trace failed' })
  }
}

// Shared helper used by both single and batch endpoints
export async function runSkipTrace({ name, street, city, state, zip }) {
  const isPlaceholder = !name || /^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i.test((name || '').trim())
  const useAddress = isPlaceholder && street && street.trim().length > 3

  // BatchData: try first if API key is available
  if (process.env.BATCHDATA_API_KEY) {
    try {
      const batchResult = await runBatchDataSkipTrace([{ name, street, city, state, zip }])
      const r = batchResult[0]
      if (r && (r.phones.length > 0 || r.emails.length > 0 || r.ownerName)) {
        return {
          phones: r.phones,
          emails: r.emails,
          ownerName: r.ownerName || null,
          found: r.phones.length > 0 || r.emails.length > 0,
          sources: ['BatchData'],
          searchedBy: useAddress ? 'address' : 'name',
          message: r.phones.length > 0
            ? `Found ${r.phones.length} number${r.phones.length !== 1 ? 's' : ''} via BatchData.`
            : `BatchData returned owner name only — no phone on file.`,
          tip: null,
        }
      }
    } catch {
      // fall through to scraping
    }
  }

  // Fallback: scraping
  return scrapeSkipTrace({ name: isPlaceholder ? null : name, street, city, state, zip })
}