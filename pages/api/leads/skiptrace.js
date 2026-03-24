// pages/api/leads/skiptrace.js
// Free skip trace using public people-finder sites + web search
// No API key required for people-finder fetches.
// Falls back to SerpAPI/Bing if direct fetch is blocked.

import { requireApiUser } from '../../../lib/serverAuth'

const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
}

function extractPhones(text) {
  const results = []
  const regex = /(?:\+?1[\s.\-]*)?(?:\(([2-9]\d{2})\)|([2-9]\d{2}))[\s.\-]*([2-9]\d{2})[\s.\-]*(\d{4})/g
  let match
  while ((match = regex.exec(String(text || ''))) !== null) {
    const digits = `${match[1] || match[2]}${match[3]}${match[4]}`
    if (digits.length === 10 && !digits.startsWith('555') && !digits.startsWith('000')) {
      results.push(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`)
    }
  }
  return [...new Set(results)]
}

function extractEmails(text) {
  const raw = String(text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []
  return [...new Set(
    raw.filter((e) => !/(example|test|noreply|no-reply|placeholder|domain|sentry|email\.com)/i.test(e))
  )]
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function safeFetch(url, timeout = 8000) {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

// ── Source 1: TruePeopleSearch ────────────────────────────────────
async function searchTruePeopleSearch(name, city, state) {
  try {
    const q = encodeURIComponent(name)
    const loc = encodeURIComponent(`${city}, ${state}`.replace(/^,\s*/, ''))
    const url = `https://www.truepeoplesearch.com/results?name=${q}&citystatezip=${loc}`
    const html = await safeFetch(url)
    if (!html || html.includes('captcha') || html.includes('robot')) return { phones: [], emails: [] }
    const text = stripHtml(html)
    return { phones: extractPhones(text).slice(0, 4), emails: extractEmails(text).slice(0, 2), source: 'TruePeopleSearch' }
  } catch {
    return { phones: [], emails: [] }
  }
}

// ── Source 2: FastPeopleSearch ────────────────────────────────────
async function searchFastPeopleSearch(name, city, state) {
  try {
    const namePart = name.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    const locPart = `${city}-${state}`.toLowerCase()
      .replace(/[^a-z0-9\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const url = `https://www.fastpeoplesearch.com/name/${namePart}_${locPart}`
    const html = await safeFetch(url)
    if (!html || html.includes('captcha') || html.includes('robot')) return { phones: [], emails: [] }
    const text = stripHtml(html)
    return { phones: extractPhones(text).slice(0, 4), emails: extractEmails(text).slice(0, 2), source: 'FastPeopleSearch' }
  } catch {
    return { phones: [], emails: [] }
  }
}

// ── Source 3: Web search fallback (SerpAPI or Bing) ───────────────
async function searchWebForContact(name, city, state) {
  const location = [city, state].filter(Boolean).join(', ')
  const queries = [
    `"${name}" ${location} phone`,
    `site:truepeoplesearch.com "${name}" ${state}`,
    `site:fastpeoplesearch.com "${name}" ${state}`,
  ]

  const serpKey = process.env.SERPAPI_API_KEY
  const bingKey = process.env.BING_SEARCH_KEY
  const allPhones = []
  const allEmails = []

  for (const query of queries) {
    try {
      let snippets = []

      if (serpKey) {
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpKey}&num=5&engine=google`
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const data = await res.json()
          snippets = (data.organic_results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`)
        }
      } else if (bingKey) {
        const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`
        const res = await fetch(url, {
          headers: { 'Ocp-Apim-Subscription-Key': bingKey },
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) {
          const data = await res.json()
          snippets = (data.webPages?.value || []).map((r) => `${r.name || ''} ${r.snippet || ''}`)
        }
      }

      const combined = snippets.join(' ')
      allPhones.push(...extractPhones(combined))
      allEmails.push(...extractEmails(combined))

      if (allPhones.length >= 2) break
    } catch {
      continue
    }
  }

  return {
    phones: [...new Set(allPhones)].slice(0, 3),
    emails: [...new Set(allEmails)].slice(0, 2),
    source: 'Web Search',
  }
}

// ── Main handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireApiUser(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  const { name, city, state } = body

  if (!name || name.trim().length < 3) {
    return res.status(400).json({ error: 'A valid owner name is required for skip tracing.' })
  }

  // Reject placeholder names
  if (/^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i.test(name.trim())) {
    return res.status(200).json({
      phones: [],
      emails: [],
      found: false,
      message: `"${name}" is a placeholder — enter the actual owner name from the property record first, then skip trace.`,
      sources: [],
    })
  }

  try {
    // Run all three sources in parallel
    const [tps, fps, web] = await Promise.all([
      searchTruePeopleSearch(name, city || '', state || ''),
      searchFastPeopleSearch(name, city || '', state || ''),
      searchWebForContact(name, city || '', state || ''),
    ])

    // Merge and deduplicate across all sources
    const allPhones = [...new Set([...tps.phones, ...fps.phones, ...web.phones])].slice(0, 3)
    const allEmails = [...new Set([...tps.emails, ...fps.emails, ...web.emails])].slice(0, 2)

    const found = allPhones.length > 0 || allEmails.length > 0
    const sources = [
      tps.phones.length > 0 ? 'TruePeopleSearch' : null,
      fps.phones.length > 0 ? 'FastPeopleSearch' : null,
      web.phones.length > 0 ? 'Web Search' : null,
    ].filter(Boolean)

    return res.status(200).json({
      phones: allPhones,
      emails: allEmails,
      found,
      sources,
      message: found
        ? `Found ${allPhones.length} phone number${allPhones.length !== 1 ? 's' : ''} for ${name} via ${sources.join(', ')}.`
        : `No public contact info found for "${name}" in ${[city, state].filter(Boolean).join(', ') || 'this area'}. The owner may use a private listing or LLC. Try the full legal name from the deed.`,
      tip: !found
        ? 'Tip: Use the exact name shown on the county assessor record. LLCs won\'t have personal phone numbers — search for the registered agent instead.'
        : null,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Skip trace failed' })
  }
}
