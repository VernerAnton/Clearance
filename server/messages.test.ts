import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '../shared/api.ts';
import { buildTutorMessages, contextHeader, fenceFor } from './messages.ts';
import { CLEARANCE_RULES } from './prompts.generated.ts';
import { parseClearanceRules } from './rules.ts';

const rules = parseClearanceRules(CLEARANCE_RULES);

const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  mode: 'debug',
  level: 1,
  message: 'why does my output include 0?',
  history: [],
  activeTab: { title: 'Filter positives', lang: 'python', code: 'print(1)\n', fromMission: true },
  lastRun: { output: '[5, 0, 7, 2]\n', endedWithError: false },
  ...over,
});

describe('contextHeader', () => {
  it('matches the format in SPEC.md section 4', () => {
    const header = contextHeader(request({ lastRun: { output: 'Traceback…\n', endedWithError: true } }), rules);
    expect(header).toBe(
      [
        '[Mode: Debug | Clearance 1: One guiding question. At most 4 sentences. No code of any kind.]',
        '[Open tab: Filter positives (python, mission)]',
        '```python',
        'print(1)',
        '```',
        '[Last run output (ended with an error)]',
        'Traceback…',
      ].join('\n'),
    );
  });

  it('says when the tab has not been run, and leaves out "mission" for own tabs', () => {
    const header = contextHeader(
      request({ lastRun: null, activeTab: { title: 'q.sql', lang: 'sql', code: 'SELECT 1;', fromMission: false } }),
      rules,
    );
    expect(header).toContain('[Open tab: q.sql (sql)]\n```sql\nSELECT 1;\n```');
    expect(header.endsWith('[Not run yet]')).toBe(true);
  });

  it('uses the level the app sent, and the Explain rule in Explain mode', () => {
    expect(contextHeader(request({ level: 3 }), rules)).toContain('| Clearance 3: Pseudocode only');
    const explain = contextHeader(request({ mode: 'explain', level: 4 }), rules);
    expect(explain).toContain('[Mode: Explain | No clearance levels.');
    expect(explain).not.toContain('Clearance 4');
  });

  it('marks an empty output', () => {
    expect(contextHeader(request({ lastRun: { output: '', endedWithError: false } }), rules)).toContain(
      '[Last run output]\n(no output)',
    );
  });
});

describe('fenceFor', () => {
  it('uses a fence longer than any backticks in the code, so code cannot break out', () => {
    expect(fenceFor('x = 1')).toBe('```');
    expect(fenceFor('s = """\n```\n"""')).toBe('````');
  });
});

describe('buildTutorMessages', () => {
  it('sends the system prompt, the plain history, then the message with its header', () => {
    const msgs = buildTutorMessages(
      request({ history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }),
      'SYSTEM',
      rules,
    );
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[0].content).toBe('SYSTEM');
    expect(msgs[1].content).toBe('hi');
    expect(msgs[3].content.startsWith('[Mode: Debug | Clearance 1:')).toBe(true);
    expect(msgs[3].content.endsWith('\n\nwhy does my output include 0?')).toBe(true);
  });
});
