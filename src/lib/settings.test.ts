import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('starts with every editor helper off and the theme following the computer', () => {
    expect(parseSettings(null)).toEqual({ liveLinting: false, autocomplete: false, closeBrackets: false, theme: 'system', debugPanel: false });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps saved values', () => {
    const saved = { liveLinting: true, autocomplete: true, closeBrackets: true, theme: 'dark', debugPanel: true };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it('fills in settings added after the save, and ignores junk', () => {
    expect(parseSettings('{"liveLinting": true}')).toEqual({ ...DEFAULT_SETTINGS, liveLinting: true });
    expect(parseSettings('{"autocomplete": "yes", "theme": "purple"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });
});
