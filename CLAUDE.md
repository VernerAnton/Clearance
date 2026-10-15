# Clearance// — notes for Claude Code

Clearance is a coding tutor web app. A learner writes Python or SQL in an in-browser editor, runs it, and asks an AI tutor for help. The learner picks a clearance level (1-5) that sets how much help the tutor may give. **The app enforces the level in code.** The tutor model is never trusted to decide or remember it.

`SPEC.md` is the source of truth for what to build. `reference/mockup.html` shows the intended layout and behavior (its tutor replies are canned, and it runs Python with Skulpt; the real app uses Pyodide).

## How to work

- Build the phases of `SPEC.md` in order. When a phase's checklist is done, tick it in `SPEC.md` and commit, then go straight on to the next phase. Test each phase yourself (unit tests, and the app in a browser) before moving on.
- **Stop at the end of Phase 6** (the app works end to end) for the user to try it. Phase 7 (polish) is driven by what the user finds while actually using the app, and Phase 8 (deploy) needs their accounts, so both wait for them.
- At a stop, summarize what changed and how to try it, including anything the user must set up (such as `.dev.vars`).
- The user is learning to code. Explain decisions in plain language, briefly. Don't assume they know a tool's internals.
- If something in `SPEC.md` turns out to be impossible or a bad idea, say so and propose an alternative before building around it.
- Keep dependencies few. Ask before adding a large one that isn't named in the spec.
- Commit at the end of each phase with a clear message.

## Stack (decided)

- **Frontend:** Vite + TypeScript + React. Plain CSS with design tokens (CSS variables). No UI kit.
- **Editor:** CodeMirror 6 with `@codemirror/lang-python` and `@codemirror/lang-sql`.
- **Python:** Pyodide in a Web Worker, self-hosted from this site (not a CDN).
- **SQL:** sql.js (SQLite in WebAssembly), self-hosted.
- **Backend:** a Cloudflare Worker (`server/worker.ts`) that answers `/api/*` and serves the built site as static assets. Model calls go through OpenRouter's OpenAI-compatible chat API. (The spec first said Pages Functions; the project was created as a Worker, so the app runs as one.)
- **Hosting:** local first (`npm start`, i.e. `wrangler dev`), then the Cloudflare Worker `clearance`, deployed by Workers Builds on every push to the working branch. Cloudflare Access is postponed. Don't touch other projects in the Cloudflare account.
- **Tests:** Vitest for pure logic (guard, message building, mission parsing, judge parsing).

## Rules that must not be broken

1. **The level lives in app state.** The UI sets it, the server validates it, and it resets to 1 after every sent message. Nothing the model says can change it.
2. **The API key never reaches the browser.** All model calls happen in the Worker. Secrets come from `.dev.vars` locally and Cloudflare secrets in production.
3. **The tutor never edits existing tabs.** The only way model output enters the editor is a new tab created from a mission in Challenge mode.
4. **Every tutor reply passes the guard pipeline** (code check, then judge at levels 1-2, retries, fallback) before the user sees it. See SPEC.md, Phase 5.
5. **Self-host Pyodide and sql.js.** The page is cross-origin isolated (COOP/COEP headers) so `input()` works, and those headers block most CDN files.
6. **Prompts live in `prompts/`** as Markdown and are imported at build time. Don't inline prompt text in code.

## Commands (fill in as they're created)

- `npm install`: install dependencies (once, and after pulling changes to `package.json`)
- `npm start`: build, then run the Worker locally (page + tutor API) at http://localhost:8788. Needs `.dev.vars`.
- `npm run dev`: frontend only, at http://localhost:5173. `/api` calls are forwarded to port 8788, so run `npm start` alongside it for the tutor.
- `npm run build`: typecheck, then build the site into `dist/`
- `npx wrangler deploy --dry-run`: check that a deploy would work, without uploading (it builds first, see `[build]` in `wrangler.toml`)
- `npm test`: unit tests (Vitest)
- `npm run prompts`: regenerate `server/prompts.generated.ts` from `prompts/*.md` (runs automatically before test, typecheck and build)
- `npm run eval:judge`: run the judge over `evals/judge-cases.jsonl` and print accuracy and misses (`-- --model provider/name` to try another model, `-- --model typesafe:jev-latest` for Jev; needs `.dev.vars`)
- `npm run typecheck`: TypeScript check only (browser code, then `vite.config.ts` + `scripts/`)

## Layout of the code

- `shared/`: code used by both the browser and the server (modes, clearance levels).
- `src/lib/`: pure logic (tabs and their storage, settings, panel sizes). Unit tests sit next to it as `*.test.ts`.
- `src/python/`: the Python runner. `python.worker.ts` runs Pyodide off the main thread, `runner.py` runs the learner's code and trims tracebacks, `PythonRunner.ts` is the page side (input(), time limit, Stop).
- `src/sql/`: the SQL runner. `sql.worker.ts` runs sql.js on a fresh database per run, `SqlRunner.ts` adds the time limit and Stop.
- `src/hooks/useCodeRunner.ts`: runs tabs and keeps each tab's output, last run and error line.
- `src/components/`: React components (`Rail`, `Workspace`, `CodeEditor`, `Chat`, `Splitter` for draggable dividers, `SettingsDialog` for the settings popup).
- `server/worker.ts`: the Worker entry: `/api/chat`, `/api/health`, and the static site for everything else.
- `server/`: the backend logic (validation, message building, OpenRouter calls, guard, missions), with unit tests. The judge is pluggable: `judges.ts` picks a chat-model judge (`judge.ts`) or TypeSafe's Jev (`jev.ts`, questions in `prompts/jev-questions.md`) from `JUDGE_MODEL`. `prompts.generated.ts` is generated, not committed.
- `shared/api.ts`: the /api/chat request and response types, used by both sides.
- `shared/models.ts`: the models the settings popup offers. The server only accepts these (the site is public, so visitors must not be able to pick any model on the key). `GET /api/config` tells the popup the server's default models and whether the Jev key exists.
- `scripts/vite-plugin-pyodide.ts`: serves Pyodide from `node_modules/pyodide` in dev and copies it to `dist/pyodide/` on build. Pyodide is never committed.
- `public/manifest.webmanifest`, `public/icons/`, `public/sw.js`: the PWA (installable app). The service worker is network-first: online you always get the newest files, the saved copy is only an offline fallback, and `/api` is never saved. It's only registered in the built app, not in `npm run dev`. The PNG icons are rendered from `public/icons/*.svg`.
- `public/_headers`: COOP/COEP headers for Cloudflare (Workers static assets read this file). `vite.config.ts` sets the same headers for dev and preview.
