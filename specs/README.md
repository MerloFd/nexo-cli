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
| [003](./003-codex-redact/spec.md) | Codex support for `scan --redact` | Unblocked but deliberately not taken: the rollout rewrite is verified to work, the open part is that the secret is also in `state*.sqlite` |
| [004](./004-broader-agent-coverage/spec.md) | Broader terminal agent coverage | No chosen next agent (Track A died with the opencode adapter — see below) |

## Verification backlog (not full specs — smaller than that)

Shipped, but not exercised against the real thing:

- **Mac/Linux terminal backends** (`src/backends/wezterm.js`, `kitty.js`,
  `iterm2.js`, `terminalApp.js`, `gnomeTerminal.js`, `konsole.js`,
  `xfce4Terminal.js`) — each has unit tests with a forged platform and
  environment, but none has run against a real Mac or Linux machine. Written
  entirely on Windows.
- **Codex adapter's SQLite read** (`scanSqlite` in `src/agents/codex.js`) — the
  column set was verified against a real installation when it was written, but
  there is no test that builds a `threads` fixture, so a schema change upstream
  would surface as an empty list rather than a failing test.

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
