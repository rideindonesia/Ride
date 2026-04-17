import { useEffect, useRef } from "react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const SW_PATH = `${BASE}/sw.js`;

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/push/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey ?? null;
  } catch { return null; }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeAndSend(reg: ServiceWorkerRegistration, vapidKey: string) {
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    await fetch(`${BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (e) {
    console.warn("[push] subscribe failed:", e);
  }
}

export function usePushNotification(isLoggedIn: boolean) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || attemptedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    attemptedRef.current = true;

    (async () => {
      try {
        // Minta izin notifikasi
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Daftarkan service worker
        const reg = await navigator.serviceWorker.register(SW_PATH, { scope: `${BASE}/` });
        await navigator.serviceWorker.ready;

        const vapidKey = await getVapidKey();
        if (!vapidKey) return;

        await subscribeAndSend(reg, vapidKey);
      } catch (e) {
        console.warn("[push] setup failed:", e);
      }
    })();
  }, [isLoggedIn]);
}
