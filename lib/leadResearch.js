import { createNormalizedLead } from './leadPipeline/model'
import { scoreNormalizedLead } from './leadPipeline/score'
import { finalizeNormalizedLeads, summarizeLeadSources } from './leadPipeline/orchestrate'
import { normalizedLeadToAppLead } from './leadPipeline/mapToAppLead'

const SEARCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
}

const BLOCKED_HOST_PATTERNS = [
  'zhihu.com',
  'microsoft.com',
  'answers.microsoft.com',
  'learn.microsoft.com',
  'support.microsoft.com',
  'github.com',
  'reddit.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'pinterest.com',
  'wikipedia.org',
  'amazon.com',
  'ebay.com',
]

const TRUSTED_HOST_HINTS = [
  '.gov',
  '.us',
  'zillow',
  'realtor',
  'redfin',
  'trulia',
  'homes.com',
  'foreclosure',
  'auction',
  'assessor',
  'appraiser',
  'propertyappraiser',
  'taxcollector',
  'treasurer',
  'clerk',
  'recorder',
  'parcel',
  'gis',
  'mls',
]

const PROPERTY_CONTENT_HINTS = [
  'property',
  'parcel',
  'assessor',
  'appraiser',
  'mailing address',
  'owner occupied',
  'bedroom',
  'bathroom',
  'square feet',
  'sqft',
  'tax',
  'deed',
  'foreclosure',
  'probate',
  'real estate',
  'single family',
  'lot size',
  'year built',
  'public record',
]

const STREET_SUFFIXES = [
  'Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Lane', 'Ln', 'Drive', 'Dr', 'Court', 'Ct', 'Boulevard', 'Blvd',
  'Way', 'Place', 'Pl', 'Trail', 'Trl', 'Circle', 'Cir', 'Parkway', 'Pkwy', 'Terrace', 'Ter', 'Highway', 'Hwy',
]

const DISTRESS_KEYWORDS = {
  'Code Violations': ['code violation', 'code enforcement', 'unsafe structure', 'nuisance property'],
  'Tax Delinquent': ['tax delinquent', 'delinquent tax', 'tax deed', 'tax lien'],
  'Neglected Property': ['vacant property', 'abandoned', 'boarded up', 'overgrown lot'],
  'Pre-Foreclosure': ['notice of default', 'pre-foreclosure', 'lis pendens', 'foreclosure auction'],
  Probate: ['probate', 'estate of', 'letters testamentary', 'estate notice'],
  'Absentee Owner': ['out-of-state owner', 'absentee owner', 'mailing address'],
  'High Equity': ['free and clear', 'no mortgage', 'high equity'],
  'Tired Landlord': ['tenant occupied', 'rental property', 'investment property', 'landlord'],
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2b;/g, '+')
}

function stripHtml(value) {
  return decodeEntities(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)))
}

function includesAny(text, values) {
  const haystack = String(text || '').toLowerCase()
  return (values || []).some((value) => haystack.includes(String(value || '').toLowerCase()))
}

function toHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown-source'
  }
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (normalized.length !== 10 || normalized.startsWith('555')) return null
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
}

function extractPhones(text) {
  const matches = []
  const regex = /(?:\+?1[\s.-]*)?(?:\(([2-9]\d{2})\)|([2-9]\d{2}))[\s.-]*([2-9]\d{2})[\s.-]*(\d{4})/g
  let match
  while ((match = regex.exec(String(text || ''))) !== null) {
    const formatted = normalizePhone(`${match[1] || match[2]}${match[3]}${match[4]}`)
    if (formatted) matches.push(formatted)
  }
  return unique(matches)
}

function extractEmails(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  return unique(matches.map((item) => item.toLowerCase()).filter((item) => !item.endsWith('.png') && !item.endsWith('.jpg')))
}

function extractMoney(text) {
  const values = []
  const regex = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]{4,7})/g
  let match
  while ((match = regex.exec(String(text || ''))) !== null) {
    const amount = Number(String(match[1]).replace(/,/g, ''))
    if (Number.isFinite(amount)) values.push(amount)
  }
  return values.sort((left, right) => right - left)
}

function extractSqft(text) {
  const match = String(text || '').match(/\b([0-9]{3,5})\s*(?:sq\.?\s?ft|square feet|sqft)\b/i)
  return match ? Number(match[1]) : null
}

function extractYearBuilt(text) {
  const match = String(text || '').match(/(?:built|year built)\s*(?:in)?\s*(19\d{2}|20\d{2})/i)
  return match ? Number(match[1]) : null
}

function extractBedBath(text) {
  const match = String(text || '').match(/\b([1-9])\s*(?:bed|br|bedroom)[^0-9]{0,10}([1-9](?:\.5)?)\s*(?:bath|ba|bathroom)/i)
  return match ? `${match[1]}/${match[2]}` : null
}

function midpointForPriceRange(priceRange) {
  const ranges = {
    'any price range': 275000,
    'under $300K': 220000,
    '$300K–$600K': 450000,
    '$600K–$1M': 800000,
    'luxury $1M+': 1350000,
  }
  return ranges[priceRange] || 275000
}

function estimateRepairs(distressTypes) {
  if (!distressTypes || distressTypes.length === 0) return 12000
  const weight = distressTypes.reduce((total, item) => {
    if (item === 'Pre-Foreclosure' || item === 'Code Violations') return total + 14000
    if (item === 'Neglected Property' || item === 'Tax Delinquent') return total + 11000
    return total + 8000
  }, 6000)
  return Math.min(85000, weight)
}

function calcDeal(arv, repairCost, feeTarget) {
  const arvValue = Number(arv) || 0
  const repairValue = Number(repairCost) || 0
  const feeValue = Number(String(feeTarget || '').replace(/[^0-9.]/g, '')) || 10000
  const mao = Math.max(0, Math.round(arvValue * 0.7 - repairValue))
  const offer = Math.max(0, mao - feeValue)
  const equity = Math.max(0, arvValue - repairValue - mao)
  return { arv: arvValue, rep: repairValue, fee: feeValue, mao, offer, equity, profit: offer, roiPct: mao > 0 ? Math.round((feeValue / mao) * 100) : 0 }
}

function latestObjectValue(record) {
  const entries = Object.values(record || {})
  if (entries.length === 0) return null
  return entries.sort((left, right) => Number(right.year || 0) - Number(left.year || 0))[0]
}

function normalizeRentCastPropertyType(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('single')) return 'SFR'
  if (text.includes('duplex')) return 'Duplex'
  if (text.includes('town')) return 'Townhome'
  if (text.includes('condo')) return 'Condo'
  if (text.includes('multi')) return 'Multi-Family'
  return value || 'SFR'
}

function inferRentCastDistress(record, filters) {
  const distressTypes = []
  const ownerOccupied = record.ownerOccupied !== undefined ? record.ownerOccupied : true
  const mailingAddress = record.owner?.mailingAddress?.formattedAddress || ''
  const propertyAddress = record.formattedAddress || ''
  const tax = latestObjectValue(record.propertyTaxes)
  const assessed = latestObjectValue(record.taxAssessments)
  const historyValues = Object.values(record.history || {})
  const lastSale = historyValues.sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))[0]
  const salePrice = Number(lastSale?.price || 0)
  const assessedValue = Number(assessed?.value || 0)
  const absentee = mailingAddress && propertyAddress && mailingAddress.toLowerCase() !== propertyAddress.toLowerCase()

  if ((filters.df?.absenteeOwner && absentee) || absentee) distressTypes.push('Absentee Owner')
  if ((filters.df?.tiredLandlord && !ownerOccupied) || (!ownerOccupied && absentee)) distressTypes.push('Tired Landlord')
  if (filters.df?.delinquentTaxes && Number(tax?.total || 0) > 0) distressTypes.push('Tax Delinquent')
  if (filters.df?.highEquity && salePrice > 0 && assessedValue > salePrice * 1.45) distressTypes.push('High Equity')

  return unique(distressTypes)
}

function buildRentCastNormalizedLead(record, filters) {
  const assessed = latestObjectValue(record.taxAssessments)
  const tax = latestObjectValue(record.propertyTaxes)
  const historyValues = Object.values(record.history || {})
  const lastSale = historyValues.sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))[0]
  const distressTypes = inferRentCastDistress(record, filters)
  const arv = Number(assessed?.value || lastSale?.price || midpointForPriceRange(filters.price))
  const repairCost = estimateRepairs(distressTypes)
  const deal = calcDeal(arv, repairCost, filters.ft)
  const ownerNames = record.owner?.names || []
  const mailing = record.owner?.mailingAddress?.formattedAddress || ''
  const ownerOccupied = record.ownerOccupied !== undefined ? record.ownerOccupied : true
  const tags = []
  if (!ownerOccupied) tags.push('non owner occupied')
  if (mailing) tags.push('mailing address on file')

  return scoreNormalizedLead(createNormalizedLead({
    id: record.id || record.formattedAddress,
    source: {
      type: 'structured-record',
      name: 'rentcast',
      label: 'RentCast Public Records',
      externalId: record.id || record.formattedAddress,
      canonicalUrl: 'https://api.rentcast.io/v1/properties',
      urls: ['https://api.rentcast.io/v1/properties'],
    },
    contact: {
      name: ownerNames[0] || 'Recorded Owner',
      phones: [],
      emails: [],
      preferredChannel: 'Research',
    },
    location: {
      fullAddress: record.formattedAddress || [record.addressLine1, record.city, record.state, record.zipCode].filter(Boolean).join(', '),
      street: record.addressLine1 || record.formattedAddress || 'Property record',
      city: record.city || filters.city || 'Unknown',
      county: record.county || filters.county || '',
      state: record.state || filters.state || 'NA',
      zip: record.zipCode || filters.zip || '',
    },
    property: {
      type: normalizeRentCastPropertyType(record.propertyType),
      yearBuilt: Number(record.yearBuilt || 1988),
      sqft: Number(record.squareFootage || 1650),
      bedBath: `${record.bedrooms || 3}/${record.bathrooms || 2}`,
      lotSize: record.lotSize ? `${Number(record.lotSize).toLocaleString()} sqft` : 'County record',
      ownerOccupied,
      assessedValue: Number(assessed?.value || arv * 0.68),
      mortgageEstimate: Math.round(arv * 0.38),
      equityEstimate: Math.max(0, Math.round(arv - (lastSale?.price || arv * 0.7))),
    },
    motivation: {
      distressed: distressTypes.length > 0,
      distressTypes,
      motivTags: inferMotivTags(distressTypes),
      timeline: distressTypes.length > 0 ? '30–60 days' : 'Flexible',
    },
    commercial: {
      budgetBand: filters.price === 'any price range' ? 'Property record match' : filters.price,
      arv,
      repairCost,
      deal,
    },
    tags: unique(tags),
    notes: [
      'Source: RentCast property record',
      record.owner?.type ? `Owner type: ${record.owner.type}` : null,
      mailing ? `Mailing: ${mailing}` : null,
      tax?.total ? `Latest tax amount: $${Number(tax.total).toLocaleString()}` : null,
      lastSale?.price ? `Last sale: $${Number(lastSale.price).toLocaleString()} on ${String(lastSale.date || '').slice(0, 10)}` : null,
    ].filter(Boolean).join(' | '),
    quality: {
      confidence: 82,
    },
    meta: {
      taxOwed: filters.df?.delinquentTaxes && tax?.total ? Number(tax.total) : null,
      taxYears: tax?.year ? String(tax.year) : null,
    },
  }))
}

function buildAddressRegex(filters) {
  const suffixes = STREET_SUFFIXES.join('|')
  const city = escapeRegExp(filters.city || '')
  const state = escapeRegExp((filters.state || '').toUpperCase())
  const zip = escapeRegExp(filters.zip || '')
  const cityPart = city ? `(?:,?\\s+${city})?` : '(?:,?\\s+[A-Za-z .\'-]+)?'
  const statePart = state ? `(?:,?\\s+${state})?` : '(?:,?\\s+[A-Z]{2})?'
  const zipPart = zip ? `(?:\\s+${zip})?` : '(?:\\s+\\d{5})?'
  return new RegExp(`\\b\\d{1,6}\\s+[A-Za-z0-9.'#-]+(?:\\s+[A-Za-z0-9.'#-]+){0,5}\\s+(?:${suffixes})\\b${cityPart}${statePart}${zipPart}`, 'gi')
}

function hasBlockedHost(host) {
  const normalized = String(host || '').toLowerCase()
  return BLOCKED_HOST_PATTERNS.some((pattern) => normalized === pattern || normalized.endsWith(`.${pattern}`))
}

function isTrustedHost(host) {
  const normalized = String(host || '').toLowerCase()
  return TRUSTED_HOST_HINTS.some((hint) => normalized.includes(hint))
}

function hasLocationMatch(text, filters) {
  const haystack = String(text || '').toLowerCase()
  const city = String(filters.city || '').trim().toLowerCase()
  const county = String(filters.county || '').trim().toLowerCase()
  const zip = String(filters.zip || '').trim()

  if (zip && haystack.includes(zip)) return true
  if (city && haystack.includes(city)) return true
  if (county && (haystack.includes(county) || haystack.includes(`${county} county`))) return true
  return false
}

function hasAddressLocationMatch(address, filters) {
  if (!address) return false
  return hasLocationMatch(address, filters)
}

function getCandidateGate(candidate, filters) {
  const trustedHost = candidate.hosts.some((host) => isTrustedHost(host))
  const hasStrongLocation = hasLocationMatch(candidate.rawText, filters) || hasAddressLocationMatch(candidate.address, filters)
  const hasPropertySignals = includesAny(candidate.rawText, PROPERTY_CONTENT_HINTS)
  const hasContact = candidate.phones.length > 0 || candidate.emails.length > 0
  const hasDistress = candidate.distressTypes.length > 0
  const hasAddress = Boolean(candidate.address)
  const trustedEnough = trustedHost || hasPropertySignals
  const keep = hasStrongLocation && trustedEnough && (
    (hasAddress && (trustedHost || hasContact || hasDistress || hasPropertySignals))
    || (trustedHost && hasPropertySignals)
  )

  return {
    keep,
    trustedHost,
    hasStrongLocation,
    hasPropertySignals,
    hasContact,
    hasDistress,
    hasAddress,
  }
}

function extractAddress(text, filters) {
  const matches = String(text || '').match(buildAddressRegex(filters)) || []
  if (matches.length === 0) return null
  const normalized = unique(matches.map((item) => item.replace(/\s+/g, ' ').trim()))
  const preferred = normalized.find((item) => {
    const itemLower = item.toLowerCase()
    return (!filters.city || itemLower.includes(String(filters.city).toLowerCase())) && (!filters.zip || item.includes(filters.zip))
  })
  return preferred || normalized[0]
}

function splitAddress(address, filters) {
  const parts = String(address || '').split(',').map((item) => item.trim()).filter(Boolean)
  const street = parts[0] || ''
  const city = parts[1] || filters.city || 'Unknown'
  const stateZip = parts[2] || `${filters.state || ''} ${filters.zip || ''}`.trim()
  const stateMatch = stateZip.match(/\b([A-Z]{2})\b/)
  const zipMatch = stateZip.match(/\b(\d{5})\b/)
  return { street, city, state: stateMatch ? stateMatch[1] : (filters.state || 'NA'), zip: zipMatch ? zipMatch[1] : (filters.zip || '') }
}

function inferDistressTypes(text, filters) {
  const haystack = String(text || '').toLowerCase()
  const detected = Object.entries(DISTRESS_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => haystack.includes(keyword)))
    .map(([label]) => label)

  const selected = []
  if (filters.df?.codeViolations) selected.push('Code Violations')
  if (filters.df?.delinquentTaxes) selected.push('Tax Delinquent')
  if (filters.df?.neglected) selected.push('Neglected Property')
  if (filters.df?.preForeclosure) selected.push('Pre-Foreclosure')
  if (filters.df?.probate) selected.push('Probate')
  if (filters.df?.absenteeOwner) selected.push('Absentee Owner')
  if (filters.df?.highEquity) selected.push('High Equity')
  if (filters.df?.tiredLandlord) selected.push('Tired Landlord')
  return unique([...selected, ...detected])
}

function inferMotivTags(distressTypes) {
  const tags = []
  if (distressTypes.includes('Pre-Foreclosure')) tags.push('foreclosure')
  if (distressTypes.includes('Probate')) tags.push('probate')
  if (distressTypes.includes('Tired Landlord')) tags.push('tiredLandlord')
  if (distressTypes.includes('Tax Delinquent')) tags.push('taxDelinquent')
  if (distressTypes.includes('Neglected Property')) tags.push('vacant')
  return unique(tags)
}

function inferTimeline(text) {
  const haystack = String(text || '').toLowerCase()
  if (haystack.includes('auction') || haystack.includes('must sell') || haystack.includes('notice of default')) return 'Immediate (0–30 days)'
  if (haystack.includes('probate') || haystack.includes('estate')) return '30–60 days'
  if (haystack.includes('listing') || haystack.includes('for sale')) return '60–90 days'
  return 'Flexible'
}

function inferPropertyType(text) {
  const haystack = String(text || '').toLowerCase()
  if (haystack.includes('duplex')) return 'Duplex'
  if (haystack.includes('condo')) return 'Condo'
  if (haystack.includes('townhome')) return 'Townhome'
  return 'SFR'
}

function inferName(text) {
  const ownerMatch = String(text || '').match(/(?:owner|estate of|contact|listed by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/)
  if (ownerMatch) return ownerMatch[1].trim()
  const genericMatch = String(text || '').match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/)
  return genericMatch ? genericMatch[1].trim() : 'Research Candidate'
}

function parseBingResults(html, maxResults) {
  const results = []
  const regex = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<div class="b_caption"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>)?/gi
  let match
  while ((match = regex.exec(String(html || ''))) !== null && results.length < maxResults) {
    const url = decodeEntities(match[1])
    if (!url.startsWith('http')) continue
    results.push({ url, title: stripHtml(match[2]), snippet: stripHtml(match[3] || ''), host: toHost(url) })
  }
  return results
}

async function fetchText(url, maxLength = 14000) {
  const response = await fetch(url, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return stripHtml(await response.text()).slice(0, maxLength)
}

async function searchSerpApi(query, maxResults) {
  const params = new URLSearchParams({ engine: 'bing', q: query, api_key: process.env.SERPAPI_API_KEY, num: String(maxResults) })
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('SerpAPI search failed')
  const data = await response.json()
  return (data.organic_results || []).slice(0, maxResults).map((item) => ({ url: item.link, title: item.title, snippet: item.snippet || '', host: toHost(item.link) }))
}

async function searchBing(query, maxResults) {
  const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Bing search failed')
  return parseBingResults(await response.text(), maxResults)
}

async function searchRentCast(filters) {
  const params = new URLSearchParams()
  if (filters.city) params.set('city', filters.city)
  if (filters.state) params.set('state', filters.state)
  if (filters.zip) params.set('zipCode', filters.zip)
  if (filters.county) params.set('county', filters.county)
  params.set('limit', String(Math.min(Math.max(Number(filters.count) || 8, 1), 50)))

  const response = await fetch(`https://api.rentcast.io/v1/properties?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': process.env.RENTCAST_API_KEY,
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`RentCast search failed: ${response.status} ${text.slice(0, 120)}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function searchWeb(query, maxResults) {
  if (process.env.SERPAPI_API_KEY) return searchSerpApi(query, maxResults)
  return searchBing(query, maxResults)
}

function normalizeProviderErrorMessage(error) {
  const message = String(error || '')
  const lowered = message.toLowerCase()

  if (lowered.includes('subscription-inactive') || lowered.includes('billing/subscription-inactive')) {
    return 'Property-record provider unavailable: the RentCast subscription is inactive.'
  }

  if (lowered.includes('401')) {
    return 'Property-record provider unavailable: the RentCast API key is not authorized.'
  }

  if (lowered.includes('429')) {
    return 'Property-record provider unavailable: the RentCast rate limit was reached.'
  }

  if (lowered.includes('rentcast search failed')) {
    return 'Property-record provider unavailable right now.'
  }

  return 'Property-record provider unavailable right now.'
}

function buildQueries(filters) {
  const location = [filters.city, filters.county ? `${filters.county} county` : '', filters.state, filters.zip].filter(Boolean).join(' ')
  const queries = [
    `${location} property owner phone email public records`,
    `${location} assessor parcel owner contact`,
    `${location} real estate public notice motivated seller`,
  ]
  if (filters.df?.codeViolations) queries.push(`${location} code violation property owner`)
  if (filters.df?.delinquentTaxes) queries.push(`${location} delinquent tax list property`)
  if (filters.df?.neglected) queries.push(`${location} vacant property abandoned owner`)
  if (filters.df?.preForeclosure) queries.push(`${location} pre foreclosure owner`)
  if (filters.df?.probate) queries.push(`${location} probate estate property notice`)
  if (filters.df?.absenteeOwner) queries.push(`${location} absentee owner property`)
  if (filters.df?.highEquity) queries.push(`${location} free and clear property owner`)
  if (filters.df?.tiredLandlord) queries.push(`${location} rental property landlord motivated seller`)
  return unique(queries).slice(0, 6)
}

function summarizeCandidate(candidate) {
  const parts = []
  if (candidate.distressTypes.length > 0) parts.push(`Signals: ${candidate.distressTypes.join(', ')}`)
  if (candidate.phones.length > 0) parts.push(`Phone: ${candidate.phones[0]}`)
  if (candidate.emails.length > 0) parts.push(`Email: ${candidate.emails[0]}`)
  parts.push(`Sources: ${candidate.hosts.join(', ')}`)
  if (candidate.snippets.length > 0) parts.push(candidate.snippets[0])
  return parts.join(' | ').slice(0, 420)
}

function mergeCandidates(candidates) {
  const merged = new Map()
  for (const candidate of candidates) {
    const key = candidate.address || candidate.url
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...candidate })
      continue
    }
    existing.sourceUrls = unique([...(existing.sourceUrls || []), ...(candidate.sourceUrls || [])])
    existing.hosts = unique([...(existing.hosts || []), ...(candidate.hosts || [])])
    existing.phones = unique([...(existing.phones || []), ...(candidate.phones || [])])
    existing.emails = unique([...(existing.emails || []), ...(candidate.emails || [])])
    existing.distressTypes = unique([...(existing.distressTypes || []), ...(candidate.distressTypes || [])])
    existing.tags = unique([...(existing.tags || []), ...(candidate.tags || [])])
    existing.snippets = unique([...(existing.snippets || []), ...(candidate.snippets || [])])
    existing.score = Math.max(existing.score || 0, candidate.score || 0)
    existing.rawText = `${existing.rawText || ''} ${candidate.rawText || ''}`.trim()
  }
  return Array.from(merged.values())
}

function scoreCandidate(candidate) {
  let score = 40
  if (candidate.address) score += 15
  if (candidate.phones.length > 0) score += 15
  if (candidate.emails.length > 0) score += 10
  if (candidate.distressTypes.length > 0) score += 15
  if (candidate.hosts.some((host) => isTrustedHost(host))) score += 10
  if (includesAny(candidate.rawText, PROPERTY_CONTENT_HINTS)) score += 5
  if (hasLocationMatch(candidate.rawText, candidate.filters || {})) score += 5
  score += Math.min(15, candidate.hosts.length * 4)
  return Math.min(95, score)
}

function extractCandidate(result, pageText, filters) {
  if (hasBlockedHost(result.host)) return null
  const rawText = [result.title, result.snippet, pageText].filter(Boolean).join(' ')
  const address = extractAddress(rawText, filters)
  const distressTypes = inferDistressTypes(rawText, filters)
  const candidate = {
    url: result.url,
    address,
    name: inferName(rawText),
    phones: extractPhones(rawText),
    emails: extractEmails(rawText),
    distressTypes,
    motivTags: inferMotivTags(distressTypes),
    propertyType: inferPropertyType(rawText),
    sqft: extractSqft(rawText),
    yearBuilt: extractYearBuilt(rawText),
    bedBath: extractBedBath(rawText),
    title: result.title,
    snippets: [result.snippet].filter(Boolean),
    sourceUrls: [result.url],
    hosts: [result.host],
    rawText,
    priceHints: extractMoney(rawText),
    score: 0,
    tags: unique([result.host, ...distressTypes]),
    filters,
  }

  const gate = getCandidateGate(candidate, filters)
  if (!gate.keep) return null

  return candidate
}

async function enrichWithAnthropic(candidate, filters) {
  if (!process.env.ANTHROPIC_API_KEY) return candidate
  const prompt = [
    'You are enriching a public-web real-estate lead candidate for a wholesaling CRM.',
    'Return strict JSON with keys: ownerName, summary, distressTypes, timeline, propertyType, confidence.',
    'Only use facts or strong inferences from the supplied text.',
    `Location filters: ${[filters.city, filters.county, filters.state, filters.zip].filter(Boolean).join(', ') || 'none'}`,
    `Candidate text: ${candidate.rawText.slice(0, 8000)}`,
  ].join('\n\n')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.LEADFORGE_AI_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return candidate
    const data = await response.json()
    const text = (data.content || []).map((item) => item.text || '').join('\n')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return candidate
    const parsed = JSON.parse(jsonMatch[0])
    return {
      ...candidate,
      name: parsed.ownerName || candidate.name,
      distressTypes: unique([...(parsed.distressTypes || []), ...candidate.distressTypes]),
      propertyType: parsed.propertyType || candidate.propertyType,
      aiSummary: parsed.summary || '',
      aiTimeline: parsed.timeline || '',
      confidence: Number(parsed.confidence) || candidate.confidence,
    }
  } catch {
    return candidate
  }
}

function candidateToNormalizedLead(candidate, filters) {
  const address = candidate.address || `${candidate.title || 'Public-web property research'}, ${[filters.city, filters.state, filters.zip].filter(Boolean).join(' ')}`.trim()
  const parts = splitAddress(address, filters)
  const arv = candidate.priceHints[0] || midpointForPriceRange(filters.price)
  const repairCost = estimateRepairs(candidate.distressTypes)
  const deal = calcDeal(arv, repairCost, filters.ft)
  const confidence = Number(candidate.confidence) || scoreCandidate(candidate)

  return scoreNormalizedLead(createNormalizedLead({
    id: candidate.sourceUrls[0] || address,
    source: {
      type: 'public-web',
      name: process.env.SERPAPI_API_KEY ? 'serpapi-web' : 'bing-web',
      label: 'Public Web Research',
      canonicalUrl: candidate.sourceUrls[0],
      urls: candidate.sourceUrls,
    },
    contact: {
      name: candidate.name || 'Research Candidate',
      phones: candidate.phones || [],
      emails: candidate.emails || [],
      preferredChannel: candidate.phones[0] ? (candidate.emails[0] ? 'Any' : 'Phone') : (candidate.emails[0] ? 'Email' : 'Research'),
    },
    location: {
      fullAddress: address,
      street: parts.street || candidate.title || 'Public-web property research',
      city: parts.city || filters.city || 'Unknown',
      county: filters.county || '',
      state: parts.state || filters.state || 'NA',
      zip: parts.zip || filters.zip || '',
    },
    property: {
      type: candidate.propertyType || 'Public record / online listing',
      yearBuilt: candidate.yearBuilt || 1988,
      sqft: candidate.sqft || 1650,
      bedBath: candidate.bedBath || '3/2',
      lotSize: 'Public record research',
      assessedValue: Math.round(arv * 0.68),
      mortgageEstimate: Math.round(arv * 0.38),
      equityEstimate: Math.round(arv * 0.3),
    },
    motivation: {
      distressed: candidate.distressTypes.length > 0,
      distressTypes: unique(candidate.distressTypes),
      motivTags: unique(candidate.motivTags),
      timeline: candidate.aiTimeline || inferTimeline(candidate.rawText),
    },
    commercial: {
      budgetBand: filters.price === 'any price range' ? 'Public-web candidate' : filters.price,
      arv,
      repairCost,
      deal,
    },
    tags: unique(candidate.tags).slice(0, 5),
    notes: candidate.aiSummary || summarizeCandidate(candidate),
    rawSummary: candidate.rawText,
    quality: {
      confidence,
    },
  }))
}

export async function researchLeads(filters) {
  const desiredCount = Math.min(Math.max(Number(filters.count) || 8, 1), 24)
  const directProviderLeads = []
  let providerError = null

  if (process.env.RENTCAST_API_KEY) {
    try {
      const records = await searchRentCast(filters)
      directProviderLeads.push(...records.slice(0, desiredCount).map((record) => buildRentCastNormalizedLead(record, filters)))
    } catch (error) {
      providerError = normalizeProviderErrorMessage(error?.message || error)
    }
  }

  if (directProviderLeads.length >= desiredCount) {
    const finalized = finalizeNormalizedLeads(directProviderLeads, desiredCount)
    return {
      leads: finalized.map((lead, index) => normalizedLeadToAppLead(lead, index, filters)),
      meta: {
        queries: [],
        sourceCount: 0,
        candidateCount: 0,
        provider: process.env.RENTCAST_API_KEY ? 'rentcast' : 'none',
        aiEnriched: Boolean(process.env.ANTHROPIC_API_KEY),
        directProviderCount: finalized.length,
        sourceSummary: summarizeLeadSources(finalized),
      },
    }
  }

  const queries = buildQueries(filters)
  const searchResults = await Promise.allSettled(queries.map((query) => searchWeb(query, 6)))
  const flattened = searchResults.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value)

  const dedupedResults = []
  const seenUrls = new Set()
  for (const result of flattened) {
    if (!result?.url || seenUrls.has(result.url) || hasBlockedHost(result.host)) continue
    seenUrls.add(result.url)
    dedupedResults.push(result)
  }

  const fetched = await Promise.all(dedupedResults.slice(0, 16).map(async (result) => {
    try {
      return { result, pageText: await fetchText(result.url), fetched: true }
    } catch {
      return { result, pageText: '', fetched: false }
    }
  }))
  const candidates = fetched
    .map((entry) => extractCandidate(entry.result, entry.pageText, filters))
    .filter(Boolean)
  const merged = mergeCandidates(candidates)
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
    .filter((candidate) => candidate.score >= (directProviderLeads.length > 0 ? 65 : 58))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, desiredCount - directProviderLeads.length))

  const enriched = []
  for (const candidate of merged) {
    enriched.push(await enrichWithAnthropic(candidate, filters))
  }

  const webLeads = enriched.map((candidate) => candidateToNormalizedLead(candidate, filters))
  const finalized = finalizeNormalizedLeads([...directProviderLeads, ...webLeads], desiredCount)
  const leads = finalized.map((lead, index) => normalizedLeadToAppLead(lead, index, filters))

  return {
    leads,
    meta: {
      queries,
      sourceCount: dedupedResults.length,
      candidateCount: enriched.length,
      provider: process.env.RENTCAST_API_KEY ? `rentcast+${process.env.SERPAPI_API_KEY ? 'serpapi' : 'bing'}` : (process.env.SERPAPI_API_KEY ? 'serpapi' : 'bing'),
      aiEnriched: Boolean(process.env.ANTHROPIC_API_KEY),
      directProviderCount: directProviderLeads.length,
      sourceSummary: summarizeLeadSources(finalized),
      providerError,
      noResultsReason: leads.length === 0
        ? (providerError
          ? `No verified leads found. ${providerError} Public-web fallback also did not find a verified match for this search.`
          : 'No verified leads found from trusted public sources for that search. Try a broader market or fewer filters.')
        : null,
    },
  }
}