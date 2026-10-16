import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { SyncData, SyncPutResult, SyncState } from '../../shared/sync';
import { parseSettings, type Settings } from '../lib/settings';
import { applyMerged, merge, metaFor, parseMeta, sameContent, snapshot, type SyncMeta } from '../lib/sync';
import { isStarterOnly, type TabsState } from '../lib/tabs';

// Keeps tabs and settings in step across devices when the app is behind Cloudflare Access
// (the server knows who you are). Syncs on opening, on coming back to the app, a moment
// after you stop typing, and once more when you leave. Without a login it does nothing.

export type SyncStatus =
  | { state: 'checking' }
  | { state: 'off'; reason: string }
  | { state: 'syncing' | 'synced'; email: string; at: number | null }
  | { state: 'error'; email: string | null; message: string };

const META_KEY = 'clearance.sync.v1';
const DEBOUNCE_MS = 2000;

function loadMeta(): SyncMeta {
  try {
    return parseMeta(localStorage.getItem(META_KEY));
  } catch {
    return parseMeta(null);
  }
}
function saveMeta(meta: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Not saved: the next sync merges again, nothing is lost.
  }
}

const OFFLINE = "Couldn't sync: you're offline, or your login expired. Reload the page to sign in again.";

export function useCloudSync(
  tabsState: TabsState,
  setTabsState: Dispatch<SetStateAction<TabsState>>,
  settings: Settings,
  setSettings: Dispatch<SetStateAction<Settings>>,
): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: 'checking' });
  const latest = useRef({ tabsState, settings });
  latest.current = { tabsState, settings };
  const meta = useRef<SyncMeta>(loadMeta());
  const enabled = useRef<boolean | null>(null);
  const email = useRef<string | null>(null);
  const lastServer = useRef<SyncData | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  const syncNow = useCallback(async () => {
    if (enabled.current === false) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const now = Date.now();
        const local = snapshot(latest.current.tabsState.tabs, latest.current.settings, meta.current, now);
        meta.current = local.meta;
        saveMeta(meta.current);

        let res: Response;
        try {
          res = await fetch('/api/sync', { cache: 'no-store' });
        } catch {
          setStatus({ state: 'error', email: email.current, message: OFFLINE });
          return;
        }
        const state = (await res.json().catch(() => null)) as SyncState | null;
        if (!state) {
          setStatus({ state: 'error', email: email.current, message: OFFLINE });
          return;
        }
        if (!state.enabled) {
          enabled.current = false;
          setStatus({ state: 'off', reason: state.reason });
          return;
        }
        enabled.current = true;
        email.current = state.email;
        setStatus({ state: 'syncing', email: state.email, at: null });

        let server = state.data;
        let version = state.version;
        let mine = local.data;
        // This device's first sync, with data already saved from another device: the saved
        // settings win, and untouched starter tabs aren't added to your real ones.
        const firstSync = meta.current.version === 0 && server !== null;
        if (firstSync) {
          mine = { ...mine, settings: null, tabs: isStarterOnly(latest.current.tabsState.tabs) ? [] : mine.tabs };
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          const merged = merge(mine, server, Date.now());
          if (!sameContent(merged, local.data)) {
            setTabsState((s) => applyMerged(s, merged, local.data));
            if (merged.settings && (firstSync || merged.settings.updatedAt > (local.data.settings?.updatedAt ?? 0))) {
              const value = merged.settings.value;
              // Validated like saved settings; the layout stays this device's own.
              setSettings((s) => parseSettings(JSON.stringify({ ...value, layoutMode: s.layoutMode })));
            }
          }
          if (version > 0 && sameContent(merged, server)) {
            meta.current = metaFor(merged, version);
            lastServer.current = merged;
            break;
          }
          let put: Response;
          try {
            put = await fetch('/api/sync', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ baseVersion: version, data: merged }),
            });
          } catch {
            setStatus({ state: 'error', email: state.email, message: OFFLINE });
            return;
          }
          const result = (await put.json().catch(() => null)) as SyncPutResult | { error: { message: string } } | null;
          if (result && 'ok' in result && result.ok) {
            meta.current = metaFor(merged, result.version);
            lastServer.current = merged;
            break;
          }
          if (result && 'conflict' in result) {
            // Another device saved first: merge with theirs and try again.
            server = result.data;
            version = result.version;
            mine = merged;
            continue;
          }
          const message = result && 'error' in result ? result.error.message : `Sync failed (${put.status}).`;
          setStatus({ state: 'error', email: state.email, message });
          return;
        }
        saveMeta(meta.current);
        setStatus({ state: 'synced', email: state.email, at: Date.now() });
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [setTabsState, setSettings]);

  // On opening, and whenever the app comes back into view or online.
  useEffect(() => {
    void syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [syncNow]);

  // A moment after the last change.
  useEffect(() => {
    if (enabled.current !== true) return;
    const timer = window.setTimeout(() => void syncNow(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [tabsState, settings, syncNow]);

  // Leaving (closing the tab, switching apps on a phone): send what changed in the last
  // seconds. Fire-and-forget; if another device saved meanwhile, the next visit merges.
  useEffect(() => {
    const onHide = () => {
      if (enabled.current !== true || meta.current.version === 0) return;
      const local = snapshot(latest.current.tabsState.tabs, latest.current.settings, meta.current, Date.now());
      if (sameContent(local.data, lastServer.current)) return;
      const merged = merge(local.data, lastServer.current, Date.now());
      const body = JSON.stringify({ baseVersion: meta.current.version, data: merged });
      // Browsers cap keepalive requests at 64 KB; bigger ones wait for the next visit.
      if (body.length > 60_000) return;
      meta.current = local.meta;
      saveMeta(meta.current);
      lastServer.current = merged; // So hiding and then closing doesn't send it twice.
      void fetch('/api/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return status;
}
