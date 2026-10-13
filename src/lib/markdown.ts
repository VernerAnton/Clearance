// A small Markdown reader for tutor replies: paragraphs, lists, quotes, fenced code,
// and **bold**, *italic* and `code` inside text. It returns plain data that React
// renders, so model output is never inserted as HTML.

export type Inline = { type: 'text' | 'code' | 'strong' | 'em'; text: string };

export type Block =
  | { type: 'p'; inline: Inline[] }
  | { type: 'heading'; inline: Inline[] }
  | { type: 'quote'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; lang: string; code: string };

const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|\b_([^_\s](?:[^_]*[^_\s])?)_\b/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) out.push({ type: 'code', text: m[2].trim() || m[2] });
    else if (m[3] ?? m[4]) out.push({ type: 'strong', text: (m[3] ?? m[4])! });
    else out.push({ type: 'em', text: (m[5] ?? m[6])! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
/** A closing fence uses the same character as the opening one, at least as many times. */
function closesFence(line: string, opening: string): boolean {
  const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return !!m && m[1][0] === opening[0] && m[1].length >= opening.length;
}

const LIST_ITEM = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const endParagraph = () => {
    if (para.length) blocks.push({ type: 'p', inline: parseInline(para.join('\n')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      endParagraph();
      const marker = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !closesFence(lines[i], marker)) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang: fence[2], code: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      endParagraph();
      blocks.push({ type: 'heading', inline: parseInline(heading[1]) });
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      endParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      i--;
      blocks.push({ type: 'quote', inline: parseInline(quote.join('\n')) });
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      endParagraph();
      const ordered = /\d/.test(item[1]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(parseInline(m[2]));
        i++;
      }
      i--;
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    para.push(line);
  }
  endParagraph();
  return blocks;
}
