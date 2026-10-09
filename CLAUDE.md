# Clearance// — notes for Claude Code

Clearance is a coding tutor web app. A learner writes Python or SQL in an in-browser editor, runs it, and asks an AI tutor for help. The learner picks a clearance level (1-5) that sets how much help the tutor may give. **The app enforces the level in code.** The tutor model is never trusted to decide or remember it.

`SPEC.md` is the source of truth for what to build. `reference/mockup.html` shows the intended layout and behavior (its tutor replies are canned, and it runs Python with Skulpt; the real app uses Pyodide).

## How to work

- Build one phase of `SPEC.md` at a time. When a phase's checklist is done, tick it in `SPEC.md`, summarize what changed and how to try it, and **stop** for the user to review.
- The user is learning to code. Explain decisions in plain language, briefly. Don't assume they know a tool's internals.
- If something in `SPEC.md` turns out to be impossible or a bad idea, say so and propose an alternative before building around it.
- Keep dependencies few. Ask before adding a large one that isn't named in the spec.
- Commit at the end of each phase with a clear message.

## Stack (decided)

- **Frontend:** Vite + TypeScript + React. Plain CSS with design tokens (CSS variables). No UI kit.
- **Editor:** CodeMirror 6 with `@codemirror/lang-python` and `@codemirror/lang-sql`.
- **Python:** Pyodide in a Web Worker, self-hosted from this site (not a CDN).
- **SQL:** sql.js (SQLite in WebAssembly), self-hosted.
- **Backend:** Cloudflare Pages Functions (`functions/api/*`). Model calls go through OpenRouter's OpenAI-compatible chat API.
- **Hosting:** local first (`wrangler pages dev`), then Cloudflare Pages + Cloudflare Access.
- **Tests:** Vitest for pure logic (guard, message building, mission parsing, judge parsing).

## Rules that must not be broken

1. **The level lives in app state.** The UI sets it, the server validates it, and it resets to 1 after every sent message. Nothing the model says can change it.
2. **The API key never reaches the browser.** All model calls happen in Pages Functions. Secrets come from `.dev.vars` locally and Cloudflare secrets in production.
3. **The tutor never edits existing tabs.** The only way model output enters the editor is a new tab created from a mission in Challenge mode.
4. **Every tutor reply passes the guard pipeline** (code check, then judge at levels 1-2, retries, fallback) before the user sees it. See SPEC.md, Phase 5.
5. **Self-host Pyodide and sql.js.** The page is cross-origin isolated (COOP/COEP headers) so `input()` works, and those headers block most CDN files.
6. **Prompts live in `prompts/`** as Markdown and are imported at build time. Don't inline prompt text in code.

## Commands (fill in as they're created)

- `npm run dev`: frontend only
- `npx wrangler pages dev`: frontend + functions, with `.dev.vars`
- `npm test`: unit tests
