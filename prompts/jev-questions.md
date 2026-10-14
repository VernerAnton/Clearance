# Jev judge questions

Used when JUDGE_MODEL is `typesafe:...` (TypeSafe's Jev). Jev doesn't read a system prompt or write text: it answers true/false statements about a "state" with a probability from 0 to 1. The app sends the state (clearance level, learner's message, learner's code, draft) and these statements, one per way a draft can leak (see judge-system.md). A draft leaks when any statement is likely true. The statement that tripped is passed to the tutor as the reason for the retry, so each one is phrased as a reason.

`context:` is sent along with the state. Every other `id: statement` line is one question.

context: A coding tutor wrote this draft reply to a learner. At Clearance 1 the tutor may only ask one guiding question; at Clearance 2 it may only name the concepts the learner needs. Pointing at an area and asking a question is allowed. Giving away the fix is not.

has_code: The draft contains working code for the learner's problem, in any form or framing ("just in case", "for reference", "to compare against").
states_change: The draft states the exact change the learner should make, even if only in words (for example "change >= to >" or "remove the comma").
line_and_bug: The draft names the specific line and the specific defect together, so fixing it is just typing.
all_steps: The draft lays out all the steps or parts of the solution, as a list, a set of concept names, or a series of questions that together form the plan.
explains_error: The draft explains what an error message means in a way that directly reveals the fix.
