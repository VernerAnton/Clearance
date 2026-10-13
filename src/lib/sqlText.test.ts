import { describe, expect, it } from 'vitest';
import { lineAt, tableText } from './sqlText';

describe('lineAt', () => {
  const code = 'CREATE TABLE t (a);\n\n  SELECT nope\nFROM t;';

  it('finds the line where the failing statement starts, skipping blank space', () => {
    const offset = code.indexOf(';') + 1; // what sql.js reports: just after the previous statement
    expect(lineAt(code, offset)).toBe(3);
  });

  it('handles the start and the end of the code', () => {
    expect(lineAt(code, 0)).toBe(1);
    expect(lineAt(code, 999)).toBe(4);
  });
});

describe('tableText', () => {
  it('cuts long tables short for the tutor', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [String(i)]);
    const text = tableText({ columns: ['n'], rows, rowCount: 1000 }, 2);
    expect(text).toBe('n\n0\n1\n… 998 more rows\n(1000 rows)\n');
  });

  it('says "1 row", not "1 rows"', () => {
    expect(tableText({ columns: ['x'], rows: [['a']], rowCount: 1 })).toBe('x\na\n(1 row)\n');
  });
});
