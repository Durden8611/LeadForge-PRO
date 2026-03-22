import { dedupeNormalizedLeads } from './dedupe'

export function finalizeNormalizedLeads(leads, desiredCount) {
  return dedupeNormalizedLeads(leads)
    .sort((left, right) => (Number(right.quality?.pipelineScore) || 0) - (Number(left.quality?.pipelineScore) || 0))
    .slice(0, desiredCount)
}

export function summarizeLeadSources(leads) {
  return (leads || []).reduce((summary, lead) => {
    const key = lead.source?.name || 'unknown'
    summary[key] = (summary[key] || 0) + 1
    return summary
  }, {})
}
