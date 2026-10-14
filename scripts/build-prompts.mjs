// Turns the Markdown files in prompts/ into server/prompts.generated.ts, so the
// server can import them as text. (Cloudflare's bundler can't import .md files.)
// Runs automatically before test, typecheck, build and eval:judge.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'prompts', name), 'utf8');

const prompts = {
  TUTOR_SYSTEM: read('tutor-system.md'),
  JUDGE_SYSTEM: read('judge-system.md'),
  CLEARANCE_RULES: read('clearance-rules.md'),
  RETRY_NOTE: read('retry-note.md').trim(),
  JEV_QUESTIONS: read('jev-questions.md'),
};

const body = Object.entries(prompts)
  .map(([name, text]) => `export const ${name} = ${JSON.stringify(text)};`)
  .join('\n\n');

writeFileSync(
  join(root, 'server', 'prompts.generated.ts'),
  `// Generated from prompts/*.md by scripts/build-prompts.mjs. Don't edit; edit the .md files.\n\n${body}\n`,
);
