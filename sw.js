/* Role Rover Service Worker - Web Push & PWA Notification Handler */

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
    let data = {
        title: 'Role Rover',
        body: 'You have a new update waiting in Role Rover.',
        url: '/dashboard.html',
        tag: 'rolerover-alert'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = Object.assign(data, parsed || {});
        } catch (e) {
            try {
                data.body = event.data.text();
            } catch (_) {}
        }
    }

    const options = {
        body: data.body,
        icon: '/assets/pwa-icon-192.png',
        badge: '/assets/pwa-icon-192.png',
        tag: data.tag || 'rolerover-alert',
        renotify: true,
        data: {
            url: data.url || '/dashboard.html'
        }
    };

    const tasks = [self.registration.showNotification(data.title, options)];
    if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
        const badgeCount = typeof data.badge === 'number' ? data.badge : 1;
        tasks.push(self.navigator.setAppBadge(badgeCount).catch(function () {}));
    }

    event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard.html';

    const tasks = [];
    if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
        tasks.push(self.navigator.clearAppBadge().catch(function () {}));
    }

    const openOrFocus = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if (client.url && client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
                return client.focus().then(function (focused) {
                    if (focused && 'navigate' in focused) {
                        return focused.navigate(targetUrl).catch(function () {});
                    }
                    return focused;
                });
            }
        }
        if (self.clients.openWindow) {
            return self.clients.openWindow(targetUrl);
        }
    });

    tasks.push(openOrFocus);
    event.waitUntil(Promise.all(tasks));
});
