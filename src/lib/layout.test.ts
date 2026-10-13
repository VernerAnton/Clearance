import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, LIMITS, clamp, parseLayout } from './layout';

describe('clamp', () => {
  it('keeps a value inside the range and rounds it', () => {
    expect(clamp(50, 100, 200)).toBe(100);
    expect(clamp(250, 100, 200)).toBe(200);
    expect(clamp(150.6, 100, 200)).toBe(151);
  });

  it('uses the minimum when the window is too small for any range', () => {
    expect(clamp(150, 100, 80)).toBe(100);
  });
});

describe('parseLayout', () => {
  it('uses the defaults when nothing is saved or the data is broken', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('not json')).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('{"railWidth": "wide"}')).toEqual(DEFAULT_LAYOUT);
  });

  it('keeps saved sizes, pulled back inside the limits', () => {
    const raw = JSON.stringify({ railWidth: 10, chatWidth: 500, outputHeight: 99999 });
    expect(parseLayout(raw)).toEqual({
      railWidth: LIMITS.railWidth.min,
      chatWidth: 500,
      outputHeight: LIMITS.outputHeight.max,
    });
  });
});
