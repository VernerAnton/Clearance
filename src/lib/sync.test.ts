import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { EMPTY_META, applyMerged, merge, metaFor, parseMeta, sameContent, snapshot } from './sync';
import type { Tab } from './tabs';

const tab = (id: string, code = 'print(1)'): Tab => ({ id, title: `${id}.py`, lang: 'python', code, fromMission: false, task: '' });

describe('snapshot', () => {
  it('stamps new and changed tabs with now, and keeps the time of unchanged ones', () => {
    const first = snapshot([tab('a'), tab('b')], DEFAULT_SETTINGS, EMPTY_META, 100);
    expect(first.data.tabs.map((t) => t.updatedAt)).toEqual([100, 100]);
    const second = snapshot([tab('a'), tab('b', 'print(2)')], DEFAULT_SETTINGS, first.meta, 200);
    expect(second.data.tabs.map((t) => t.updatedAt)).toEqual([100, 200]);
    expect(second.data.settings?.updatedAt).toBe(100);
  });

  it('leaves a tombstone for a closed tab, and keeps the layout out of synced settings', () => {
    const first = snapshot([tab('a'), tab('b')], DEFAULT_SETTINGS, EMPTY_META, 100);
    const second = snapshot([tab('a')], { ...DEFAULT_SETTINGS, layoutMode: 'side' }, first.meta, 300);
    expect(second.data.deleted).toEqual({ b: 300 });
    expect(second.data.settings).toEqual({ value: expect.not.objectContaining({ layoutMode: expect.anything() }), updatedAt: 100 });
  });
});

describe('merge', () => {
  const now = 1_000_000;
  const data = (tabs: [string, string, number][], deleted: Record<string, number> = {}, settingsAt = 1) => ({
    tabs: tabs.map(([id, code, updatedAt]) => ({ ...tab(id, code), updatedAt })),
    deleted,
    settings: { value: { theme: settingsAt > 5 ? 'dark' : 'light' }, updatedAt: settingsAt },
  });

  it('keeps edits to different tabs from both devices, newest copy per tab', () => {
    const mine = data([['a', 'mine-a', 50], ['b', 'old-b', 10]]);
    const theirs = data([['b', 'their-b', 60], ['c', 'their-c', 20]]);
    const merged = merge(mine, theirs, now);
    expect(merged.tabs.map((t) => [t.id, t.code])).toEqual([['a', 'mine-a'], ['b', 'their-b'], ['c', 'their-c']]);
  });

  it('keeps a closed tab closed, unless it was edited after being closed', () => {
    const mine = data([['a', 'x', 10]], { b: 40 });
    expect(merge(mine, data([['a', 'x', 10], ['b', 'y', 30]]), now).tabs.map((t) => t.id)).toEqual(['a']);
    expect(merge(mine, data([['a', 'x', 10], ['b', 'y', 50]]), now).tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('forgets tombstones older than 90 days', () => {
    const old = now - 91 * 24 * 60 * 60 * 1000;
    expect(merge(data([], { z: old }), data([]), now).deleted).toEqual({});
  });

  it('takes the newer settings, and uses mine when there is nothing on the server', () => {
    expect(merge(data([], {}, 3), data([], {}, 9), now).settings?.updatedAt).toBe(9);
    expect(merge(data([], {}, 9), data([], {}, 3), now).settings?.updatedAt).toBe(9);
    const mine = data([['a', 'x', 1]]);
    expect(merge(mine, null, now)).toBe(mine);
  });
});

describe('applyMerged', () => {
  it('takes remote changes, but never overwrites a tab edited during the sync', () => {
    const snap = snapshot([tab('a'), tab('b'), tab('gone')], DEFAULT_SETTINGS, EMPTY_META, 1).data;
    const merged = {
      ...snap,
      tabs: [
        { ...tab('a', 'remote-a'), updatedAt: 5 },
        { ...tab('b', 'remote-b'), updatedAt: 5 },
        { ...tab('new', 'from-phone'), updatedAt: 5 },
      ],
    };
    // Meanwhile: b was edited here, and a fresh tab was opened.
    const state = { tabs: [tab('a'), tab('b', 'typing…'), tab('gone'), tab('fresh')], activeId: 'gone' };
    const out = applyMerged(state, merged, snap);
    expect(out.tabs.map((t) => [t.id, t.code])).toEqual([
      ['a', 'remote-a'],
      ['b', 'typing…'],
      ['new', 'from-phone'],
      ['fresh', 'print(1)'],
    ]);
    expect(out.activeId).toBe('a');
  });

  it('never leaves zero tabs', () => {
    const snap = snapshot([tab('a')], DEFAULT_SETTINGS, EMPTY_META, 1).data;
    const state = { tabs: [tab('a')], activeId: 'a' };
    expect(applyMerged(state, { ...snap, tabs: [] }, snap)).toBe(state);
  });
});

describe('metaFor and sameContent', () => {
  it('records merged stamps, so applying a merge does not look like a new local edit', () => {
    const merged = snapshot([tab('a')], DEFAULT_SETTINGS, EMPTY_META, 100).data;
    const meta = metaFor(merged, 4);
    const again = snapshot([tab('a')], DEFAULT_SETTINGS, meta, 999);
    expect(again.data.tabs[0].updatedAt).toBe(100);
    expect(sameContent(again.data, merged)).toBe(true);
    expect(sameContent(snapshot([tab('a', 'changed')], DEFAULT_SETTINGS, meta, 999).data, merged)).toBe(false);
  });

  it('parses saved meta, falling back to empty', () => {
    expect(parseMeta(JSON.stringify(metaFor({ tabs: [], deleted: {}, settings: null }, 3))).version).toBe(3);
    expect(parseMeta('junk')).toEqual(EMPTY_META);
  });
});
