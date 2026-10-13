// Editor tabs: the data model, the starter tabs, and saving to localStorage.

export type Lang = 'python' | 'sql';

export interface Tab {
  id: string;
  title: string;
  lang: Lang;
  code: string;
  fromMission: boolean;
}

export interface TabsState {
  tabs: Tab[];
  activeId: string;
}

const STORAGE_KEY = 'clearance.tabs.v1';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultTabs(): TabsState {
  const tabs: Tab[] = [
    {
      id: newId(),
      title: 'Filter positives',
      lang: 'python',
      fromMission: true,
      code: `# Mission: Filter positives
# Write a function filter_positives(nums) that returns
# all numbers greater than 0, in their original order.
# Print the result for the list below.

nums = [-3, 5, -1, 0, 7, 2]

# Your code below
def filter_positives(nums):
    result = []
    for n in nums:
        if n >= 0:
            result.append(n)
    return result

print(filter_positives(nums))
`,
    },
    {
      id: newId(),
      title: 'practice.sql',
      lang: 'sql',
      fromMission: false,
      code: `CREATE TABLE stories (title TEXT, url TEXT);
INSERT INTO stories VALUES
  ('Rust tips', 'https://github.com/x'),
  ('My startup', 'https://medium.com/y'),
  ('Ask HN', 'https://news.ycombinator.com');

SELECT title,
  CASE
    WHEN url LIKE '%github%' THEN 'GitHub'
    WHEN url LIKE '%medium%' THEN 'Medium'
    ELSE 'Other'
  END AS source
FROM stories;
`,
    },
  ];
  return { tabs, activeId: tabs[0].id };
}

/** Name for a new empty tab: scratch1.py, scratch2.py, ... or query1.sql, ... */
export function nextScratchTitle(tabs: Tab[], lang: Lang): string {
  const base = lang === 'sql' ? 'query' : 'scratch';
  const ext = lang === 'sql' ? '.sql' : '.py';
  let n = 1;
  while (tabs.some((t) => t.title === `${base}${n}${ext}`)) n++;
  return `${base}${n}${ext}`;
}

/** A tab title not used yet: "Evens", then "Evens 2", "Evens 3", ... */
export function uniqueTitle(tabs: Tab[], title: string): string {
  if (!tabs.some((t) => t.title === title)) return title;
  let n = 2;
  while (tabs.some((t) => t.title === `${title} ${n}`)) n++;
  return `${title} ${n}`;
}

function isTab(x: unknown): x is Tab {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    (t.lang === 'python' || t.lang === 'sql') &&
    typeof t.code === 'string' &&
    typeof t.fromMission === 'boolean'
  );
}

/**
 * Turn saved JSON back into tabs. Anything broken or unexpected gives null,
 * so the caller can fall back to the starter tabs instead of crashing.
 */
export function parseSavedTabs(raw: string | null): TabsState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { tabs, activeId } = data as Record<string, unknown>;
  if (!Array.isArray(tabs)) return null;
  const valid = tabs.filter(isTab);
  if (valid.length === 0) return null;
  const active = valid.some((t) => t.id === activeId) ? (activeId as string) : valid[0].id;
  return { tabs: valid, activeId: active };
}

// localStorage can be missing or throw (private windows, blocked storage),
// so every access is wrapped and failure just means "not saved".
export function loadTabs(): TabsState {
  try {
    return parseSavedTabs(localStorage.getItem(STORAGE_KEY)) ?? defaultTabs();
  } catch {
    return defaultTabs();
  }
}

export function saveTabs(state: TabsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: keep working without saving.
  }
}
