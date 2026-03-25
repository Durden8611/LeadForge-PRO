// lib/skipTrace.js
// BatchData skip trace API client.
// Docs: https://batchdata.com/api
// Set BATCHDATA_API_KEY in your environment variables.

const BATCHDATA_URL = 'https://api.batchdata.com/api/v1/property/skip-trace'

function parseAddress(street) {
  // Split "123 Main St" into house number and street name
  const m = String(street || '').trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/)
  if (m) return { house: m[1], street: m[2] }
  return { house: '', street: street || '' }
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return null
  if (ten.startsWith('555') || ten.startsWith('000')) return null
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

function extractFromPerson(person) {
  const phones = []
  const emails = []

  // Phones — handle multiple possible BatchData field shapes
  for (const p of person?.phones || []) {
    const raw = p.number || p.phoneNumber || p.phone || ''
    const formatted = normalizePhone(raw)
    if (formatted) phones.push({ number: formatted, type: p.phoneType || p.type || p.lineType || 'Unknown', connected: p.isConnected ?? p.connected ?? null })
  }

  // Emails — handle multiple possible field shapes
  for (const e of person?.emails || []) {
    const addr = e.email || e.address || e.emailAddress || ''
    if (addr && addr.includes('@') && !/noreply|example|test/i.test(addr)) {
      emails.push(addr)
    }
  }

  return { phones, emails }
}

function bestOwnerName(result) {
  // Try propertyInfo first (deed-based owner name)
  const info = result?.propertyInfo || result?.property || {}
  const fromDeed =
    [info.ownerFirstName, info.ownerLastName].filter(Boolean).join(' ').trim() ||
    info.ownerName || info.owner || ''

  if (fromDeed && fromDeed.length > 2 && !/^(llc|inc|corp|trust|estate)/i.test(fromDeed)) {
    return toTitleCase(fromDeed)
  }

  // Fall back to first person's name
  const persons = result?.persons || []
  const firstName = persons[0]?.names?.[0]
  const name = firstName?.fullName || [firstName?.firstName, firstName?.lastName].filter(Boolean).join(' ') || ''
  return name ? toTitleCase(name) : null
}

function toTitleCase(str) {
  return String(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

/**
 * Run BatchData skip trace for 1–10 leads in a single API call.
 * @param {Array<{name, street, city, state, zip}>} leads
 * @returns {Array<{phones: string[], emails: string[], ownerName: string|null}>}
 */
export async function runBatchDataSkipTrace(leads) {
  const requests = leads.map((lead) => {
    const { house, street } = parseAddress(lead.street || lead.propertyStreet || '')
    return {
      propertyAddress: {
        house,
        street,
        city: lead.city || lead.propertyCity || '',
        state: lead.state || lead.propertyState || '',
        zip: lead.zip || lead.propertyZip || '',
      },
    }
  })

  const res = await fetch(BATCHDATA_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BATCHDATA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BatchData ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json()

  // Response shape: { data: { results: [...] } } or { results: [...] }
  const results = json?.data?.results || json?.results || []

  return results.map((result) => {
    const persons = result?.persons || []
    const allPhones = []
    const allEmails = []

    for (const person of persons) {
      const { phones, emails } = extractFromPerson(person)
      // Prefer mobile/connected numbers first
      const sorted = phones.sort((a, b) => {
        const aScore = (a.connected ? 2 : 0) + (/mobile|cell/i.test(a.type) ? 1 : 0)
        const bScore = (b.connected ? 2 : 0) + (/mobile|cell/i.test(b.type) ? 1 : 0)
        return bScore - aScore
      })
      allPhones.push(...sorted.map((p) => p.number))
      allEmails.push(...emails)
    }

    return {
      phones: [...new Set(allPhones)].slice(0, 3),
      emails: [...new Set(allEmails)].slice(0, 2),
      ownerName: bestOwnerName(result),
    }
  })
}