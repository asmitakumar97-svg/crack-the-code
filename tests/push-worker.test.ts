import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createECDH, randomBytes, webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const webpush = require('web-push') as {
  generateVAPIDKeys(): { publicKey: string; privateKey: string }
  generateRequestDetails(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: unknown): { method: string; endpoint: string; body: Buffer; headers: Record<string, string> }
}
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
function worker() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  runInNewContext(source, { URL, self: {
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener },
    registration: { scope: 'https://example.test/crack-the-code/', showNotification, getNotifications: async () => [{ close }] },
    clients: { matchAll: async () => [], openWindow },
  } })
  async function emit(name: string, extra: object) {
    let result: Promise<void> | undefined
    listeners[name]({ waitUntil: (promise: Promise<void>) => { result = promise }, ...extra })
    await result
  }
  return { emit, showNotification, openWindow, close }
}
const roomId = '12345678-1234-1234-1234-123456789abc'
describe('phone notification service worker', () => {
  it.each(['clues', 'guess'])('shows a minimal %s message and opens the correct base-path room', async kind => {
    const sw = worker()
    await sw.emit('push', { data: { json: () => ({ kind, roomCode: 'ABC123', roomId, guess: 'DO NOT SHOW' }) } })
    const [title, options] = sw.showNotification.mock.calls[0]
    expect(title).toBe('Duo Dash')
    expect(options.body).toBe('Play your turn')
    expect(JSON.stringify(options)).not.toContain('DO NOT SHOW')
    expect(options.icon).toBe('https://example.test/crack-the-code/icon-192.png')
    expect(options.data.url).toBe(`https://example.test/crack-the-code/?room=ABC123&notificationRoom=${roomId}`)
    const close = vi.fn()
    await sw.emit('notificationclick', { notification: { close, data: options.data } })
    expect(close).toHaveBeenCalledOnce()
    expect(sw.openWindow).toHaveBeenCalledWith(options.data.url)
  })
  it('rejects malformed pushes and external click destinations', async () => {
    const sw = worker()
    await expect(sw.emit('push', { data: { json: () => ({ kind: 'unknown', roomCode: 'ABC123', roomId }) } })).rejects.toThrow(/Invalid/)
    await expect(sw.emit('push', { data: { json: () => ({ kind: 'guess', roomCode: '../evil', roomId }) } })).rejects.toThrow(/Invalid/)
    await expect(sw.emit('notificationclick', { notification: { close() {}, data: { url: 'https://evil.example/' } } })).rejects.toThrow(/Invalid/)
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(sw.openWindow).not.toHaveBeenCalled()
  })
})

describe('Web Push encryption and dispatch', () => {
  it('generates an authenticated encrypted Web Push request rather than exposing the payload', () => {
    const keys = webpush.generateVAPIDKeys()
    const client = createECDH('prime256v1')
    const publicKey = client.generateKeys().toString('base64url')
    const payload = JSON.stringify({ kind: 'guess', roomCode: 'ABC123', roomId })
    const request = webpush.generateRequestDetails({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: publicKey, auth: randomBytes(16).toString('base64url') },
    }, payload, {
      TTL: 120, urgency: 'high', vapidDetails: { subject: 'https://example.test/', ...keys },
    })
    expect(request.method).toBe('POST')
    expect(request.headers['Content-Encoding']).toBe('aes128gcm')
    expect(request.headers.Authorization).toContain('vapid')
    expect(request.body.includes(Buffer.from('ABC123'))).toBe(false)
  })
  async function dispatcher(status = 201) {
    const source = await readFile(new URL('../supabase/functions/turn-push/index.ts', import.meta.url), 'utf8')
    const code = ts.transpile(source.replace(/^import .+\n/gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const sendNotification = vi.fn(async (_subscription: unknown, _payload: string, _options: unknown) => {
      if (status !== 201) throw { statusCode: status }
      return { statusCode: status }
    })
    const log = vi.fn()
    let handler: ((request: Request) => Promise<Response>) | undefined
    const db = { rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'claim_turn_push') return { data: { eventId: roomId, roomId, roomCode: 'ABC123', kind: 'clues',
        subscriptions: [{ id: roomId, endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'key', auth: 'auth' } }] }, error: null }
      return { data: null, error: null }
    } }
    await runInNewContext(`(async()=>{${code}})()`, {
      createClient: () => db, webpush: { setVapidDetails() {}, sendNotification },
      crypto: webcrypto, TextEncoder, Request, Response, console: { error: log },
      Deno: { env: { get: (name: string) => name === 'TURN_PUSH_DISPATCH_TOKEN' ? 'private-dispatch-token' : 'configured' },
        serve: (value: (request: Request) => Promise<Response>) => { handler = value } },
    })
    return { handle: (request: Request) => handler!(request), calls, sendNotification, log }
  }
  it('rejects unauthorized calls before reading subscriptions', async () => {
    const server = await dispatcher()
    const response = await server.handle(new Request('https://example.test/', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401)
    expect(server.calls).toHaveLength(0)
    expect(server.sendNotification).not.toHaveBeenCalled()
  })
  it.each([201, 410, 503])('sends private encrypted payloads and records delivery status %s', async status => {
    const server = await dispatcher(status)
    const response = await server.handle(new Request('https://example.test/', {
      method: 'POST', headers: { 'x-turn-push-token': 'private-dispatch-token' }, body: JSON.stringify({ eventId: roomId }),
    }))
    expect(response.status).toBe(200)
    expect(server.sendNotification).toHaveBeenCalledOnce()
    const payload = server.sendNotification.mock.calls[0]
    expect(JSON.stringify(payload)).not.toMatch(/email|secret|guessValue/)
    expect(server.calls.at(-1)).toMatchObject({ name: 'finish_turn_push', args: { p_results: [{ id: roomId, status }] } })
  })
})
