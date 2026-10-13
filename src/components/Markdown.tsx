import { parseMarkdown, type Inline } from '../lib/markdown';

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <code key={i}>{p.text}</code>
        ) : p.type === 'strong' ? (
          <strong key={i}>{p.text}</strong>
        ) : p.type === 'em' ? (
          <em key={i}>{p.text}</em>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

/** Renders a tutor reply. Built from React elements, so nothing in it can run as HTML. */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {parseMarkdown(text).map((b, i) => {
        switch (b.type) {
          case 'p':
            return (
              <p key={i}>
                <InlineText parts={b.inline} />
              </p>
            );
          case 'heading':
            return (
              <p key={i}>
                <strong>
                  <InlineText parts={b.inline} />
                </strong>
              </p>
            );
          case 'quote':
            return (
              <blockquote key={i}>
                <InlineText parts={b.inline} />
              </blockquote>
            );
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul';
            return (
              <List key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineText parts={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'code':
            return (
              <pre key={i} className="code-block">
                {b.lang && <span className="lang">{b.lang}</span>}
                <code>{b.code}</code>
              </pre>
            );
        }
      })}
    </>
  );
}
