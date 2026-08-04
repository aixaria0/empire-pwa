/* Empire PWA Service Worker — cache + sync + push */
const CACHE = "empire-pwa-v8";
const ASSETS = ["./", "./index.html", "./chat.html", "./manifest.json", "./icon.svg", "./sw.js", "./push-manager.js"];
const DB_NAME = "empire-sync-db";
const STORE = "outbox";
const SYNC_TAG = "empire-outbox-sync";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deletePending(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function notifyClients(message) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of list) client.postMessage(message);
}

async function processOutbox() {
  const items = await getAllPending();
  for (const item of items) {
    try {
      await new Promise((r) => setTimeout(r, 200));
      await deletePending(item.id);
      await notifyClients({ type: "SYNC_ITEM_DONE", id: item.id, payload: item });
    } catch (err) {
      console.error("[SW] outbox failed", err);
      throw err;
    }
  }
  await notifyClients({ type: "SYNC_COMPLETE", remaining: 0 });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(processOutbox());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;
  if (data.type === "PROCESS_OUTBOX_NOW") event.waitUntil(processOutbox());
  if (data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = { title: "Empire PWA", body: "You have a new message", url: "./" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    try {
      if (event.data) payload.body = event.data.text();
    } catch (__) {}
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icon.svg",
      badge: "./icon.svg",
      data: payload.url || "./",
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      await notifyClients({
        type: "PUSH_SUBSCRIPTION_CHANGE",
        oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint,
      });
    })()
  );
});
