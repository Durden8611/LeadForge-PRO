import { normalizedLeadKey } from './model'

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function pickPreferred(left, right) {
  if (!left) return right
  if (!right) return left
  if (typeof left === 'string' && typeof right === 'string') return right.length > left.length ? right : left
  if (typeof left === 'number' && typeof right === 'number') return Math.max(left, right)
  return right ?? left
}

function mergeLeadPair(current, incoming) {
  return {
    ...current,
    source: {
      ...current.source,
      ...incoming.source,
      urls: unique([...(current.source?.urls || []), ...(incoming.source?.urls || [])]),
      canonicalUrl: pickPreferred(current.source?.canonicalUrl, incoming.source?.canonicalUrl),
      name: pickPreferred(current.source?.name, incoming.source?.name),
      label: pickPreferred(current.source?.label, incoming.source?.label),
      type: pickPreferred(current.source?.type, incoming.source?.type),
      externalId: pickPreferred(current.source?.externalId, incoming.source?.externalId),
    },
    contact: {
      ...current.contact,
      ...incoming.contact,
      name: pickPreferred(current.contact?.name, incoming.contact?.name),
      phones: unique([...(current.contact?.phones || []), ...(incoming.contact?.phones || [])]),
      emails: unique([...(current.contact?.emails || []), ...(incoming.contact?.emails || [])]),
      preferredChannel: pickPreferred(current.contact?.preferredChannel, incoming.contact?.preferredChannel),
    },
    location: {
      ...current.location,
      ...incoming.location,
      fullAddress: pickPreferred(current.location?.fullAddress, incoming.location?.fullAddress),
      street: pickPreferred(current.location?.street, incoming.location?.street),
      city: pickPreferred(current.location?.city, incoming.location?.city),
      county: pickPreferred(current.location?.county, incoming.location?.county),
      state: pickPreferred(current.location?.state, incoming.location?.state),
      zip: pickPreferred(current.location?.zip, incoming.location?.zip),
    },
    property: {
      ...current.property,
      ...incoming.property,
      type: pickPreferred(current.property?.type, incoming.property?.type),
      yearBuilt: pickPreferred(current.property?.yearBuilt, incoming.property?.yearBuilt),
      sqft: pickPreferred(current.property?.sqft, incoming.property?.sqft),
      bedBath: pickPreferred(current.property?.bedBath, incoming.property?.bedBath),
      lotSize: pickPreferred(current.property?.lotSize, incoming.property?.lotSize),
      ownerOccupied: current.property?.ownerOccupied ?? incoming.property?.ownerOccupied,
      assessedValue: pickPreferred(current.property?.assessedValue, incoming.property?.assessedValue),
      estimatedValue: pickPreferred(current.property?.estimatedValue, incoming.property?.estimatedValue),
      mortgageEstimate: pickPreferred(current.property?.mortgageEstimate, incoming.property?.mortgageEstimate),
      equityEstimate: pickPreferred(current.property?.equityEstimate, incoming.property?.equityEstimate),
    },
    motivation: {
      ...current.motivation,
      ...incoming.motivation,
      distressed: Boolean(current.motivation?.distressed || incoming.motivation?.distressed),
      distressTypes: unique([...(current.motivation?.distressTypes || []), ...(incoming.motivation?.distressTypes || [])]),
      motivTags: unique([...(current.motivation?.motivTags || []), ...(incoming.motivation?.motivTags || [])]),
      timeline: pickPreferred(current.motivation?.timeline, incoming.motivation?.timeline),
    },
    commercial: {
      ...current.commercial,
      ...incoming.commercial,
      budgetBand: pickPreferred(current.commercial?.budgetBand, incoming.commercial?.budgetBand),
      arv: pickPreferred(current.commercial?.arv, incoming.commercial?.arv),
      repairCost: pickPreferred(current.commercial?.repairCost, incoming.commercial?.repairCost),
      deal: incoming.commercial?.deal || current.commercial?.deal,
    },
    tags: unique([...(current.tags || []), ...(incoming.tags || [])]),
    notes: pickPreferred(current.notes, incoming.notes),
    rawSummary: pickPreferred(current.rawSummary, incoming.rawSummary),
    quality: {
      sourceScore: Math.max(Number(current.quality?.sourceScore) || 0, Number(incoming.quality?.sourceScore) || 0),
      pipelineScore: Math.max(Number(current.quality?.pipelineScore) || 0, Number(incoming.quality?.pipelineScore) || 0),
      completenessScore: Math.max(Number(current.quality?.completenessScore) || 0, Number(incoming.quality?.completenessScore) || 0),
      confidence: Math.max(Number(current.quality?.confidence) || 0, Number(incoming.quality?.confidence) || 0),
    },
    meta: {
      ...current.meta,
      ...incoming.meta,
      mergedSources: unique([...(current.meta?.mergedSources || [current.source?.name]), ...(incoming.meta?.mergedSources || [incoming.source?.name])]),
    },
  }
}

export function dedupeNormalizedLeads(leads) {
  const merged = new Map()

  for (const lead of leads || []) {
    const key = normalizedLeadKey(lead)
    if (!key) continue
    if (!merged.has(key)) {
      merged.set(key, lead)
      continue
    }
    merged.set(key, mergeLeadPair(merged.get(key), lead))
  }

  return [...merged.values()]
}
