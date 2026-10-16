import { describe, expect, it } from 'vitest';
import { defaultTabs, nextScratchTitle, parseSavedTabs, uniqueTitle, type Tab } from './tabs';

const tab = (over: Partial<Tab> = {}): Tab => ({
  id: 'a',
  title: 'scratch1.py',
  lang: 'python',
  code: 'print(1)',
  fromMission: false,
  task: '',
  ...over,
});

describe('defaultTabs', () => {
  it('starts with one Python tab and one SQL tab, the first one active', () => {
    const s = defaultTabs();
    expect(s.tabs.map((t) => t.lang)).toEqual(['python', 'sql']);
    expect(s.activeId).toBe(s.tabs[0].id);
  });
});

describe('nextScratchTitle', () => {
  it('numbers new tabs per language and fills the first free number', () => {
    expect(nextScratchTitle([], 'python')).toBe('scratch1.py');
    expect(nextScratchTitle([tab()], 'python')).toBe('scratch2.py');
    expect(nextScratchTitle([tab()], 'sql')).toBe('query1.sql');
    expect(nextScratchTitle([tab({ title: 'scratch2.py' })], 'python')).toBe('scratch1.py');
  });
});

describe('parseSavedTabs', () => {
  it('round-trips saved state', () => {
    const s = { tabs: [tab(), tab({ id: 'b', lang: 'sql', title: 'q.sql' })], activeId: 'b' };
    expect(parseSavedTabs(JSON.stringify(s))).toEqual(s);
  });

  it('gives tabs saved before the Task box an empty task', () => {
    const { task: _, ...old } = tab();
    expect(parseSavedTabs(JSON.stringify({ tabs: [old], activeId: 'a' }))).toEqual({ tabs: [tab()], activeId: 'a' });
  });

  it('returns null for missing, broken or empty data', () => {
    expect(parseSavedTabs(null)).toBeNull();
    expect(parseSavedTabs('not json')).toBeNull();
    expect(parseSavedTabs('{"tabs": []}')).toBeNull();
    expect(parseSavedTabs('[1,2]')).toBeNull();
  });

  it('drops malformed tabs and fixes a missing active tab', () => {
    const raw = JSON.stringify({ tabs: [{ id: 'x', lang: 'ruby' }, tab({ id: 'ok' })], activeId: 'gone' });
    expect(parseSavedTabs(raw)).toEqual({ tabs: [tab({ id: 'ok' })], activeId: 'ok' });
  });
});

describe('uniqueTitle', () => {
  it('numbers duplicate mission titles', () => {
    expect(uniqueTitle([tab()], 'Evens')).toBe('Evens');
    expect(uniqueTitle([tab({ title: 'Evens' })], 'Evens')).toBe('Evens 2');
    expect(uniqueTitle([tab({ title: 'Evens' }), tab({ title: 'Evens 2' })], 'Evens')).toBe('Evens 3');
  });
});
