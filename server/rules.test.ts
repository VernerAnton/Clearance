import { describe, expect, it } from 'vitest';
import { CLEARANCE_RULES } from './prompts.generated.ts';
import { parseClearanceRules } from './rules.ts';

describe('parseClearanceRules', () => {
  it('reads a rule for every level and for Explain from prompts/clearance-rules.md', () => {
    const rules = parseClearanceRules(CLEARANCE_RULES);
    expect(Object.keys(rules.levels)).toEqual(['1', '2', '3', '4', '5']);
    expect(rules.levels[3]).toContain('pseudo');
    expect(rules.explain).toContain('No clearance levels');
  });

  it('complains when a level is missing', () => {
    expect(() => parseClearanceRules('1: a\n2: b\nexplain: c')).toThrow(/level 3/);
  });
});
