# Clearance// — build spec

## 1. What it is

A personal coding tutor. Three panels: a control rail (mode and clearance level), a code workspace (tabs, editor, Run, output), and the tutor chat. The tutor sees the open tab and its last output with every message. Help is limited by the clearance level the learner picks.

### Why it's built this way

An earlier version was a single system prompt in a chat app. The model kept breaking its own rules: it raised the help level on its own when the learner was frustrated, when a task looked big, or "just in case", and in long chats the rules faded. So this app moves the rules the model kept breaking into code:

- The app owns the level and attaches it to every message.
- A guard checks each draft before the learner sees it, and retries or falls back if it leaks.
- Each mission lives in its own tab, and the chat can be cleared, so context stays short and fresh.

The prompt only has to cover what code can't.

## 2. Vocabulary and theme

Cyberpunk / sci-fi, but readable. Every themed term shows a plain description beside it.

| Concept | UI name | Plain description shown |
|---|---|---|
| Level 1 | Clearance 1: Probe | One guiding question |
| Level 2 | Clearance 2: Intel | Names the concepts you need |
| Level 3 | Clearance 3: Blueprint | Pseudocode, no real syntax |
| Level 4 | Clearance 4: Simulation | Working code for a different problem |
| Level 5 | Clearance 5: Root access | Full solution |
| Reset after a message | "Clearance reset" | Back to 1 for the next message |
| Direction meter | Signal strength (1-5) | How close the approach is |
| Guard blocked a draft | "Spoiler intercepted" | |
| App fallback reply | "Transmission blocked" | |
| Challenge | Mission | Opens in its own tab |
| Start new problem | New mission | Clears the chat, keeps tabs |

Visual direction: dark code area (as in the mockup) with a neon accent for the clearance ladder. Light and dark themes both supported. Use the mockup's structure as a starting point, not as a pixel spec.

## 3. Modes

Debug, Planning, Review, Explain, Challenge. Behavior is defined in `prompts/tutor-system.md`. Explain has no levels. Mode is chosen in the UI and sent with every message.

## 4. Message flow

1. The learner sends a message.
2. The client sends `{ mode, level, message, history, activeTab: { title, lang, code, fromMission }, lastRun: { output, endedWithError } | null }` to `POST /api/chat`.
3. The server validates mode and level, then builds the user turn with a context header:
   ~~~
   [Mode: Debug | Clearance 1: One guiding question. At most 4 sentences. No code of any kind.]
   [Open tab: Filter positives (python, mission)]
   ```python
   ...code...
   ```
   [Last run output (ended with an error)]
   ...output, last 1500 characters...

   <the learner's message>
   ~~~
4. The server runs the guard pipeline (Phase 5) and returns `{ reply, attempts, intercepted: [...], fallback, mission? }`.
5. The client shows the reply, creates a mission tab if there is one, and resets the level to 1.

History is the chat since the last "New mission", without the context headers of older turns (only the current turn carries code and output, to keep requests small).

## 5. Phases

Tick items as they're done. Stop after each phase for review.

### Phase 1: Layout and editor
- [x] Vite + React + TypeScript project, with Pages Functions folder and wrangler config.
- [x] Three-panel layout: rail, workspace, chat. Desktop first; small screens must not break, but the final mobile layout is still undecided (see Open questions).
- [x] Rail: mode selector and clearance ladder 1-5 with themed names and plain descriptions. Ladder disabled in Explain mode.
- [x] Workspace: tabs (Python or SQL badge, mission marker, close button, "+ Python", "+ SQL"), CodeMirror 6 editor with syntax highlighting for both languages, Tab inserts 4 spaces, Ctrl/Cmd+Enter runs.
- [x] Live linting (underlining errors while typing) is **off**. Add a setting for it, default off.
- [x] Tabs and their code persist in localStorage. Start with one example Python tab and one SQL tab.
- [x] Chat panel with a placeholder reply (no backend yet).
- [x] Added after review: settings for autocomplete and auto-close brackets (both default off), and a theme choice (follow the computer, light, dark).
- [x] Added after review: drag the dividers to resize the three columns and the output area. Sizes are saved; double-click a divider to reset it. Scroll bars are hidden.

### Phase 2: Python runner
- [x] Pyodide in a Web Worker, files served from this site.
- [x] `public/_headers` and the Vite dev server set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- [x] Terminal panel under the editor shows stdout and stderr as they happen.
- [x] `input()` works inline in the terminal: prompt appears, learner types, Enter continues the program. Implement with SharedArrayBuffer + Atomics so `input()` blocks in the worker.
- [x] If the page is not cross-origin isolated, fall back to an "Input" box filled before Run, and show a small notice.
- [x] Time limit of 5 seconds of running time, **not counting time spent waiting for input**. On timeout show "Stopped: ran longer than 5 seconds. Check for a loop that never ends."
- [x] Stop button interrupts a run (Pyodide interrupt buffer; terminate and restart the worker if that fails).
- [x] On an error, show the traceback and mark the error line in the editor (gutter marker), cleared on the next edit.
- [x] Store the last run's output per tab for the tutor.

### Phase 3: SQL runner
- [x] sql.js (WASM), self-hosted. Fresh in-memory database on every run, so a tab's CREATE/INSERT statements run together with the query.
- [x] Results shown as tables (row count under each), errors in the same panel.
- [x] Last run's output stored per tab as plain text.

### Phase 4: Tutor backend
- [ ] `POST /api/chat` in Pages Functions. Reads `OPENROUTER_API_KEY`, `TUTOR_MODEL`, `JUDGE_MODEL` from env.
- [ ] Builds the request exactly as in section 4 with `prompts/tutor-system.md` as the system prompt.
- [ ] Validates input; rejects unknown modes and levels outside 1-5.
- [ ] Client: level resets to 1 after each send, with a short "Clearance reset" note. Message shows a "📎 tab + last output" chip so the learner knows what was sent.
- [ ] "New mission" clears chat history (tabs stay).
- [ ] Clear error messages in the chat when the API fails (no key, rate limit, network).
- [ ] Unit tests for the message builder.

### Phase 5: Guard pipeline
Runs on the server for every reply.
- [ ] **Code check** (free, always): at Clearance 1-2, any fenced code block fails. At Clearance 3, any fence not tagged `pseudo` fails. Exception: the mission block in Challenge mode (Phase 6).
- [ ] **Judge** (Clearance 1-2 only): call `JUDGE_MODEL` with `prompts/judge-system.md`, sending the level, the learner's message, the open tab's code and the draft. Expect JSON `{ "leaks": boolean, "why": string }`. Treat unparseable judge output as a pass and log it.
- [ ] **Retry**: on a failure, append a system note ("Your previous draft was rejected. {why} Rewrite it strictly at Clearance N: {rule}") and ask again. At most 2 retries.
- [ ] **Fallback**: if all 3 attempts fail, reply with a fixed app message: "Transmission blocked. What did you expect to happen, and what happened instead?"
- [ ] Response includes intercepted drafts. The UI shows "Spoiler intercepted" with the count; the draft text is only visible in a debug panel (toggle in settings, off by default).
- [ ] Debug panel ("What the tutor receives") shows the last tutor and judge requests, as in the mockup.
- [ ] Unit tests for the code check and judge-response parsing.
- [ ] Script `npm run eval:judge` runs the judge over `evals/judge-cases.jsonl` and prints accuracy and every miss.

### Phase 6: Missions
- [ ] In Challenge mode, the tutor writes a mission as one fenced block tagged `python` or `sql`, whose first line is `# Mission: <title>` (or `-- Mission: <title>` for SQL).
- [ ] The server extracts it and returns `mission: { title, lang, code }`. The code check skips that block. The rest of the reply is still checked normally.
- [ ] The client opens it in a **new** tab marked as a mission (duplicate titles get a number). Model output never writes into an existing tab.
- [ ] The chat shows "Mission opened in a new tab" instead of the code.
- [ ] No hidden tests and no Check button. The learner runs the code and judges the result.

### Phase 7: Theme and polish
- [ ] Clearance vocabulary everywhere (section 2), neon accent on the ladder, both themes checked.
- [ ] Keyboard focus visible everywhere; `prefers-reduced-motion` respected.
- [ ] Settings: live linting, debug panel. (Live linting, autocomplete, auto-close brackets and theme exist since Phase 1.)

### Phase 8: Deploy
- [ ] GitHub repo connected to Cloudflare Pages; push deploys automatically.
- [ ] Secrets set in Cloudflare, not committed.
- [ ] Cloudflare Access in front of the whole site (email one-time code).
- [ ] Spending limit set on OpenRouter.
- [ ] Check in production that the page is cross-origin isolated (`crossOriginIsolated === true`) and `input()` works.

## 6. Not building (decided)

- Check button or hidden tests for missions.
- Structured mission format beyond the title line.
- A real shell or terminal for anything other than running Python.
- Languages other than Python and SQL (for now).
- A "Still to fix" checklist panel and a pinned "Current task" box (the open tab carries the task).

## 7. Open questions

- **Models.** Which tutor and judge models. Pick by running `npm run eval:judge` against candidates, and by trying the tutor in long chats. The judge can be a small, cheap model; it should read code well and return clean JSON.
- **Small screens.** The learner is designing the mobile layout. Until then, keep panels stacking without horizontal scrolling.
- **Who uses it.** Assumed single user. If others will use it, add per-user rate limits.
