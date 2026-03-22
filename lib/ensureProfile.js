export async function ensureProfile(supabase, user) {
  if (!supabase || !user?.id) {
    return
  }

  try {
    const profile = {
      id: user.id,
      email: user.email || null,
      last_seen_at: new Date().toISOString(),
    }

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name

    if (fullName) {
      profile.full_name = fullName
    }

    const { error } = await supabase.from('profiles').upsert([profile], { onConflict: 'id' })
    if (!error) {
      return
    }

    await supabase.from('profiles').upsert([{
      id: user.id,
      email: user.email || null,
      last_seen_at: profile.last_seen_at,
    }], { onConflict: 'id' })
  } catch {
  }
}