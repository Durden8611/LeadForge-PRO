// lib/buyerResearch.js
// Discovers cash buyers in a target market via web search + RentCast public records

function formatName(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (s.length < 3) return null
  if (/^(recorded owner|owner|unknown|n\/a|none|the|a |an )$/i.test(s)) return null
  if (s !== s.toUpperCase()) return s
  // All-caps → title case
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function isInvestorEntity(name) {
  if (!name) return false
  return /llc|corp|inc\b|investments|properties|realty|holdings|solutions|capital|acquisitions|group|homes|buyers|estates|ventures|partners|real estate|we buy/i.test(name)
}

function extractPhones(text) {
  const results = []
  const regex = /(?:\+?1[\s.-]*)?(?:\(([2-9]\d{2})\)|([2-9]\d{2}))[\s.-]*([2-9]\d{2})[\s.-]*(\d{4})/g
  let match
  while ((match = regex.exec(String(text || ''))) !== null) {
    const digits = `${match[1] || match[2]}${match[3]}${match[4]}`
    if (digits.length === 10 && !digits.startsWith('555')) {
      results.push(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`)
    }
  }
  return [...new Set(results)]
}

function extractEmails(text) {
  const raw = String(text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
  return [...new Set(raw.filter((e) => !/(example|test|placeholder|domain)\./i.test(e)))]
}

function cleanTitle(title) {
  if (!title) return null
  // Remove trailing suffixes like "| We Buy Houses" "- Home"
  return title
    .replace(/[\|\-–—].*$/, '')
    .replace(/\s*(LLC|Inc|Corp|Properties|Investments|Realty|Holdings|Group|Homes|Buyers)\s*$/i, (m) => m.trim())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

async function searchWeb(query, maxResults = 5) {
  const serpKey = process.env.SERPAPI_API_KEY
  const bingKey = process.env.BING_SEARCH_KEY

  if (serpKey) {
    try {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpKey}&num=${maxResults}&engine=google`
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
      if (res.ok) {
        const data = await res.json()
        return (data.organic_results || []).map((r) => ({
          title: r.title || '',
          url: r.link || '',
          snippet: r.snippet || '',
        }))
      }
    } catch {}
  }

  if (bingKey) {
    try {
      const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}`
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': bingKey },
        signal: AbortSignal.timeout(9000),
      })
      if (res.ok) {
        const data = await res.json()
        return (data.webPages?.value || []).map((r) => ({
          title: r.name || '',
          url: r.url || '',
          snippet: r.snippet || '',
        }))
      }
    } catch {}
  }

  return []
}

async function fetchPageText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000)
  } catch {
    return ''
  }
}

async function discoverBuyersFromWeb(city, state, existingNames) {
  const location = `${city} ${state}`
  const queries = [
    `"we buy houses" ${location} cash investor`,
    `cash home buyers ${location} real estate`,
    `real estate investors ${location} buy houses fast`,
    `wholesale buyers ${location} property acquisition`,
    `sell house fast cash ${location} investor`,
  ]

  const seen = new Set(existingNames.map((n) => n.toLowerCase()))
  const buyers = []

  for (const query of queries) {
    if (buyers.length >= 12) break
    const results = await searchWeb(query, 5)
    for (const result of results) {
      if (buyers.length >= 12) break

      const combined = result.title + ' ' + result.snippet
      const pageText = await fetchPageText(result.url)
      const fullText = combined + ' ' + pageText

      const phones = extractPhones(fullText)
      const emails = extractEmails(fullText)

      // Build company name from result title
      let name = cleanTitle(result.title)

      // If generic or empty, try to find company name in page text
      if (!name || /^(home|house|real estate|cash|buy|sell|we buy|about|contact|how)/i.test(name)) {
        const companyMatch = fullText.match(
          /(?:company|contact|by|at)\s+([A-Z][a-zA-Z\s&.]{2,40}(?:LLC|Inc|Corp|Properties|Investments|Homes|Buyers|Group|Realty|Capital|Holdings))/i
        )
        if (companyMatch) name = companyMatch[1].trim()
      }

      if (!name || name.length < 4) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      buyers.push({
        name,
        company: isInvestorEntity(name) ? name : null,
        buyer_type: 'Fix & Flip',
        phone: phones[0] || '',
        email: emails[0] || '',
        price_min: 50000,
        price_max: 600000,
        criteria: ['As-Is', 'Quick Close', 'Cash'],
        locations: [city],
        rehab_tolerance: 'High',
        financing: 'Cash',
        notes: `Auto-discovered via web search in ${location}. Source: ${result.url}`,
        source: 'web-discovery',
        source_url: result.url,
      })
    }
  }

  return buyers
}

async function discoverBuyersFromRentCast(city, state, zip, existingNames) {
  if (!process.env.RENTCAST_API_KEY) return []

  try {
    const params = new URLSearchParams({ city, state, limit: '100' })
    if (zip) params.set('zipCode', zip)

    const res = await fetch(`https://api.rentcast.io/v1/properties?${params}`, {
      headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []

    const data = await res.json()
    const records = Array.isArray(data) ? data : data.properties || []

    const seen = new Set(existingNames.map((n) => n.toLowerCase()))
    const buyers = []

    for (const record of records) {
      if (buyers.length >= 10) break
      const ownerNames = record.owner?.names || []
      const ownerType = record.owner?.type || ''
      const rawName = ownerNames[0]

      if (!rawName) continue
      // Only pick LLC/company owners — they are investors
      if (!isInvestorEntity(rawName) && ownerType !== 'Company') continue

      const name = formatName(rawName)
      if (!name) continue

      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const mailing = record.owner?.mailingAddress?.formattedAddress || ''

      buyers.push({
        name,
        company: name,
        buyer_type: 'Fix & Flip',
        phone: '',
        email: '',
        price_min: 50000,
        price_max: 800000,
        criteria: ['As-Is', 'Cash'],
        locations: [city],
        rehab_tolerance: 'High',
        financing: 'Cash',
        notes: `Found in ${city}, ${state} public property records as LLC/company owner.${mailing ? ` Mailing: ${mailing}` : ''}`,
        source: 'rentcast-records',
      })
    }

    return buyers
  } catch {
    return []
  }
}

async function discoverBuyersFromRecentSales(city, state, zip, existingNames) {
  if (!process.env.RENTCAST_API_KEY) return []

  try {
    const params = new URLSearchParams({ city, state, status: 'Sold', limit: '100' })
    if (zip) params.set('zipCode', zip)

    const res = await fetch(`https://api.rentcast.io/v1/sale-listings?${params}`, {
      headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []

    const data = await res.json()
    const listings = Array.isArray(data) ? data : data.listings || []

    // Buyers who purchased recently and are LLCs/companies = active investors
    const seen = new Set(existingNames.map((n) => n.toLowerCase()))
    const buyerCounts = {}

    for (const listing of listings) {
      const ownerNames = listing.owner?.names || []
      const rawName = ownerNames[0]
      if (!rawName || !isInvestorEntity(rawName)) continue
      const name = formatName(rawName)
      if (!name) continue
      buyerCounts[name] = (buyerCounts[name] || 0) + 1
    }

    // Sort by how many properties they own (more = more active buyer)
    const buyers = []
    const sortedBuyers = Object.entries(buyerCounts).sort((a, b) => b[1] - a[1])

    for (const [name, count] of sortedBuyers) {
      if (buyers.length >= 8) break
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      buyers.push({
        name,
        company: name,
        buyer_type: 'Fix & Flip',
        phone: '',
        email: '',
        price_min: 50000,
        price_max: 800000,
        criteria: ['As-Is', 'Cash', 'Quick Close'],
        locations: [city],
        rehab_tolerance: 'High',
        financing: 'Cash',
        notes: `Active buyer in ${city}, ${state} — found in ${count} recent sales records.`,
        source: 'rentcast-sales',
        deals_closed: count,
      })
    }

    return buyers
  } catch {
    return []
  }
}

export async function discoverBuyers(city, state, zip = '', existingNames = []) {
  const [webBuyers, recordBuyers, salesBuyers] = await Promise.all([
    discoverBuyersFromWeb(city, state, existingNames),
    discoverBuyersFromRentCast(city, state, zip, existingNames),
    discoverBuyersFromRecentSales(city, state, zip, existingNames),
  ])

  // Merge all sources, deduplicate
  const seen = new Set(existingNames.map((n) => n.toLowerCase()))
  const all = []

  // Priority order: recent sales (most verified) → property records → web
  for (const buyer of [...salesBuyers, ...recordBuyers, ...webBuyers]) {
    const key = buyer.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    all.push(buyer)
    if (all.length >= 20) break
  }

  return all
}
