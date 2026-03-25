// lib/skipTraceScrape.js
// Free skip trace — runs when BATCHDATA_API_KEY is not set.
// Sources (all free, no API key):
//   People-finders : TruePeopleSearch, FastPeopleSearch, 411.com, ZabaSearch,
//                    Radaris, USPhoneBook, PeopleFinders, AnyWho
//   County assessors: Miami-Dade FL (public JSON API), Orange Co FL (ArcGIS),
//                     Hillsborough Co FL (ArcGIS), Harris Co TX (ArcGIS)
//   Web search fallback: SerpAPI or Bing (optional keys), targets .gov assessor sites

// ─── shared fetch headers ──────────────────────────────────────────────────────
const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
}
const HJ = { ...H, 'accept': 'application/json, text/plain, */*' }

// ─── helpers ──────────────────────────────────────────────────────────────────
function extractPhones(text) {
  const out = []
  const re = /(?:\+?1[\s.\-]*)?(?:\(([2-9]\d{2})\)|([2-9]\d{2}))[\s.\-]*([2-9]\d{2})[\s.\-]*(\d{4})/g
  let m
  while ((m = re.exec(String(text || ''))) !== null) {
    const d = `${m[1] || m[2]}${m[3]}${m[4]}`
    if (d.length === 10 && !d.startsWith('555') && !d.startsWith('000') && !d.startsWith('911'))
      out.push(`(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`)
  }
  return [...new Set(out)]
}

function extractEmails(text) {
  const raw = String(text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []
  return [...new Set(raw.filter(e => !/(example|test|noreply|no-reply|placeholder|domain|sentry|@email\.)/i.test(e)))]
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toTitleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim()
}

function extractOwnerName(text) {
  const patterns = [
    /(?:owner|current resident|resident|owner name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
    /([A-Z]{2,}(?:\s+[A-Z]{2,})+)\s+(?:is the owner|owns|property owner)/i,
    /owned by[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1] && m[1].trim().length > 4) return toTitleCase(m[1])
  }
  return null
}

function isBlocked(html) {
  if (!html) return true
  const l = html.toLowerCase()
  return l.includes('captcha') || l.includes('robot') || l.includes('access denied') ||
    l.includes('403 forbidden') || l.includes('cloudflare') || l.length < 500
}

async function safeFetch(url, opts = {}, timeout = 4000) {
  try {
    const res = await fetch(url, {
      headers: opts.json ? HJ : H,
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
      ...opts,
    })
    if (!res.ok) return ''
    return opts.json ? await res.json().catch(() => null) : await res.text()
  } catch {
    return opts.json ? null : ''
  }
}

function empty() { return { phones: [], emails: [], ownerName: null } }
function src(phones, emails, name, label) {
  return { phones: phones.slice(0, 4), emails: emails.slice(0, 2), ownerName: name || null, source: label }
}

// ─── slug helpers ─────────────────────────────────────────────────────────────
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function addrSlug(street) {
  // "123 Main St" → "123-main-st"
  return String(street || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-')
}

// ══════════════════════════════════════════════════════════════════════════════
// PEOPLE-FINDER SCRAPERS
// ══════════════════════════════════════════════════════════════════════════════

// 1. TruePeopleSearch ──────────────────────────────────────────────────────────
async function tpsByName(name, city, state) {
  const url = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(name)}&citystatezip=${encodeURIComponent([city, state].filter(Boolean).join(', '))}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'TruePeopleSearch')
}

async function tpsByAddress(street, city, state, zip) {
  const url = `https://www.truepeoplesearch.com/results?streetaddress=${encodeURIComponent(street)}&citystatezip=${encodeURIComponent([city, state, zip].filter(Boolean).join(', '))}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), 'TruePeopleSearch')
}

// 2. FastPeopleSearch ──────────────────────────────────────────────────────────
async function fpsByName(name, city, state) {
  const url = `https://www.fastpeoplesearch.com/name/${slug(name)}_${slug(city + '-' + state)}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'FastPeopleSearch')
}

async function fpsByAddress(street, city, state) {
  const url = `https://www.fastpeoplesearch.com/address/${addrSlug(street)}_${slug(city + '-' + state)}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), 'FastPeopleSearch')
}

// 3. 411.com ───────────────────────────────────────────────────────────────────
// Address format: /address/123-main-st/Tampa/FL/
async function search411ByAddress(street, city, state) {
  const url = `https://www.411.com/address/${addrSlug(street)}/${encodeURIComponent(city || '')}/${encodeURIComponent(state || '')}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), '411.com')
}

async function search411ByName(name, city, state) {
  const parts = name.trim().split(/\s+/)
  const first = encodeURIComponent(parts[0] || '')
  const last = encodeURIComponent(parts.slice(1).join(' ') || '')
  const url = `https://www.411.com/name/${first}+${last}/${encodeURIComponent(city || '')}+${encodeURIComponent(state || '')}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, '411.com')
}

// 4. ZabaSearch ────────────────────────────────────────────────────────────────
// Name format: /people/first+last/state/
async function zabaByName(name, state) {
  const encoded = encodeURIComponent(name.trim().replace(/\s+/g, '+'))
  const url = `https://www.zabasearch.com/people/${encoded}/${encodeURIComponent(state || '')}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'ZabaSearch')
}

// 5. Radaris ───────────────────────────────────────────────────────────────────
// Address format: /address/[number]/[street]/[city]/[state]/
async function radarisByAddress(street, city, state) {
  // split "123 Main St" into number + street name
  const m = street.match(/^(\d+[A-Za-z]?)\s+(.+)$/)
  if (!m) return empty()
  const url = `https://radaris.com/address/${encodeURIComponent(m[1])}/${slug(m[2])}/${slug(city)}/${encodeURIComponent(state || '')}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), 'Radaris')
}

async function radarisByName(name, state) {
  const parts = name.trim().split(/\s+/)
  const url = `https://radaris.com/p/${slug(parts[0])}/${slug(parts.slice(1).join(' '))}/?state=${encodeURIComponent(state || '')}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'Radaris')
}

// 6. USPhoneBook ───────────────────────────────────────────────────────────────
// Address format: /addr/[street]/[city]-[state]/
async function usPhoneBookByAddress(street, city, state) {
  const url = `https://www.usphonebook.com/addr/${addrSlug(street)}/${slug(city)}-${(state || '').toLowerCase()}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), 'USPhoneBook')
}

async function usPhoneBookByName(name, city, state) {
  const parts = name.trim().split(/\s+/)
  const url = `https://www.usphonebook.com/${slug(parts[0])}-${slug(parts.slice(1).join('-'))}/${slug(city)}-${(state || '').toLowerCase()}/`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'USPhoneBook')
}

// 7. PeopleFinders ─────────────────────────────────────────────────────────────
async function peoplefindersByAddress(street, city, state, zip) {
  const q = encodeURIComponent(`${street} ${city} ${state} ${zip}`.trim())
  const url = `https://www.peoplefinders.com/address?addressLine1=${encodeURIComponent(street)}&city=${encodeURIComponent(city || '')}&state=${encodeURIComponent(state || '')}&zip=${encodeURIComponent(zip || '')}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), extractOwnerName(t), 'PeopleFinders')
}

// 8. AnyWho ────────────────────────────────────────────────────────────────────
async function anyWhoByName(name, city, state) {
  const parts = name.trim().split(/\s+/)
  const url = `https://www.anywho.com/people/${encodeURIComponent(parts[0] || '')}/${encodeURIComponent(parts.slice(1).join(' ') || '')}/${encodeURIComponent(city || '')}/${encodeURIComponent(state || '')}`
  const html = await safeFetch(url)
  if (isBlocked(html)) return empty()
  const t = stripHtml(html)
  return src(extractPhones(t), extractEmails(t), null, 'AnyWho')
}

// ══════════════════════════════════════════════════════════════════════════════
// COUNTY ASSESSOR APIs (free, no key, authoritative owner names)
// These are the highest-quality free source — direct from public record.
// ══════════════════════════════════════════════════════════════════════════════

// Miami-Dade County FL — public JSON API
async function miamidade(street, zip) {
  try {
    const url = `https://www.miamidade.gov/Apps/PA/PApublicServiceProxy/PaServicesProxy.ashx?Operation=GetPropertySearchByAddress&clientAppName=PropertySearch&queryText=${encodeURIComponent(street)}&ZipCode=${encodeURIComponent(zip || '')}`
    const data = await safeFetch(url, { json: true })
    if (!data) return empty()
    const records = data.MinimumPropertyInfos || data.PropertyInfo || []
    const first = Array.isArray(records) ? records[0] : records
    if (!first) return empty()
    const owner = [first.OwnerName1, first.OwnerName2].filter(Boolean).map(toTitleCase).join(' / ')
    return src([], [], owner || null, 'Miami-Dade Assessor')
  } catch { return empty() }
}

// Generic ArcGIS REST helper — used for many FL and TX county GIS portals
async function arcgisOwnerQuery(baseUrl, layer, whereClause, ownerField) {
  try {
    const params = new URLSearchParams({
      where: whereClause,
      outFields: ownerField,
      returnGeometry: 'false',
      f: 'json',
    })
    const data = await safeFetch(`${baseUrl}/${layer}/query?${params}`, { json: true })
    if (!data?.features?.length) return empty()
    const attrs = data.features[0].attributes || {}
    const raw = attrs[ownerField] || attrs[ownerField.toUpperCase()] || ''
    return src([], [], raw ? toTitleCase(raw) : null, 'County Assessor')
  } catch { return empty() }
}

// Orange County FL (Orlando area)
async function orangeCountyFL(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://ocpa-arcgis.ocpafl.org/arcgis/rest/services/OCPAPublicServices/MapServer',
    '0',
    `SITUS_ADDR like '${like}%'`,
    'OWNER_NAME'
  )
}

// Hillsborough County FL (Tampa area)
async function hillsboroughFL(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://gis.hcpafl.org/arcgis/rest/services/HCPA_Property_Data/MapServer',
    '0',
    `SITUS_ADDRESS like '${like}%'`,
    'OWNER_NAME'
  )
}

// Harris County TX (Houston area) — HCAD ArcGIS
async function harrisCountyTX(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://gis.hcad.org/arcgis/rest/services/public/MapServer',
    '0',
    `SITE_ADDR_1 like '${like}%'`,
    'OWNER_NAME'
  )
}

// Dallas County TX (Dallas CAD ArcGIS)
async function dallasCountyTX(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://gis.dallascad.org/arcgis/rest/services/Public/PropertySearch/MapServer',
    '0',
    `SITUS_ADDRESS like '${like}%'`,
    'OWNER_NAME'
  )
}

// Pinellas County FL (St. Pete / Clearwater)
async function pinellasFL(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://maps.pcpao.gov/arcgis/rest/services/Public/ParcelData/MapServer',
    '0',
    `PHYSICAL_ADDR like '${like}%'`,
    'OWNER_NAME'
  )
}

// Broward County FL (Fort Lauderdale)
async function browardFL(street) {
  const like = street.toUpperCase().replace(/'/g, "''")
  return arcgisOwnerQuery(
    'https://gis.bcpa.net/arcgis/rest/services/BCPAPublic/MapServer',
    '0',
    `PROPERTY_ADDRESS like '${like}%'`,
    'OWNER_NAME1'
  )
}

// Pick the right county assessor based on city/state
async function countyAssessor(street, city, state, zip) {
  const s = (state || '').toUpperCase()
  const c = (city || '').toLowerCase()

  if (s === 'FL') {
    if (c.includes('miami') || (zip >= '33101' && zip <= '33299')) return miamidade(street, zip)
    if (c.includes('tampa') || c.includes('brandon') || c.includes('riverview')) return hillsboroughFL(street)
    if (c.includes('orlando') || c.includes('kissimmee') || c.includes('winter')) return orangeCountyFL(street)
    if (c.includes('st. pete') || c.includes('saint pete') || c.includes('clearwater') || c.includes('pinellas')) return pinellasFL(street)
    if (c.includes('fort lauderdale') || c.includes('pompano') || c.includes('hollywood') || c.includes('broward')) return browardFL(street)
    // Default FL: try Orange County (largest ArcGIS deployment)
    return orangeCountyFL(street)
  }
  if (s === 'TX') {
    if (c.includes('houston') || c.includes('harris') || c.includes('katy') || c.includes('pasadena')) return harrisCountyTX(street)
    if (c.includes('dallas') || c.includes('irving') || c.includes('garland')) return dallasCountyTX(street)
  }
  return empty()
}

// ══════════════════════════════════════════════════════════════════════════════
// WEB SEARCH FALLBACK (SerpAPI or Bing — optional)
// Targets .gov assessor sites specifically for owner names
// ══════════════════════════════════════════════════════════════════════════════
async function webSearch(queryBase, location) {
  const serpKey = process.env.SERPAPI_API_KEY
  const bingKey = process.env.BING_SEARCH_KEY

  const queries = [
    `${queryBase} ${location} phone`,
    `site:truepeoplesearch.com ${queryBase}`,
    `site:fastpeoplesearch.com ${queryBase}`,
    `${queryBase} ${location} site:.gov property owner`,
    `"${queryBase}" assessor owner name ${location}`,
  ]

  const allPhones = [], allEmails = []

  for (const q of queries) {
    try {
      let snippets = []
      if (serpKey) {
        const r = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${serpKey}&num=5&engine=google`, { signal: AbortSignal.timeout(4000) })
        if (r.ok) snippets = ((await r.json()).organic_results || []).map(x => `${x.title} ${x.snippet}`)
      } else if (bingKey) {
        const r = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=5`, { headers: { 'Ocp-Apim-Subscription-Key': bingKey }, signal: AbortSignal.timeout(4000) })
        if (r.ok) snippets = ((await r.json()).webPages?.value || []).map(x => `${x.name} ${x.snippet}`)
      }
      const combined = snippets.join(' ')
      allPhones.push(...extractPhones(combined))
      allEmails.push(...extractEmails(combined))
      if (allPhones.length >= 2) break
    } catch { continue }
  }

  return src([...new Set(allPhones)], [...new Set(allEmails)], null, 'Web Search')
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Run all free skip trace sources in parallel.
 * Merges and deduplicates results across all sources.
 */
export async function scrapeSkipTrace({ name, street, city, state, zip }) {
  const isPlaceholder = !name || /^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i.test((name || '').trim())
  const useAddress = isPlaceholder && street && street.trim().length > 3
  const searchedBy = useAddress ? 'address' : 'name'
  const loc = [city, state].filter(Boolean).join(', ')

  let results

  if (useAddress) {
    // Address-based: run all sources in parallel
    results = await Promise.all([
      tpsByAddress(street, city, state, zip),
      fpsByAddress(street, city, state),
      search411ByAddress(street, city, state),
      radarisByAddress(street, city, state),
      usPhoneBookByAddress(street, city, state),
      peoplefindersByAddress(street, city, state, zip),
      countyAssessor(street, city, state, zip),
      webSearch(`"${street}" ${loc}`, 'property owner'),
    ])
  } else {
    // Name-based: run all sources in parallel
    results = await Promise.all([
      tpsByName(name, city, state),
      fpsByName(name, city, state),
      search411ByName(name, city, state),
      zabaByName(name, state),
      radarisByName(name, state),
      usPhoneBookByName(name, city, state),
      anyWhoByName(name, city, state),
      webSearch(`"${name}"`, loc),
    ])
  }

  // Merge all results
  const allPhones = [...new Set(results.flatMap(r => r.phones || []))].slice(0, 4)
  const allEmails = [...new Set(results.flatMap(r => r.emails || []))].slice(0, 2)
  const ownerName = results.find(r => r.ownerName)?.ownerName || null
  const found = allPhones.length > 0 || allEmails.length > 0
  const sources = [...new Set(results.filter(r => (r.phones?.length > 0 || r.ownerName)).map(r => r.source).filter(Boolean))]
  const label = useAddress
    ? `${street}, ${[city, state, zip].filter(Boolean).join(', ')}`
    : name

  return {
    phones: allPhones,
    emails: allEmails,
    ownerName,
    found,
    sources,
    searchedBy,
    message: found
      ? `Found ${allPhones.length} number${allPhones.length !== 1 ? 's' : ''} via ${sources.join(', ')}.`
      : `No public contact info found for "${label}".${ownerName ? ` Owner identified as ${ownerName}.` : ''}`,
    tip: !found
      ? useAddress
        ? 'Property may be LLC-owned. Check the county assessor for the registered agent name.'
        : "Use the exact name on the county assessor record. LLCs won't have personal numbers."
      : null,
  }
}
