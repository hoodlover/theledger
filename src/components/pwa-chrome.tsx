"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const IOS_DISMISSED_KEY = "ledger.iosInstallDismissed";
const IOS_DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari: navigator.standalone
  // Everyone else: display-mode media query
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (iosStandalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOnDesktopMode =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOnDesktopMode;
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium/.test(ua);
}

function recentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(IOS_DISMISSED_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < IOS_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Two things in one client component:
 *   1. iOS Safari install banner (Apple has no install API — we tell users to
 *      use the share sheet → Add to Home Screen).
 *   2. Standalone-mode top chrome — when running as an installed PWA there's
 *      no browser back button or pull-to-refresh, so we render our own.
 */
export function PwaChrome() {
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const std = isStandalone();
    setStandalone(std);
    if (!std && isIos() && isSafari() && !recentlyDismissed()) {
      setShowIosBanner(true);
    }
  }, []);

  function dismissIos() {
    setShowIosBanner(false);
    try {
      localStorage.setItem(IOS_DISMISSED_KEY, String(Date.now()));
    } catch {
      // private mode: just ignore, banner stays gone for this session
    }
  }

  if (!mounted) return null;

  return (
    <>
      {standalone && (
        <div
          className="sticky top-0 z-30 flex items-center gap-1 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur px-3"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
            paddingBottom: "6px",
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-[var(--surface-warm)] active:scale-95 transition-all text-[var(--body)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => router.forward()}
            aria-label="Forward"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-[var(--surface-warm)] active:scale-95 transition-all text-[var(--body)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            aria-label="Refresh"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-[var(--surface-warm)] active:scale-95 transition-all text-[var(--body)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
          </button>
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            The Ledger
          </span>
        </div>
      )}

      {showIosBanner && (
        <div
          className="fixed inset-x-0 z-40 mx-auto max-w-md px-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)] p-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Install The Ledger
                </div>
                <div className="mt-1 text-[var(--body)]">
                  Tap{" "}
                  <span aria-label="Share icon">
                    <svg
                      className="inline-block align-text-bottom mx-0.5"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 16V4" />
                      <path d="M8 8l4-4 4 4" />
                      <rect x="4" y="14" width="16" height="6" rx="1" />
                    </svg>
                  </span>{" "}
                  in Safari, then <strong>Add to Home Screen</strong>.
                </div>
              </div>
              <button
                type="button"
                onClick={dismissIos}
                aria-label="Dismiss"
                className="rounded-full px-2 py-1 text-[var(--muted)] hover:text-[var(--danger)]"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Separate /settings install button: works on Chrome/Edge/Android via the
// beforeinstallprompt event. iOS has no programmatic install — those users
// get the banner above.
export function PwaInstallButton() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    function handler(e: Event) {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    }
    function installedHandler() {
      setInstalled(true);
      setEvt(null);
    }
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (standalone || installed) {
    return (
      <span className="text-xs text-[var(--muted)]">
        Installed — running as PWA.
      </span>
    );
  }

  if (!evt) {
    if (isIos()) {
      return (
        <span className="text-xs text-[var(--muted)]">
          In Safari, tap the share icon, then Add to Home Screen.
        </span>
      );
    }
    return (
      <span className="text-xs text-[var(--muted)]">
        Browser not ready to install yet — try refreshing.
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await evt.prompt();
        const choice = await evt.userChoice;
        if (choice.outcome === "accepted") setEvt(null);
      }}
      className="rounded-full bg-[var(--accent)] text-white px-4 py-2 text-sm font-semibold hover:-translate-y-0.5 transition-all hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
    >
      Install The Ledger
    </button>
  );
}

// Type for the non-standard event Chrome/Edge fire pre-install.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
