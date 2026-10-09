# Clearance//

A coding tutor that helps you learn by doing. You choose how much help it gives with a clearance level from 1 to 5, and the app, not the AI, enforces it. It has a built-in editor that runs Python and SQL in the browser, so the tutor sees your code and your errors directly.

## What's in this folder

| File | What it is |
|---|---|
| `CLAUDE.md` | Working rules for Claude Code. It reads this automatically. |
| `SPEC.md` | What to build, in phases, with a checklist for each. |
| `prompts/tutor-system.md` | The tutor's system prompt. |
| `prompts/judge-system.md` | The judge's system prompt (checks drafts for leaked answers). |
| `evals/judge-cases.jsonl` | Labeled examples for testing the judge. Add your own real failures here. |
| `reference/mockup.html` | The clickable mockup. Open it in a browser to see the intended layout and behavior. |
| `.dev.vars.example` | The secrets the backend needs. Copy to `.dev.vars` and fill in. |

## How to start with Claude Code

1. Put this folder somewhere on your computer (or push it to a new GitHub repo first and clone it).
2. Open a terminal in the folder and run `git init` if it isn't a repo yet.
3. Start Claude Code in the folder and say:

   > Read CLAUDE.md and SPEC.md, then start Phase 1. Stop when Phase 1 is done so I can check it.

4. Review each phase in the browser before saying "continue to the next phase".

You'll need an OpenRouter account and API key before Phase 4. Set a monthly spending limit there.
