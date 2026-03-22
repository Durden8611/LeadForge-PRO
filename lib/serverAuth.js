function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || typeof header !== 'string') return null

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

export async function requireApiUser(req) {
  const token = getBearerToken(req)
  if (!token) {
    return { status: 401, error: 'Authentication required.' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, error: 'Supabase auth is not configured on the server.' }
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { status: 401, error: 'Your session is invalid or has expired. Please sign in again.' }
    }

    const user = await response.json()
    if (!user?.id) {
      return { status: 401, error: 'Your session is invalid or has expired. Please sign in again.' }
    }

    return { status: 200, user }
  } catch {
    return { status: 503, error: 'Unable to verify your session right now. Please try again.' }
  }
}