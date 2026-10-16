// What GET/PUT /api/sync carry: your tabs and settings, saved per logged-in email.
import type { Lang } from './api.ts';

export interface SyncTab {
  id: string;
  title: string;
  lang: Lang;
  code: string;
  fromMission: boolean;
  task: string;
  /** When this tab last changed on any device (ms since 1970). The newer copy wins. */
  updatedAt: number;
}

export interface SyncData {
  tabs: SyncTab[];
  /** Closed tabs: id -> when it was closed, so a closed tab doesn't come back from another device. */
  deleted: Record<string, number>;
  /** Settings shared between devices (not the layout, which suits each screen). */
  settings: { value: Record<string, unknown>; updatedAt: number } | null;
}

/** GET /api/sync */
export type SyncState =
  | { enabled: false; reason: string }
  | { enabled: true; email: string; version: number; data: SyncData | null };

/** PUT /api/sync. `baseVersion` is the version this data was merged with; 0 for the first save. */
export interface SyncPut {
  baseVersion: number;
  data: SyncData;
}

/** PUT answers with the new version, or 409 and the current state when another device saved first. */
export type SyncPutResult = { ok: true; version: number } | { ok: false; conflict: true; version: number; data: SyncData | null };

export const SYNC_LIMITS = {
  /** Size of the saved JSON. */
  bytes: 2_000_000,
  tabs: 300,
};

export function isSyncData(x: unknown): x is SyncData {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  if (!Array.isArray(d.tabs) || d.tabs.length > SYNC_LIMITS.tabs) return false;
  const tabsOk = d.tabs.every((t) => {
    if (!t || typeof t !== 'object') return false;
    const tab = t as Record<string, unknown>;
    return (
      typeof tab.id === 'string' &&
      typeof tab.title === 'string' &&
      (tab.lang === 'python' || tab.lang === 'sql') &&
      typeof tab.code === 'string' &&
      typeof tab.fromMission === 'boolean' &&
      typeof tab.task === 'string' &&
      typeof tab.updatedAt === 'number'
    );
  });
  if (!tabsOk) return false;
  if (!d.deleted || typeof d.deleted !== 'object' || Array.isArray(d.deleted)) return false;
  if (!Object.values(d.deleted).every((v) => typeof v === 'number')) return false;
  if (d.settings !== null) {
    const s = d.settings as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object' || !s.value || typeof s.value !== 'object' || typeof s.updatedAt !== 'number') return false;
  }
  return true;
}
