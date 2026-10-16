import { useEffect, useState } from 'react';

/** The backstop. The visibility check below does nearly all the work. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

// Must match what the build emits: public/sw.js is copied to dist/sw.js and served
// at the site root. A wrong path rejects into the catch below and the app quietly
// loses its offline copy, so verify registration at runtime after changing it.
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

/** Written by scripts/vite-plugin-build-info.ts on every build: { build, version }. */
const VERSION_URL = '/version.json';

/** The deployed build, or null when it can't be read (offline, mid-deploy). */
async function deployedBuild(): Promise<{ build: string; version: number | null } | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' ? { build: data.build, version: typeof data.version === 'number' ? data.version : null } : null;
  } catch {
    return null;
  }
}

/**
 * Notices when a newer build has been deployed, by comparing this page's build ID
 * (compiled in) with the deployed one (/version.json). Only a real difference counts:
 * opening the app after a deploy already loads the new build (the service worker is
 * network-first), and an earlier version of this hook that watched the service worker
 * change hands announced that as an update even though nothing was newer.
 *
 * It never reloads by itself: a reload nobody asked for would throw away a half-typed
 * message or a running program. It offers one instead. "Later" hides the offer until
 * the next check, which finds the difference again: Later never means never.
 *
 * Also registers the service worker (offline copy + installable app), by hand on purpose
 * (see CLAUDE.md), and asks it to update on each check so the offline copy stays current.
 */
export function useAppUpdate() {
  const [newer, setNewer] = useState<{ version: number | null } | null>(null);

  useEffect(() => {
    // Only the built app has a worker and a version.json; `npm run dev` reloads by itself.
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    let reg: ServiceWorkerRegistration | null = null;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(SW_URL, { scope: SW_SCOPE })
        .then((r) => {
          reg = r;
        })
        .catch((err) => console.warn('Service worker not registered:', err));
    }

    const check = async () => {
      reg?.update().catch(() => {});
      const deployed = await deployedBuild();
      if (!cancelled && deployed && deployed.build !== __BUILD_ID__) setNewer({ version: deployed.version });
    };

    // The visibility check is the one that matters: an installed app is switched back
    // to far more often than it's opened fresh. The interval is the backstop.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setInterval(() => void check(), UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    needRefresh: newer !== null,
    /** The waiting version's number, when the deploy says it. */
    newVersion: newer?.version ?? null,
    // The service worker is network-first, so a plain reload lands on the new build.
    updateApp: () => window.location.reload(),
    // Keep this build for now. The next check finds the difference again and re-offers.
    dismiss: () => setNewer(null),
  };
}
