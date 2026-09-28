# Implementation Plan: Codex Support for `nexo scan --redact`

**Branch**: `003-codex-redact` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Status**: Not started.

## Summary

Extend `src/scan/redact.js` (or add a Codex-specific sibling) to cover
Codex sessions, redacting both the SQLite row's short text fields and the
rollout JSONL file the row points to — the actual conversation content.

## Technical Context

**Language/Version**: Node.js, using `node:sqlite` (already a dependency of
`src/agents/codex.js` — no new runtime dependency needed for this feature,
unlike spec 002).

**Primary Dependencies**: None new.

**Storage**: `~/.codex/state*.sqlite` (WAL mode) + the JSONL rollout file
referenced by each thread's `rollout_path`.

**Testing**: Mirror `test/redact.test.js`'s approach (synthetic fixture,
runtime-built fake secret values, never a real-shaped literal in source) and
`test/opencode.test.js`'s approach to building a throwaway SQLite fixture
with `node:sqlite`.

**Target Platform**: Same as the rest of nexo.

**Constraints**: Must not corrupt the database (FR-001) or leave Codex
unable to open a redacted session.

## Project Structure (if built)

```text
specs/003-codex-redact/
├── spec.md
└── plan.md

# hypothetical, if implementation starts:
src/scan/
├── redact.js            # existing Claude/JSONL redaction, untouched
└── redactCodex.js        # new: SQLite row + rollout file, reusing
                           #      the same "alta confidence only" matcher
test/
└── redactCodex.test.js
```

## Constitution Check

Reuses the same policy as spec 003's sibling feature already shipped: only
high-confidence findings, only sessions not "possibly active." No new
policy decision needed — this is coverage, not a new design.

## Open Questions (block starting this)

1. **Does a session made by the currently-installed Codex version still
   produce a rollout file?** This is the actual blocker. Every thread
   available for inspection while writing this spec predates the current
   Codex version (all from before the installation's last CLI use). If
   current sessions no longer write a rollout file, the whole approach
   (redact the file the row points to) needs rethinking — the real content
   might live somewhere else entirely, or only in memory/transient state
   Codex doesn't persist. **This needs someone with an actively-used, current
   Codex CLI installation to check `rollout_path` on a *recent* thread.**
2. **WAL-aware "possibly active" check.** The 5-minute mtime heuristic
   `isPossiblyActive()` (spec.md Edge Cases) assumes a plain file whose
   mtime changes on every write. A SQLite database in WAL mode may not
   update the main file's mtime on every write (writes land in the `-wal`
   file first) — the heuristic likely needs to check the `-wal` file's
   mtime instead of (or in addition to) the main `.sqlite` file's.
3. **Column scope** (spec.md FR-005) — confirmed which columns are known
   text-bearing; not confirmed whether that list is exhaustive across Codex
   versions, since the schema has already changed once during this
   project's research (columns were added between versions observed).

## Next Step

Answer Open Question 1 first — it determines whether this feature is even
well-formed as scoped, or needs a different approach for current Codex
versions.
