import { useEffect, useRef, useState } from 'react';

/** The backstop. The visibility check below does nearly all the work. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

// Must match what the build emits: public/sw.js is copied to dist/sw.js and served
// at the site root. A wrong path rejects into the catch below, and the app then
// never mentions being stale (it looks exactly like being up to date).
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

/**
 * Registers the service worker and notices when a newer build has been deployed.
 * It never reloads by itself: a reload nobody asked for would throw away a
 * half-typed message or a running program. It offers one instead.
 *
 * Registered here by hand on purpose (see CLAUDE.md): the worker takes over at
 * once (skipWaiting + clients.claim), so a new build is detected by watching it
 * arrive (updatefound / controllerchange), not by waiting for it.
 */
export function useAppUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  // Survives a dismissal, because the page doesn't stop being behind just because
  // the offer was waved away. Once the newer worker has taken over there is nothing
  // new left for update() to find, so without this "Later" would quietly mean "never".
  const stale = useRef(false);

  useEffect(() => {
    // Only the built app has a worker; during `npm run dev` it would fight live reloading.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let timer: number | undefined;
    let onVisible: (() => void) | undefined;
    const announce = () => {
      stale.current = true;
      if (!cancelled) setNeedRefresh(true);
    };

    // Whether a worker controlled this page when it loaded. A first install takes
    // control too, and that's this build arriving, not a newer one. Only a handover
    // from an older worker means "you're behind", so every announcement is gated on it.
    const wasControlled = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (wasControlled) announce();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .then((reg) => {
        if (cancelled) return;

        // A build that finished installing while the app was closed, still parked.
        if (reg.waiting && navigator.serviceWorker.controller) announce();

        // And one that installs while the app is open.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && wasControlled) announce();
          });
        });

        // The visibility check is the one that matters: an installed app is switched
        // back to far more often than it's opened fresh. The interval is the backstop.
        const check = () => {
          reg.update().catch(() => {});
          if (stale.current) announce(); // still behind from an earlier check
        };
        timer = window.setInterval(check, UPDATE_INTERVAL_MS);
        onVisible = () => {
          if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);
      })
      .catch((err) => {
        // Not worth crashing over: the app runs fine, it just can't say it's stale.
        // Which is why a wrong SW_URL is invisible: verify registration at runtime.
        console.warn('Service worker not registered:', err);
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (timer !== undefined) window.clearInterval(timer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    needRefresh,
    // The new worker already controls the page and the worker is network-first,
    // so a plain reload lands on the new build.
    updateApp: () => window.location.reload(),
    // Keep this build for now. The offer returns on the next check, since `stale` stays set.
    dismiss: () => setNeedRefresh(false),
  };
}
