# Clearance rules

The app puts one of these rules in the header of every learner message (`[Mode: Debug | Clearance 1: <rule>]`), and in the note it sends when the guard rejects a draft. One line per level; `explain` is used in Explain mode, which has no levels.

1: One guiding question. At most 4 sentences. No code of any kind.
2: Name the concepts only, without showing how to use them. At most 4 sentences. No code of any kind.
3: Pseudocode only, in a block tagged pseudo. No real syntax.
4: Working code for a different, unrelated problem. Never use the learner's names, data or context.
5: The full working solution, with brief comments on the non-obvious parts.
explain: No clearance levels. Explain plainly first, then with technical terms.
