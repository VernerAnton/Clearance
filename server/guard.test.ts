import { describe, expect, it } from 'vitest';
import { codeCheck, findFences } from './guard.ts';

describe('findFences', () => {
  it('finds blocks with their language and position', () => {
    const text = 'Hi\n```python\nprint(1)\n```\nBye';
    const [fence] = findFences(text);
    expect(fence).toMatchObject({ lang: 'python', body: 'print(1)' });
    expect(text.slice(fence.start, fence.end)).toBe('```python\nprint(1)\n```\n');
  });

  it('counts an unclosed block, tilde fences and untagged blocks', () => {
    expect(findFences('```\nx = 1')).toHaveLength(1);
    expect(findFences('~~~py\nx\n~~~')[0].lang).toBe('py');
    expect(findFences('a\n```\nb\n```\nc\n```sql\nd\n```')).toHaveLength(2);
  });

  it('ignores inline code', () => {
    expect(findFences('Look at `n % 2` here')).toHaveLength(0);
  });
});

describe('codeCheck', () => {
  const block = (lang: string) => `Look:\n\`\`\`${lang}\nfor each n\n\`\`\``;

  it('blocks any code block at Clearance 1 and 2', () => {
    expect(codeCheck(block('python'), 1, true)).toMatch(/Clearance 1/);
    expect(codeCheck(block('pseudo'), 2, true)).toMatch(/Clearance 2/);
    expect(codeCheck(block(''), 1, true)).not.toBeNull();
  });

  it('allows only pseudo blocks at Clearance 3', () => {
    expect(codeCheck(block('pseudo'), 3, true)).toBeNull();
    expect(codeCheck(block('python'), 3, true)).toMatch(/pseudo/);
    expect(codeCheck(block(''), 3, true)).toMatch(/pseudo/);
  });

  it('allows code at Clearance 4-5 and in Explain mode', () => {
    expect(codeCheck(block('python'), 4, true)).toBeNull();
    expect(codeCheck(block('python'), 5, true)).toBeNull();
    expect(codeCheck(block('python'), 1, false)).toBeNull();
  });

  it('passes plain text and inline code', () => {
    expect(codeCheck('**Signal: 4/5** What does `n % 2` give you?', 1, true)).toBeNull();
  });
});
