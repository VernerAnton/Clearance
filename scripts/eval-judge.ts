// npm run eval:judge [-- --model provider/model-name]
// Runs the judge over evals/judge-cases.jsonl and prints accuracy and every miss.
// Uses JUDGE_MODEL and the API keys from .dev.vars; --model tries another judge.
// "typesafe:jev-latest" tries TypeSafe's Jev (needs TYPESAFE_API_KEY).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JevEnv } from '../server/jev.ts';
import { makeJudge } from '../server/judges.ts';
import type { Env } from '../server/openrouter.ts';

interface Case {
  id: string;
  level: number;
  learner_message: string;
  code: string;
  draft: string;
  expected_leaks: boolean;
  note?: string;
}

const root = join(import.meta.dirname, '..');

function readDevVars(): Env & JevEnv {
  const path = join(root, '.dev.vars');
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env: Env & JevEnv = { ...readDevVars(), ...process.env };
const flag = process.argv.indexOf('--model');
const model = flag > -1 ? process.argv[flag + 1] : env.JUDGE_MODEL;
if (!model) {
  console.error('No judge model. Set JUDGE_MODEL in .dev.vars, or pass --model provider/model-name.');
  process.exit(1);
}

const cases: Case[] = readFileSync(join(root, 'evals', 'judge-cases.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const judge = makeJudge(env, model);
console.log(`Judge model: ${model}\nCases: ${cases.length}\n`);

const misses: { c: Case; got: string }[] = [];
let unreadable = 0;
for (const c of cases) {
  const lang = /^\s*(select|create|insert|with)\b/i.test(c.code) ? 'sql' : 'python';
  let raw: string;
  let verdict;
  try {
    ({ raw, verdict } = await judge({ level: c.level, learnerMessage: c.learner_message, code: c.code, lang, draft: c.draft }));
  } catch (err) {
    console.error(`Stopped: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  if (!verdict.parsed) unreadable++;
  const right = verdict.leaks === c.expected_leaks;
  console.log(`${right ? '✓' : '✗'} ${c.id}${verdict.parsed ? '' : ' (unreadable answer)'}`);
  if (!right) misses.push({ c, got: verdict.parsed ? `${verdict.leaks ? 'leaks' : 'passes'}: ${verdict.why}` : `unreadable: ${raw.slice(0, 200)}` });
}

const correct = cases.length - misses.length;
console.log(`\nAccuracy: ${correct}/${cases.length} (${Math.round((100 * correct) / cases.length)}%)`);
if (unreadable) console.log(`Unreadable answers: ${unreadable} (counted as "passes")`);
for (const { c, got } of misses) {
  console.log(`\n✗ ${c.id} (Clearance ${c.level}): expected ${c.expected_leaks ? 'leaks' : 'passes'}, judge said ${got}`);
  if (c.note) console.log(`  note: ${c.note}`);
  console.log(`  draft: ${c.draft.replace(/\n/g, '\n         ')}`);
}
