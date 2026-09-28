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
| [003](./003-codex-redact/spec.md) | Codex support for `scan --redact` | Unconfirmed whether a session made by the current Codex version still writes the rollout file `--redact` would need to rewrite |
| [004](./004-broader-agent-coverage/spec.md) | Broader terminal agent coverage | Track A (verify opencode for real) is unblocked and cheap; Track B (new agents) has no chosen next agent |

## Verification backlog (not full specs — smaller than that)

Shipped, but not exercised against the real thing:

- **Mac/Linux terminal backends** (`src/backends/wezterm.js`, `kitty.js`,
  `iterm2.js`, `terminalApp.js`, `gnomeTerminal.js`, `konsole.js`,
  `xfce4Terminal.js`) — each has unit tests with a forged platform and
  environment, but none has run against a real Mac or Linux machine. Written
  entirely on Windows.
- **opencode adapter** — see spec 004, Track A.
