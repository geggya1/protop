/* Weekplan Web Push service worker — do not cache the app shell. */
/* iOS PWA: must call showNotification() for every push, or permission may be revoked. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function payloadFromEvent(event) {
  if (!event?.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = payloadFromEvent(event);
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Tell open clients (badge / deep-link) — never skip the OS notification.
    clientsList.forEach((client) => {
      try {
        client.postMessage({ type: 'weekplan-push', payload });
      } catch { /* ignore */ }
    });

    await self.registration.showNotification(payload.title || 'Weekplan', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || payload.notificationId || 'weekplan',
      data: payload,
      renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    if (clientsList.length) {
      const target = clientsList.find((c) => c.focused) || clientsList[0];
      try {
        target.postMessage({ type: 'weekplan-open', payload });
      } catch { /* ignore */ }
      if (target.focus) await target.focus();
      return;
    }
    const chatId = payload.chatId ? encodeURIComponent(String(payload.chatId)) : '';
    const familyId = payload.familyId ? encodeURIComponent(String(payload.familyId)) : '';
    const inviteId = payload.inviteId ? encodeURIComponent(String(payload.inviteId)) : '';
    const friendFlag = payload.friendChat === true
      || payload.friendChat === 'true'
      || payload.friendChat === '1'
      || !!payload.friendUid
      || String(payload.notificationId || '').startsWith('friendChat_');
    let url = '/';
    if (payload.eventType === 'familyInvite' && familyId && inviteId) {
      url = `/family-invite/${familyId}/${inviteId}`;
    } else if (payload.eventType === 'gameInvite' && payload.gameType) {
      const gt = encodeURIComponent(String(payload.gameType));
      const gid = payload.gameId ? encodeURIComponent(String(payload.gameId)) : '';
      const qs = familyId ? `?familyId=${familyId}` : '';
      url = gid ? `/game-invite/${gt}/${gid}${qs}` : `/game-invite/${gt}${qs}`;
    } else if (chatId && friendFlag) {
      url = `/my-friends/chat/${chatId}`;
    } else if (chatId) {
      url = `/chat/${chatId}${familyId ? `?familyId=${familyId}` : ''}`;
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
