import { requireApiUser } from '../../../lib/serverAuth'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await requireApiUser(req)
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const apiKey = process.env.RENTCAST_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'RENTCAST_API_KEY not configured. Comps require RentCast.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { address, city, state, zip, latitude, longitude, radius, bedrooms, bathrooms, sqftRange, maxComps } = body

  try {
    // Strategy 1: Use address for sale comps from RentCast
    const params = new URLSearchParams()
    if (address) params.set('address', address)
    if (!address) {
      if (city) params.set('city', city)
      if (state) params.set('state', state)
      if (zip) params.set('zipCode', zip)
    }
    if (latitude && longitude) {
      params.set('latitude', String(latitude))
      params.set('longitude', String(longitude))
    }
    if (radius) params.set('radius', String(radius))
    if (bedrooms) params.set('bedrooms', String(bedrooms))
    if (bathrooms) params.set('bathrooms', String(bathrooms))
    if (sqftRange) params.set('squareFootage', sqftRange)
    params.set('limit', String(Math.min(maxComps || 10, 25)))
    params.set('status', 'Sold')

    const saleHistoryUrl = `https://api.rentcast.io/v1/sale-listings?${params.toString()}`
    const saleResponse = await fetch(saleHistoryUrl, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })

    let comps = []
    let source = 'rentcast-sales'

    if (saleResponse.ok) {
      const saleData = await saleResponse.json()
      const listings = Array.isArray(saleData) ? saleData : (saleData.listings || [])
      comps = listings.map((item) => ({
        addr: item.formattedAddress || [item.addressLine1, item.city, item.state].filter(Boolean).join(', '),
        price: Number(item.price || item.lastSalePrice || 0),
        sqft: Number(item.squareFootage || 0),
        ppsf: item.squareFootage > 0 ? Math.round(Number(item.price || item.lastSalePrice || 0) / Number(item.squareFootage)) : 0,
        date: item.lastSaleDate || item.listedDate || '',
        daysAgo: item.lastSaleDate ? Math.round((Date.now() - new Date(item.lastSaleDate).getTime()) / 86400000) : null,
        beds: `${item.bedrooms || '?'}/${item.bathrooms || '?'}`,
        propertyType: item.propertyType || 'SFR',
        yearBuilt: item.yearBuilt || null,
        lotSize: item.lotSize || null,
        status: item.status || 'Sold',
      }))
    }

    // Strategy 2: If no sale listings, try property records nearby for assessed values
    if (comps.length === 0) {
      const propParams = new URLSearchParams()
      if (city) propParams.set('city', city)
      if (state) propParams.set('state', state)
      if (zip) propParams.set('zipCode', zip)
      propParams.set('limit', String(Math.min(maxComps || 10, 25)))

      const propUrl = `https://api.rentcast.io/v1/properties?${propParams.toString()}`
      const propResponse = await fetch(propUrl, {
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      })

      if (propResponse.ok) {
        const propData = await propResponse.json()
        const records = Array.isArray(propData) ? propData : []
        source = 'rentcast-assessed'
        comps = records
          .filter((item) => {
            const assessed = Object.values(item.taxAssessments || {})
            return assessed.length > 0
          })
          .map((item) => {
            const assessed = Object.values(item.taxAssessments || {}).sort((a, b) => (b.year || 0) - (a.year || 0))[0]
            const history = Object.values(item.history || {}).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0]
            const price = Number(history?.price || assessed?.value || 0)
            return {
              addr: item.formattedAddress || [item.addressLine1, item.city, item.state].filter(Boolean).join(', '),
              price,
              sqft: Number(item.squareFootage || 0),
              ppsf: item.squareFootage > 0 ? Math.round(price / Number(item.squareFootage)) : 0,
              date: history?.date || assessed?.year ? `${assessed.year}` : '',
              daysAgo: history?.date ? Math.round((Date.now() - new Date(history.date).getTime()) / 86400000) : null,
              beds: `${item.bedrooms || '?'}/${item.bathrooms || '?'}`,
              propertyType: item.propertyType || 'SFR',
              yearBuilt: item.yearBuilt || null,
              lotSize: item.lotSize || null,
              status: 'Assessed',
            }
          })
      }
    }

    // Filter out zero-price comps
    comps = comps.filter((c) => c.price > 0)

    // Calculate stats
    const avgP = comps.length > 0 ? Math.round(comps.reduce((a, c) => a + c.price, 0) / comps.length) : 0
    const spread = comps.length > 0 ? comps.reduce((a, c) => Math.max(a, Math.abs(c.price - avgP)), 0) : 0
    const confScore = comps.length > 0 ? Math.max(40, Math.min(95, Math.round(92 - (spread / (avgP || 1)) * 200 + comps.length * 3))) : 0

    res.status(200).json({
      comps: comps.slice(0, maxComps || 10),
      arvEst: avgP,
      confidence: confScore,
      spread,
      source,
      count: comps.length,
    })
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Comp search failed' })
  }
}
