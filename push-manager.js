/**
 * Empire PWA — Push subscription management
 * -----------------------------------------
 * Handles: support check, permission, subscribe, unsubscribe,
 * getSubscription, local persistence, export for your backend.
 *
 * Usage:
 *   import { PushManagerUI } from './push-manager.js'; // or use global below
 *
 * Set your VAPID public key before subscribe:
 *   PushSubscriptionManager.setVapidPublicKey('BNxxxx...');
 */

const STORAGE_KEY = "empire-push-subscription";

/** Convert Base64 URL VAPID key → Uint8Array */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function saveLocal(subscription) {
  try {
    if (subscription) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subscription.toJSON()));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (_) {}
}

export function loadLocalSubscription() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

const state = {
  vapidPublicKey: "",
};

export const PushSubscriptionManager = {
  setVapidPublicKey(key) {
    state.vapidPublicKey = key || "";
  },

  getVapidPublicKey() {
    return state.vapidPublicKey;
  },

  isSupported: isPushSupported,
  getPermission: getPermissionState,
  loadLocal: loadLocalSubscription,

  async getRegistration() {
    return navigator.serviceWorker.ready;
  },

  async getSubscription() {
    if (!isPushSupported()) return null;
    const reg = await this.getRegistration();
    return reg.pushManager.getSubscription();
  },

  async subscribe(options = {}) {
    if (!isPushSupported()) {
      throw new Error("Push not supported in this browser");
    }

    const vapid = options.vapidPublicKey || state.vapidPublicKey;
    if (!vapid || vapid.startsWith("YOUR_")) {
      throw new Error(
        "Set a real VAPID public key via setVapidPublicKey() or options.vapidPublicKey"
      );
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      throw new Error("Notification permission: " + permission);
    }

    const reg = await this.getRegistration();
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: options.userVisibleOnly !== false,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }

    saveLocal(sub);

    if (typeof options.onSubscribe === "function") {
      await options.onSubscribe(sub);
    }

    return sub;
  },

  async unsubscribe(options = {}) {
    const sub = await this.getSubscription();
    if (!sub) {
      saveLocal(null);
      return false;
    }

    const endpoint = sub.endpoint;
    const ok = await sub.unsubscribe();
    saveLocal(null);

    if (ok && typeof options.onUnsubscribe === "function") {
      await options.onUnsubscribe({ endpoint });
    }

    return ok;
  },

  async exportSubscriptionJSON() {
    const sub = await this.getSubscription();
    return sub ? sub.toJSON() : loadLocalSubscription();
  },

  async resubscribe(options = {}) {
    await this.unsubscribe({ onUnsubscribe: options.onUnsubscribe });
    return this.subscribe(options);
  },
};

if (typeof window !== "undefined") {
  window.PushSubscriptionManager = PushSubscriptionManager;
  window.urlBase64ToUint8Array = urlBase64ToUint8Array;
}
