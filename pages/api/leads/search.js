import { researchLeads } from '../../../lib/leadResearch'
import { requireApiUser } from '../../../lib/serverAuth'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await requireApiUser(req)
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const result = await researchLeads({
      city: body.city || '',
      county: body.county || '',
      state: body.state || '',
      zip: body.zip || '',
      lt: body.lt || 'Sellers Only',
      price: body.price || 'any price range',
      count: body.count || 8,
      df: body.df || {},
      dc: body.dc || 4,
      ft: body.ft || '$10,000',
    })
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Lead research failed' })
  }
}