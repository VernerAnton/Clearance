// User settings, saved in localStorage. Phase 7 adds the debug panel toggle here.

export interface Settings {
  /** Underline syntax errors while typing. Off by default. */
  liveLinting: boolean;
}

const STORAGE_KEY = 'clearance.settings.v1';
const DEFAULTS: Settings = { liveLinting: false };

export function loadSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { liveLinting: data?.liveLinting === true };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the setting still applies for this visit.
  }
}
