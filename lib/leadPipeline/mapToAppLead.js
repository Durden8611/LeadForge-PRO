function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function formatActivityDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatActivityTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function normalizedLeadToAppLead(lead, index, filters) {
  const phones = lead.contact?.phones || []
  const emails = lead.contact?.emails || []
  const distressTypes = lead.motivation?.distressTypes || []
  const propertyType = lead.property?.type || 'SFR'
  const propertyAddress = lead.location?.fullAddress || [lead.location?.street, lead.location?.city, lead.location?.state, lead.location?.zip].filter(Boolean).join(', ')
  const researchConfidence = Number(lead.quality?.pipelineScore) || Number(lead.quality?.confidence) || 0

  return {
    id: `${lead.source?.type === 'structured-record' ? 'R' : 'W'}${Date.now()}-${index}`,
    name: lead.contact?.name || 'Research Candidate',
    type: distressTypes.length > 0 ? 'Distressed Seller' : (filters.lt === 'Buyers Only' ? 'Buyer' : 'Seller'),
    distressed: Boolean(lead.motivation?.distressed || distressTypes.length > 0),
    score: researchConfidence,
    area: [lead.location?.city || filters.city, lead.location?.county || (filters.county ? `${filters.county} County` : null)].filter(Boolean).join(' - '),
    propertyAddress,
    propertyStreet: lead.location?.street || propertyAddress || 'Property research',
    propertyCity: lead.location?.city || filters.city || 'Unknown',
    propertyState: lead.location?.state || filters.state || 'NA',
    propertyZip: lead.location?.zip || filters.zip || '',
    phone: phones[0] || '',
    altPhone: phones[1] || null,
    email: emails[0] || '',
    contactPref: lead.contact?.preferredChannel || (phones[0] ? (emails[0] ? 'Any' : 'Phone') : (emails[0] ? 'Email' : 'Research')),
    budget: lead.commercial?.budgetBand || (filters.price === 'any price range' ? 'Live research match' : filters.price),
    timeline: lead.motivation?.timeline || 'Flexible',
    tags: unique(lead.tags).slice(0, 5),
    notes: lead.notes,
    property: propertyType,
    arv: Number(lead.commercial?.arv) || 0,
    repairCost: Number(lead.commercial?.repairCost) || 0,
    deal: lead.commercial?.deal || { arv: 0, rep: 0, fee: 0, mao: 0, offer: 0, equity: 0, profit: 0, roiPct: 0 },
    stage: 'New Lead',
    distressTypes,
    violations: [],
    taxOwed: lead.meta?.taxOwed ? `$${Number(lead.meta.taxOwed).toLocaleString()}` : null,
    taxYears: lead.meta?.taxYears ? String(lead.meta.taxYears) : null,
    taxLien: null,
    userNotes: '',
    lastContacted: null,
    contactCount: 0,
    dripDone: [],
    leadSource: lead.source?.label || lead.source?.name || 'Live Research',
    motivTags: unique(lead.motivation?.motivTags || []),
    propData: {
      yearBuilt: Number(lead.property?.yearBuilt) || 1988,
      sqft: Number(lead.property?.sqft) || 1650,
      assessed: Number(lead.property?.assessedValue) || Math.round((Number(lead.commercial?.arv) || 0) * 0.68),
      mortgageEst: Number(lead.property?.mortgageEstimate) || Math.round((Number(lead.commercial?.arv) || 0) * 0.38),
      equityEst: Number(lead.property?.equityEstimate) || Math.round((Number(lead.commercial?.arv) || 0) * 0.3),
      propType: propertyType,
      lotSize: lead.property?.lotSize || 'Public record research',
      bedBath: lead.property?.bedBath || '3/2',
    },
    activityLog: [{ time: formatActivityTime(), date: formatActivityDate(), action: `Lead assembled from ${lead.source?.label || lead.source?.name || 'live research'}` }],
    marketingCost: 0,
    sourceUrls: lead.source?.urls || [],
    sourceMode: lead.source?.type || 'live-research',
    researchConfidence,
    leadModelVersion: 'v2-normalized',
  }
}