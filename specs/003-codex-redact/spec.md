# Feature Specification: Codex Support for `nexo scan --redact`

**Feature Branch**: `003-codex-redact`

**Created**: 2026-09-28

**Status**: Draft — v1 of `--redact` (shipped) covers Claude Code only, by
explicit decision, because Codex's storage format needs a different rewrite
approach that wasn't built.

**Input**: `nexo scan --redact` currently rewrites Claude Code's JSONL
session files, replacing high-confidence secret values with `[REDACTED]`.
Codex sessions are excluded because current Codex installations store
sessions in SQLite (`~/.codex/state*.sqlite`), not the JSONL rollout format
the redact logic was built against.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Redact a leaked secret in a Codex session (Priority: P1)

A user runs `nexo scan` and sees a high-confidence finding in a Codex
session. They expect `--redact` to clean it up the same way it does for
Claude Code sessions.

**Why this priority**: This is the whole feature — right now, the same
command silently does nothing for roughly half the supported agents, which
is a correctness gap disclosed in the README but still a real gap.

**Independent Test**: A synthetic Codex session (SQLite fixture, following
the pattern in `test/opencode.test.js` and `src/agents/codex.js`'s own
tests) contains a high-confidence secret in some text field; after
`--redact`, the value is gone and the database is still readable by Codex.

**Acceptance Scenarios**:

1. **Given** a Codex session with a high-confidence finding in an active
   (non-archived) thread, **When** `--redact` runs, **Then** the value is
   replaced consistently with however Claude sessions are redacted (masked
   in the report, `[REDACTED]` in storage, never printed).
2. **Given** an older Codex installation that still uses the JSONL rollout
   format (the fallback path `src/agents/codex.js` already reads), **When**
   `--redact` runs, **Then** it's handled with the same line-based approach
   already used for Claude, since the format is the same shape.

---

### Edge Cases

- The Codex SQLite database may be open by a live `codex` process at the
  time of redaction — same "session possibly active" problem `--redact`
  already has for Claude (solved there with a 5-minute mtime heuristic),
  but a database file's mtime semantics may differ from a plain JSONL file
  (WAL mode means the main `.sqlite` file might not change on every write).
- Where is the secret actually stored in the schema — `first_user_message`,
  a serialized JSON blob, the rollout file referenced by `rollout_path`? The
  agent adapter (`src/agents/codex.js`) already reads several of these
  columns; redact needs to know which ones can contain user-authored text
  vs. structured metadata that shouldn't be touched.
- `rollout_path` may point to a file that no longer exists (rotated,
  archived) while the SQLite row still does, or vice versa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Redaction of a Codex session MUST NOT corrupt the SQLite
  database or leave it in a state Codex itself cannot open.
- **FR-002**: The "possibly active" safety skip MUST apply to Codex
  sessions using a criterion appropriate to SQLite + WAL, not naively reused
  from the JSONL mtime check.
- **FR-003**: Only high-confidence findings are redacted, matching the rule
  already established for Claude (`src/scan/redact.js`) — this is a
  cross-cutting policy, not something to re-decide per agent.
- **FR-004**: The existing JSONL rollout fallback path (old Codex
  installations) MUST reuse the line-rewrite logic already built for Claude
  rather than duplicating it, since the file format is the same.

*Unclear requirements:*

- **FR-005**: Which SQLite columns are in scope for redaction. Verified on a
  real installation: `first_user_message`, `title`, `name`, and `preview`
  are short user-authored text and can contain a pasted secret directly (one
  such case — a real database credential — was found and reported during
  this project's own development). Whether other columns (`model`,
  `git_branch`, JSON blobs like `sandbox_policy`) can ever carry
  user-authored free text [NEEDS CLARIFICATION].
- **FR-006**: Whether redaction should also touch the `rollout_path` file on
  disk. Verified: every thread currently in this installation's database has
  a `rollout_path` that still points to a readable JSONL file — this is
  where the actual full conversation lives, and where the real leaked
  credential mentioned above was found (the SQLite row itself did not
  contain it). Redacting the SQLite row alone, without also redacting the
  rollout file, would miss the actual leak. **Not verified**: every thread
  available for inspection dates from before this Codex installation's last
  CLI use (June); whether a session created by the *current* Codex version
  still writes a rollout file at all could not be confirmed, since no such
  session exists on the machine used for this research.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `nexo scan --redact` covers both agents it currently reports
  findings for, not just one.
- **SC-002**: A redacted Codex session still opens correctly with
  `codex resume <id>`.

## Assumptions

- This depends on the same "alta confidence only" and "skip if possibly
  active" policies already shipped for Claude — this spec is scoped to
  extending coverage, not revisiting those decisions.
- No real Codex SQLite database with a genuine leaked secret has been
  inspected while writing this — same disclosed limitation as the opencode
  adapter (README: "best-effort... not verified against a real
  installation"). This is a harder blocker for --redact than it was for the
  read-only opencode adapter, since a mistake here is destructive.
