"use client";

import { useEffect } from "react";

// Registers /sw.js so Chrome/Edge/Safari count the app as installable
// and the offline-shell logic applies. No-op when the browser lacks
// service worker support (e.g. older Safari).
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Avoid dev hot-reload caching headaches; users only get the SW in prod.
      return;
    }
    const url = "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/" }).catch((err) => {
      // Don't surface — just log for diagnostics
      console.warn("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
