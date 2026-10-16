import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('starts with the typing helpers off, wrapping on, and the theme following the computer', () => {
    expect(parseSettings(null)).toEqual({
      liveLinting: false,
      autocomplete: false,
      closeBrackets: false,
      wrapLines: true,
      theme: 'system',
      debugPanel: false,
      tutorModel: '',
      judgeModel: '',
      thinking: 'low',
      layoutMode: 'auto',
    });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps saved values', () => {
    const saved = {
      liveLinting: true,
      autocomplete: true,
      closeBrackets: true,
      wrapLines: false,
      theme: 'dark',
      debugPanel: true,
      tutorModel: 'minimax/minimax-m3',
      judgeModel: 'typesafe:jev-latest',
      thinking: 'high',
      layoutMode: 'side',
    };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it('fills in settings added after the save, and ignores junk', () => {
    expect(parseSettings('{"liveLinting": true}')).toEqual({ ...DEFAULT_SETTINGS, liveLinting: true });
    expect(parseSettings('{"autocomplete": "yes", "theme": "purple", "layoutMode": "tiny"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('forgets a saved model that is no longer on the list', () => {
    expect(parseSettings('{"tutorModel": "old/model", "judgeModel": "typesafe:jev-latest"}')).toMatchObject({
      tutorModel: '',
      judgeModel: 'typesafe:jev-latest',
    });
  });
});
