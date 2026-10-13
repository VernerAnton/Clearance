import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('**Signal: 4/5** Look at `n % 2` and *why*.')).toEqual([
      { type: 'strong', text: 'Signal: 4/5' },
      { type: 'text', text: ' Look at ' },
      { type: 'code', text: 'n % 2' },
      { type: 'text', text: ' and ' },
      { type: 'em', text: 'why' },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves lone stars and maths alone', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }]);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs, lists and code blocks', () => {
    const blocks = parseMarkdown('Intro line\nsecond line\n\n- one\n- **two**\n\n```pseudo\nfor each n:\n    keep it\n```\nAfter');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'list', 'code', 'p']);
    expect(blocks[0]).toEqual({ type: 'p', inline: [{ type: 'text', text: 'Intro line\nsecond line' }] });
    expect(blocks[2]).toEqual({ type: 'code', lang: 'pseudo', code: 'for each n:\n    keep it' });
  });

  it('keeps an unclosed code block instead of losing it', () => {
    expect(parseMarkdown('```python\nprint(1)')).toEqual([{ type: 'code', lang: 'python', code: 'print(1)' }]);
  });

  it('reads numbered lists and quotes', () => {
    const blocks = parseMarkdown('1. first\n2. second\n> quoted');
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: true });
    expect(blocks[1]).toMatchObject({ type: 'quote' });
  });
});
