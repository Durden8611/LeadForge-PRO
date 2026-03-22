function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function firstNonEmpty(...values) {
  return values.find((value) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  })
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
  }))
}

export function normalizedLeadKey(lead) {
  const locationKey = [
    lead?.location?.street,
    lead?.location?.city,
    lead?.location?.state,
    lead?.location?.zip,
  ].filter(Boolean).join('|').toLowerCase()

  return String(firstNonEmpty(
    lead?.source?.externalId,
    lead?.source?.canonicalUrl,
    locationKey,
    lead?.source?.name,
  ) || '').trim()
}

export function createNormalizedLead(input) {
  const location = compactObject({
    fullAddress: input.location?.fullAddress,
    street: input.location?.street,
    city: input.location?.city,
    county: input.location?.county,
    state: input.location?.state,
    zip: input.location?.zip,
  })

  const contact = compactObject({
    name: input.contact?.name,
    phones: unique(input.contact?.phones || []),
    emails: unique(input.contact?.emails || []),
    preferredChannel: input.contact?.preferredChannel,
  })

  const property = compactObject({
    type: input.property?.type,
    yearBuilt: input.property?.yearBuilt,
    sqft: input.property?.sqft,
    bedBath: input.property?.bedBath,
    lotSize: input.property?.lotSize,
    ownerOccupied: input.property?.ownerOccupied,
    assessedValue: input.property?.assessedValue,
    estimatedValue: input.property?.estimatedValue,
    mortgageEstimate: input.property?.mortgageEstimate,
    equityEstimate: input.property?.equityEstimate,
  })

  const motivation = compactObject({
    distressed: Boolean(input.motivation?.distressed),
    distressTypes: unique(input.motivation?.distressTypes || []),
    motivTags: unique(input.motivation?.motivTags || []),
    timeline: input.motivation?.timeline,
  })

  const commercial = compactObject({
    budgetBand: input.commercial?.budgetBand,
    arv: input.commercial?.arv,
    repairCost: input.commercial?.repairCost,
    deal: input.commercial?.deal,
  })

  const sourceUrls = unique(input.source?.urls || [])
  const source = compactObject({
    type: input.source?.type || 'unknown',
    name: input.source?.name || 'unknown',
    label: input.source?.label || input.source?.name || 'Unknown Source',
    externalId: input.source?.externalId,
    canonicalUrl: firstNonEmpty(input.source?.canonicalUrl, sourceUrls[0]),
    urls: sourceUrls,
    fetchedAt: input.source?.fetchedAt || new Date().toISOString(),
  })

  return {
    id: input.id || normalizedLeadKey({ source, location }) || `lead-${Date.now()}`,
    source,
    contact,
    location,
    property,
    motivation,
    commercial,
    tags: unique(input.tags || []),
    notes: input.notes || '',
    rawSummary: input.rawSummary || '',
    quality: {
      sourceScore: Number(input.quality?.sourceScore) || 0,
      pipelineScore: Number(input.quality?.pipelineScore) || 0,
      completenessScore: Number(input.quality?.completenessScore) || 0,
      confidence: Number(input.quality?.confidence) || 0,
    },
    meta: input.meta || {},
  }
}
