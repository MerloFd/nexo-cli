# Backlog specs

Requirements and plans for work that was discussed but deliberately not
built as part of implementing the multi-agent adapter, the updated skill,
`scan --redact`, and the Mac/Linux terminal backends. Each folder follows
the [spec-kit](https://github.com/github/spec-kit) `spec.md` / `plan.md`
structure (fetched from the official templates, not hand-guessed).

None of these are commitments or a roadmap with dates — they exist so a
decision already made (or a question already raised) doesn't need to be
re-derived from scratch in a future conversation.

| # | Title | What's blocking it |
| --- | --- | --- |
| [001](./001-shadow-ai-oversight/spec.md) | Shadow AI oversight for teams | Architecture undecided — whether nexo builds a collector or just stays an emitter other tooling consumes |
| [002](./002-semantic-content-classifier/spec.md) | Semantic content classifier (Laya) | ~1.7 GB model + native runtime dependency, disproportionate for the core CLI; no lighter option evaluated |
| ~~[003](./003-codex-redact/spec.md)~~ | ~~Codex support for `scan --redact`~~ | **Shipped 2026-10-15** - both the rollout and the `threads` text columns are cleaned, gated by a real SQLite write lock instead of an mtime guess |
| [004](./004-broader-agent-coverage/spec.md) | Broader terminal agent coverage | No chosen next agent (Track A died with the opencode adapter — see below) |

## Verification backlog (not full specs — smaller than that)

Shipped, but not exercised against the real thing:

- **Mac/Linux terminal backends** (`src/backends/wezterm.js`, `kitty.js`,
  `iterm2.js`, `terminalApp.js`, `gnomeTerminal.js`, `konsole.js`,
  `xfce4Terminal.js`) — each has unit tests with a forged platform and
  environment, but none has run against a real Mac or Linux machine. Written
  entirely on Windows.
- **Codex adapter against a live installation** — the column set was verified
  against a real install when written, and `threads` fixtures now cover the
  read, the schema-drift fallback and the redact write (`test/redactCodex.test.js`).
  What is still untested against the real thing is the end-to-end round trip:
  no `codex resume` has been run on a database nexo had redacted.

## Removed

- **opencode adapter** (dropped 2026-10-14). opencode 2.0 renamed the `session`
  table to `session_v2`, so the adapter returned nothing on any current
  install — and silently, because the read is wrapped in a `try/catch` that
  falls back to an empty list. `scan` and `usage` could never work for it
  regardless of schema: opencode keeps conversations in a `session_message`
  table, while that whole path in nexo assumes a file (`sessions.filter(s =>
  s.filePath)`). Supporting it properly would mean abstracting "content
  source" instead of "file path" — a real architectural change, for one
  agent, with no user asking. Shipping an agent that reads as supported and
  returns nothing was the worse option, so it was removed instead of patched.
