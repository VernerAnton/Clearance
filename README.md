# Clearance//

A coding tutor that helps you learn by doing. You choose how much help it gives with a clearance level from 1 to 5, and the app, not the AI, enforces it. It has a built-in editor that runs Python and SQL in the browser, so the tutor sees your code and your errors directly.

## What's in this folder

| File | What it is |
|---|---|
| `CLAUDE.md` | Working rules for Claude Code, and a map of the code. It reads this automatically. |
| `SPEC.md` | What to build, in phases, with a checklist for each. |
| `prompts/tutor-system.md` | The tutor's system prompt. |
| `prompts/judge-system.md` | The judge's system prompt (checks drafts for leaked answers). |
| `prompts/clearance-rules.md`, `prompts/retry-note.md` | The one-line rule per clearance level, and the note sent to the tutor when a draft is blocked. |
| `evals/judge-cases.jsonl` | Labeled examples for testing the judge. Add your own real failures here. |
| `reference/mockup.html` | The clickable mockup. Open it in a browser to see the intended layout and behavior. |
| `.dev.vars.example` | The secrets the backend needs. Copy to `.dev.vars` and fill in. |

## Running it on your computer

You need [Node.js](https://nodejs.org) 22.18 or newer, and an [OpenRouter](https://openrouter.ai) account with an API key. Set a monthly spending limit on OpenRouter.

1. Install the dependencies (once, and again after pulling changes):

   ```
   npm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars` and fill it in: your OpenRouter API key, and the model IDs for the tutor and the judge (for example `provider/model-name`, as listed on openrouter.ai/models). `.dev.vars` stays on your computer; git ignores it.

3. Start the app:

   ```
   npm start
   ```

   Then open http://localhost:8788. This builds the site and serves it together with the tutor's server.

To compare judge models, run `npm run eval:judge` (or `npm run eval:judge -- --model provider/model-name`). It checks the judge against `evals/judge-cases.jsonl` and lists every case it got wrong.

## Building it with Claude Code

`SPEC.md` lists the phases and what each one does. `CLAUDE.md` holds the working rules Claude Code follows, including where to stop for your review.
