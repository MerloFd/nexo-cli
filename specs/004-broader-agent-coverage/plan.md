# Implementation Plan: Broader Terminal Agent Coverage

**Branch**: `004-broader-agent-coverage` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Status**: Not started, split into two independent tracks that don't block
each other.

## Summary

Track A: validate the opencode adapter against a real installation and fix
whatever the validation finds. Track B: add adapters for agents nexo doesn't
support yet, following the same research-then-implement discipline already
used for Claude/Codex/opencode.

## Technical Context

**Language/Version**: Node.js, matching `src/agents/*.js`.

**Primary Dependencies**: `node:sqlite` has covered every agent so far
(Codex, opencode) — likely to cover most future ones too, given how common
SQLite is for local-first tools. Some candidates may use a different format
entirely (flat files, LevelDB, etc.) and would need their own reader.

**Testing**: Same pattern each time — `node:sqlite`-built synthetic
fixtures when real data isn't available (as done for opencode), explicitly
disclosed as unverified in the README until real data confirms it.

**Target Platform**: Same as the rest of nexo — Windows-first, but adapters
themselves are just file/database readers and are platform-agnostic by
nature (only the backends that *open* a terminal are platform-specific).

## Project Structure

```text
specs/004-broader-agent-coverage/
├── spec.md
└── plan.md

# Track A — no new files, fixes to:
src/agents/opencode.js
test/opencode.test.js

# Track B — hypothetical, one agent shown as the pattern:
src/agents/<new-agent>.js
test/<new-agent>.test.js
# + one line added to src/agents/index.js's AGENTS array
```

## Open Questions (block starting Track B; Track A just needs the install)

1. **Track A is unblocked and cheap** — it only needs someone with a real
   opencode installation to run `nexo` and report what, if anything, breaks.
   This should happen before Track B work, since Track B repeats the same
   "built from docs, unverified" pattern and it's worth knowing whether that
   pattern actually held up for opencode first.
2. **Track B has no chosen next agent** (spec.md FR-005). Given the
   project's actual usage is Claude Code + Codex today, the honest default
   is: don't start Track B speculatively — wait until the project owner or
   a real user actually runs one of the candidate agents.
3. Should a version/schema mismatch produce a visible warning instead of
   silently returning zero sessions? None of the three shipped adapters do
   this today (they fail closed and quiet, matching `scanAll()`'s existing
   try/catch-per-agent design) — worth deciding once, not per new agent.

## Next Step

Track A: ask the project owner (or the first opencode-using tester) to run
`nexo` and report results — no code change until then. Track B: no next
step until a specific agent is prioritized.
