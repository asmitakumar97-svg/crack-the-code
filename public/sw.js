self.addEventListener('push', event => {
  event.waitUntil((async () => {
    if (!event.data) throw new Error('Turn push did not include a payload.')
    const data = event.data.json()
    const base = new URL('./', self.registration.scope)
    if (data.kind !== 'guess' && data.kind !== 'clues') throw new Error('Invalid turn push kind.')
    if (!/^[A-F0-9]{6}$/.test(data.roomCode)) throw new Error('Invalid turn push room.')
    if (typeof data.roomId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.roomId)) throw new Error('Invalid turn push room ID.')
    const target = new URL(base)
    target.searchParams.set('room', data.roomCode)
    target.searchParams.set('notificationRoom', data.roomId)
    await self.registration.showNotification('Crack the Code — your move', {
      body: data.kind === 'clues' ? 'Your opponent has guessed. Open the game to mark the clues.' : 'It’s your turn to guess. Ready to crack the code?',
      icon: new URL('icon-192.png', base).href,
      badge: new URL('icon-192.png', base).href,
      tag: `crack-the-code.${data.roomCode}`,
      data: { url: target.href },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const base = new URL('./', self.registration.scope)
    const target = new URL(event.notification.data?.url ?? base.href, base)
    if (target.origin !== base.origin || target.pathname !== base.pathname) throw new Error('Invalid notification destination.')
    const views = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = views.find(view => view.url === target.href)
    if (existing) { await existing.focus(); return }
    await self.clients.openWindow(target.href)
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_TURN_NOTIFICATIONS') {
    event.waitUntil(self.registration.getNotifications().then(notifications => {
      for (const notification of notifications) notification.close()
    }))
  }
})
