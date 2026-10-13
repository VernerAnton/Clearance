// Panel sizes the learner sets by dragging the dividers. Saved in localStorage.

export interface Layout {
  /** Width of the left rail, in pixels. */
  railWidth: number;
  /** Width of the chat column, in pixels. */
  chatWidth: number;
  /** Height of the run bar + output area under the editor, in pixels. */
  outputHeight: number;
}

const STORAGE_KEY = 'clearance.layout.v1';

export const DEFAULT_LAYOUT: Layout = { railWidth: 252, chatWidth: 460, outputHeight: 280 };

/** Smallest and largest sizes, so no panel can be dragged out of existence. */
export const LIMITS = {
  railWidth: { min: 190, max: 420 },
  chatWidth: { min: 280, max: 900 },
  outputHeight: { min: 90, max: 2000 },
  /** The editor column always keeps at least this much width. */
  minWorkWidth: 360,
  /** The editor always keeps at least this much height above the output. */
  minEditorHeight: 120,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
}

export function parseLayout(raw: string | null): Layout {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    // Broken JSON: use the defaults.
  }
  const num = (key: keyof Layout) => {
    const v = data[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_LAYOUT[key];
    return clamp(v, LIMITS[key].min, LIMITS[key].max);
  };
  return { railWidth: num('railWidth'), chatWidth: num('chatWidth'), outputHeight: num('outputHeight') };
}

export function loadLayout(): Layout {
  try {
    return parseLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Not saved; the sizes still apply for this visit.
  }
}
