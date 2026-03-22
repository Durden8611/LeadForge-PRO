import { requireApiUser } from '../../../lib/serverAuth'

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .slice(0, 20)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: String(message?.content || '').slice(0, 12000),
    }))
    .filter((message) => message.content.trim().length > 0)
}

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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured.' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const messages = normalizeMessages(body.messages)

    if (messages.length === 0) {
      res.status(400).json({ error: 'At least one message is required.' })
      return
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.LEADFORGE_AI_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: Math.min(Math.max(Number(body.maxTokens) || 700, 100), 1200),
        system: body.system ? String(body.system).slice(0, 12000) : undefined,
        messages,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || 'AI request failed.' })
      return
    }

    const text = Array.isArray(data?.content)
      ? data.content.map((part) => part?.text || '').join('\n').trim()
      : ''

    res.status(200).json({ text })
  } catch (error) {
    res.status(500).json({ error: error?.message || 'AI request failed.' })
  }
}