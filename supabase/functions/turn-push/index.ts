import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import webpush from 'npm:web-push@3.6.7'

const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing notification configuration: ${name}`)
  return value
}
const dispatchToken = required('TURN_PUSH_DISPATCH_TOKEN')
const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
webpush.setVapidDetails(required('TURN_PUSH_SUBJECT'), required('TURN_PUSH_PUBLIC_KEY'), required('TURN_PUSH_PRIVATE_KEY'))
const endpointPattern = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)\/[^\s]+$/
const encoder = new TextEncoder()
const expectedToken = await crypto.subtle.digest('SHA-256', encoder.encode(dispatchToken))

async function authorized(value: string | null) {
  if (!value) return false
  const received = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  const expected = new Uint8Array(expectedToken)
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ received[index]
  return difference === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!await authorized(request.headers.get('x-turn-push-token'))) return new Response('Unauthorized', { status: 401 })
  let input: { eventId?: string | null }
  try { input = await request.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  if (!input || typeof input !== 'object' || input.eventId != null && (typeof input.eventId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.eventId))) return new Response('Invalid event ID', { status: 400 })
  let handled = 0
  try {
    for (let index = 0; index < 20; index++) {
      const { data: event, error } = await db.rpc('claim_turn_push', { p_event: input.eventId ?? null })
      if (error) throw new Error(`Could not claim notification job: ${error.message}`)
      if (!event) break
      if (event.skipped) { if (input.eventId) break; continue }
      const payload = JSON.stringify({ kind: event.kind, roomId: event.roomId, roomCode: event.roomCode })
      const results = await Promise.all(event.subscriptions.map(async (subscription: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }) => {
        if (!endpointPattern.test(subscription.endpoint) || /\s/.test(subscription.endpoint)) {
          console.error('Rejected unapproved push destination for subscription', subscription.id)
          return { id: subscription.id, status: 410 }
        }
        try {
          const result = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, {
            TTL: 120, urgency: 'high', timeout: 10000,
            topic: event.eventId.replaceAll('-', '').slice(0, 32),
          })
          return { id: subscription.id, status: result.statusCode }
        } catch (error) {
          const status = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 503
          console.error('Turn push delivery failed', { eventId: event.eventId, subscriptionId: subscription.id, status })
          return { id: subscription.id, status }
        }
      }))
      const { error: finishError } = await db.rpc('finish_turn_push', { p_event: event.eventId, p_results: results })
      if (finishError) throw new Error(`Could not record notification delivery: ${finishError.message}`)
      handled++
      if (input.eventId) break
    }
    return Response.json({ handled })
  } catch (error) {
    console.error('Turn push dispatch failed', error instanceof Error ? error.message : 'Unknown error')
    return Response.json({ error: 'Turn push dispatch failed; queued jobs will retry.' }, { status: 500 })
  }
})
