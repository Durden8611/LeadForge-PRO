function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function baseSourceScore(sourceType) {
  if (sourceType === 'structured-record') return 36
  if (sourceType === 'listing-feed') return 30
  if (sourceType === 'social-signal') return 24
  return 20
}

function calcCompletenessScore(lead) {
  let score = 0
  if (hasValue(lead.location?.street)) score += 8
  if (hasValue(lead.location?.city)) score += 5
  if (hasValue(lead.location?.state)) score += 4
  if (hasValue(lead.location?.zip)) score += 4
  if (hasValue(lead.contact?.name)) score += 5
  if ((lead.contact?.phones || []).length > 0) score += 9
  if ((lead.contact?.emails || []).length > 0) score += 6
  if (hasValue(lead.property?.type)) score += 5
  if (hasValue(lead.property?.sqft)) score += 4
  if (hasValue(lead.property?.bedBath)) score += 4
  if (hasValue(lead.commercial?.arv)) score += 6
  if (hasValue(lead.commercial?.deal?.offer)) score += 6
  if ((lead.source?.urls || []).length > 0) score += 4
  return Math.min(30, score)
}

export function scoreNormalizedLead(lead) {
  const completenessScore = calcCompletenessScore(lead)
  const contactScore = Math.min(12, (lead.contact?.phones || []).length * 6 + (lead.contact?.emails || []).length * 4)
  const distressScore = Math.min(16, (lead.motivation?.distressTypes || []).length * 5 + (lead.motivation?.distressed ? 4 : 0))
  const sourceScore = baseSourceScore(lead.source?.type)
  const confidenceBoost = Math.max(0, Number(lead.quality?.confidence) || 0)
  const pipelineScore = Math.min(99, sourceScore + completenessScore + contactScore + distressScore + Math.round(confidenceBoost * 0.15))

  return {
    ...lead,
    quality: {
      ...lead.quality,
      sourceScore,
      completenessScore,
      pipelineScore,
      confidence: Math.max(Number(lead.quality?.confidence) || 0, pipelineScore),
    },
  }
}
