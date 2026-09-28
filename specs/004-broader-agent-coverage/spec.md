# Feature Specification: Broader Terminal Agent Coverage

**Feature Branch**: `004-broader-agent-coverage`

**Created**: 2026-09-28

**Status**: Draft. Covers two distinct kinds of remaining work: (a)
validating the opencode adapter against a real installation, and (b) adding
agents nexo doesn't support yet, following the comparison against
`fast-resume` (which covers 12 agents).

**Input**: nexo supports Claude Code (verified against real data), Codex
(verified against real data), and opencode (built from public schema,
unit-tested with a synthetic database, never run against a real
installation — disclosed in the README). Cursor was evaluated and explicitly
rejected (see Assumptions). `fast-resume` additionally covers Copilot CLI,
Cursor CLI, Antigravity, Crush, Grok Build, Kimi Code, Pi, and Vibe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm opencode actually works (Priority: P1)

A user who runs opencode installs nexo and expects it to just work, the same
way Claude Code and Codex do.

**Why this priority**: This is a correctness gap in an already-shipped
feature, not a new one — higher priority than adding agents nobody's asked
for.

**Independent Test**: On a machine with a real opencode installation, run
`nexo` and confirm opencode sessions appear with correct directory, title,
and that `nexo --open <id>` actually resumes them via `opencode --session`.

**Acceptance Scenarios**:

1. **Given** a real opencode installation with existing sessions, **When**
   `nexo` runs, **Then** those sessions appear in the list with accurate
   metadata.
2. **Given** the resolved database path is wrong for some opencode channel
   or OS variant, **When** discovered, **Then** `dbPath()` is corrected and
   covered by a test that would have caught it.

---

### User Story 2 - Add another agent nexo doesn't cover yet (Priority: P2)

A user of an agent nexo doesn't support (Copilot CLI, Antigravity, Grok
Build, Kimi Code, Pi, Vibe) wants it in the same unified list.

**Why this priority**: Expands reach, but nothing currently in scope depends
on it, and each agent needs its own research pass — same rigor already
applied to Claude/Codex/opencode (real schema, real data where possible,
disclosed honestly where not).

**Independent Test**: Each new agent gets its own adapter file with the same
shape as `src/agents/claude.js` / `codex.js` / `opencode.js`, and its own
test file.

**Acceptance Scenarios**:

1. **Given** a new agent's local session storage format is documented or
   reverse-engineered, **When** an adapter is written, **Then** it's tested
   against either real data (preferred) or a synthetic fixture matching the
   documented schema (disclosed as such, matching the opencode precedent).

---

### Edge Cases

- An agent's storage format could change between versions in a way that
  silently breaks an adapter — none of the current adapters have a version
  check or a "this schema looks unexpected" warning.
- Some candidate agents may not expose a resumable CLI at all (only a picker
  built into their own TUI), which would make them listable but not
  resumable via `nexo --open`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: opencode adapter validation MUST happen against a real
  installation before the README's "best-effort, not verified" caveat is
  removed.
- **FR-002**: Any new agent adapter MUST follow the existing contract
  (`id`, `label`, `scan()`, `resumeArgs()`) so it drops into
  `src/agents/index.js` without changing the scan/backend/UI layers.
- **FR-003**: Any new agent adapter's `resumeArgs()` MUST be based on
  documented or directly-observed CLI behavior, not guessed — consistent
  with how Codex's `resumeArgs()` cites the exact GitHub issue (#4791) that
  informed its cwd-handling decision.
- **FR-004**: Cursor remains explicitly out of scope (see Assumptions) —
  this feature does not reopen that decision without new information.

*Unclear requirements:*

- **FR-005**: Which agent to add next [NEEDS CLARIFICATION: no priority
  order has been set among Copilot CLI, Antigravity, Grok Build, Kimi Code,
  Pi, Vibe — this should probably be driven by what the project owner or
  early users actually run, not by `fast-resume`'s list].

### Key Entities

- **Agent adapter**: Same shape already established —
  `{ id, label, scan(), resumeArgs() }` — no new entity needed, this feature
  is purely "more of the existing pattern."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: opencode's README caveat ("not verified against a real
  installation") is removed only after real verification, not before.
- **SC-002**: Each newly added agent has test coverage equivalent to what
  Claude/Codex/opencode already have (unit tests against real or
  schema-accurate synthetic data).

## Assumptions

- **Cursor is excluded by prior decision**, not oversight: its session
  storage is undocumented, engineering-reverse-derived by third parties, and
  the working directory (the one piece of data nexo absolutely needs) lives
  inside a protobuf blob with no available parser. This would need to change
  before Cursor is reconsidered.
- **`fast-resume`'s 12-agent list is inspiration, not a target to match
  agent-for-agent.** nexo's differentiator was never "supports the most
  agents" — it's "opens in a new tab instead of replacing your current
  session, and runs natively on Windows." Adding agents is valuable insofar
  as the project owner or real users actually run them.
- No timeline or commitment is implied by this spec existing — it documents
  the shape of the remaining work, not a promise to do it.
