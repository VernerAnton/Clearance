// Syncing tabs and settings between devices. The pure parts: noticing local changes and
// merging two copies. Each tab carries the time it last changed, and per tab the newer
// copy wins, so edits to different tabs on two devices both survive. Closed tabs leave a
// note (a "tombstone") so they don't come back from a device that still has them.
import type { SyncData, SyncTab } from '../../shared/sync';
import type { Settings } from './settings';
import type { Tab, TabsState } from './tabs';

/** What this device remembers between visits (localStorage). */
export interface SyncMeta {
  /** The server version this device last saw. 0: never synced. */
  version: number;
  /** Per tab: a fingerprint of its content and when that content last changed. */
  stamps: Record<string, { sig: string; at: number }>;
  deleted: Record<string, number>;
  settings: { sig: string; at: number } | null;
}

export const EMPTY_META: SyncMeta = { version: 0, stamps: {}, deleted: {}, settings: null };

/** Tombstones older than this are dropped; a device away for longer may bring a closed tab back. */
const TOMBSTONE_MS = 90 * 24 * 60 * 60 * 1000;

/** A short fingerprint of a string (cyrb53), to notice changes without storing copies. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const tabSig = (t: Pick<Tab, 'title' | 'lang' | 'code' | 'fromMission' | 'task'>) =>
  fingerprint(JSON.stringify([t.title, t.lang, t.code, t.fromMission, t.task]));

/** Settings that follow you between devices. The layout suits each screen, so it stays local. */
export function sharedSettings(settings: Settings): Record<string, unknown> {
  const { layoutMode: _layoutMode, ...rest } = settings;
  return rest;
}

/**
 * This device's copy, ready to merge: compares the tabs with what was last recorded, and
 * stamps whatever changed (or appeared) with `now`. Tabs that vanished get a tombstone.
 */
export function snapshot(tabs: Tab[], settings: Settings, meta: SyncMeta, now: number): { data: SyncData; meta: SyncMeta } {
  const stamps: SyncMeta['stamps'] = {};
  const syncTabs: SyncTab[] = tabs.map((t) => {
    const sig = tabSig(t);
    const old = meta.stamps[t.id];
    const at = old && old.sig === sig ? old.at : now;
    stamps[t.id] = { sig, at };
    return { id: t.id, title: t.title, lang: t.lang, code: t.code, fromMission: t.fromMission, task: t.task, updatedAt: at };
  });
  const deleted = { ...meta.deleted };
  for (const id of Object.keys(meta.stamps)) if (!(id in stamps)) deleted[id] = now;
  const shared = sharedSettings(settings);
  const settingsSig = fingerprint(JSON.stringify(shared));
  const settingsAt = meta.settings && meta.settings.sig === settingsSig ? meta.settings.at : now;
  return {
    data: { tabs: syncTabs, deleted, settings: { value: shared, updatedAt: settingsAt } },
    meta: { ...meta, stamps, deleted, settings: { sig: settingsSig, at: settingsAt } },
  };
}

/** Merge two copies. Order: `mine` first, then tabs only `theirs` has. */
export function merge(mine: SyncData, theirs: SyncData | null, now: number): SyncData {
  if (!theirs) return mine;
  const deleted: Record<string, number> = {};
  for (const src of [mine.deleted, theirs.deleted]) {
    for (const [id, at] of Object.entries(src)) {
      if (now - at < TOMBSTONE_MS) deleted[id] = Math.max(deleted[id] ?? 0, at);
    }
  }
  const byId = new Map<string, SyncTab>();
  const order: string[] = [];
  for (const t of [...mine.tabs, ...theirs.tabs]) {
    const have = byId.get(t.id);
    if (!have) order.push(t.id);
    if (!have || t.updatedAt > have.updatedAt) byId.set(t.id, t);
  }
  // A tab closed after its last edit stays closed; edited after closing, it comes back.
  const tabs = order.map((id) => byId.get(id)!).filter((t) => !(deleted[t.id] >= t.updatedAt));
  for (const t of tabs) delete deleted[t.id];
  const settings =
    !theirs.settings || (mine.settings && mine.settings.updatedAt >= theirs.settings.updatedAt) ? mine.settings : theirs.settings;
  return { tabs, deleted, settings };
}

/** True when the two copies would look the same to the learner (ignoring timestamps). */
export function sameContent(a: SyncData, b: SyncData | null): boolean {
  if (!b) return false;
  const key = (d: SyncData) =>
    JSON.stringify([d.tabs.map((t) => [t.id, tabSig(t)]), Object.keys(d.deleted).sort(), d.settings?.value ?? null]);
  return key(a) === key(b);
}

/** After a merge, what this device should remember: the merged stamps, so nothing looks freshly edited. */
export function metaFor(data: SyncData, version: number): SyncMeta {
  const stamps: SyncMeta['stamps'] = {};
  for (const t of data.tabs) stamps[t.id] = { sig: tabSig(t), at: t.updatedAt };
  const settings = data.settings ? { sig: fingerprint(JSON.stringify(data.settings.value)), at: data.settings.updatedAt } : null;
  return { version, stamps, deleted: { ...data.deleted }, settings };
}

/**
 * Put a merge into the app's tabs. `snap` is the copy the merge started from: a tab you
 * edited (or opened) since then keeps your version, so typing during a sync is never lost.
 */
export function applyMerged(state: TabsState, merged: SyncData, snap: SyncData): TabsState {
  const snapSig = new Map(snap.tabs.map((t) => [t.id, tabSig(t)]));
  const editedSince = (t: Tab) => !snapSig.has(t.id) || snapSig.get(t.id) !== tabSig(t);
  const current = new Map(state.tabs.map((t) => [t.id, t]));
  const mergedIds = new Set(merged.tabs.map((t) => t.id));
  const tabs: Tab[] = merged.tabs.map((m) => {
    const mine = current.get(m.id);
    if (mine && editedSince(mine)) return mine;
    return { id: m.id, title: m.title, lang: m.lang, code: m.code, fromMission: m.fromMission, task: m.task };
  });
  // Tabs the merge doesn't have: new since the snapshot (keep), or closed on another device (drop).
  for (const t of state.tabs) if (!mergedIds.has(t.id) && editedSince(t)) tabs.push(t);
  if (tabs.length === 0) return state;
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : tabs[0].id;
  return { tabs, activeId };
}

export function parseMeta(raw: string | null): SyncMeta {
  try {
    const m = JSON.parse(raw ?? 'null');
    if (m && typeof m === 'object' && typeof m.version === 'number' && m.stamps && m.deleted) {
      return { version: m.version, stamps: m.stamps, deleted: m.deleted, settings: m.settings ?? null };
    }
  } catch {
    // Broken: start over (the next sync merges everything again, nothing is lost).
  }
  return { ...EMPTY_META };
}
