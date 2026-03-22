export function normalizeTrackedPath(url) {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return parsed.pathname
  } catch {
    return typeof url === 'string' ? url.split('?')[0] : null
  }
}

export async function trackUserActivity(supabase, { userId, eventType, path = null, metadata = null }) {
  if (!supabase || !userId || !eventType) {
    return
  }

  try {
    await supabase.from('user_activity').insert([{
      user_id: userId,
      event_type: eventType,
      path,
      metadata: metadata || {},
    }])
  } catch {
  }
}