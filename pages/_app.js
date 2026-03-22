import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Analytics } from '@vercel/analytics/react'
import { trackUserActivity, normalizeTrackedPath } from '../lib/activityTracker'
import { createClient } from '../lib/supabase'
import '../styles/globals.css'

const SKIPPED_PATHS = new Set(['/auth/callback'])

export default function App({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function logPageView(url) {
      const path = normalizeTrackedPath(url)

      if (!path || SKIPPED_PATHS.has(path)) {
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (cancelled || !session?.user?.id) {
        return
      }

      await trackUserActivity(supabase, {
        userId: session.user.id,
        eventType: 'page_view',
        path,
      })
    }

    logPageView(router.asPath)
    router.events.on('routeChangeComplete', logPageView)

    return () => {
      cancelled = true
      router.events.off('routeChangeComplete', logPageView)
    }
  }, [router])

  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
