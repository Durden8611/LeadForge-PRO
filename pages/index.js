import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

export default function Index() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/app' : '/login')
    })
  }, [])
  return null
}
