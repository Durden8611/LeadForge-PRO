export async function ensureProfile(supabase, user) {
  if (!supabase || !user?.id) {
    return
  }

  try {
    const { error } = await supabase.from('profiles').upsert([{
      id: user.id,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    }], { onConflict: 'id' })
    if (!error) {
      return
    }

    await supabase.from('profiles').upsert([{
      id: user.id,
    }], { onConflict: 'id' })
  } catch {
  }
}