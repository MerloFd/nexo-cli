# Feature Specification: Shadow AI Oversight for Teams

**Feature Branch**: `001-shadow-ai-oversight`

**Created**: 2026-09-28

**Status**: Draft — not started, architecture undecided

**Input**: Discussion in the nexo project: "creio que o interesse seja de um
gestor ver se shadow IA está acontecendo ou se estamos gastando quanto de
token" — a way for a manager to see, across a team, whether Shadow AI is
happening (secrets leaking into agent logs) and how much token is being used,
without any individual's conversation content leaving their machine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manager sees aggregate leak signal, not content (Priority: P1)

A manager wants to know if credential leaks are happening anywhere on the
team, without reading anyone's conversations.

**Why this priority**: This is the actual "Shadow AI" case — the risk is
data exfiltration and compliance, not token spend. Without this, the feature
doesn't address what the term means.

**Independent Test**: A machine runs `nexo scan --json`, its output (rule,
occurrence count, timestamp — never the secret) is sent somewhere a manager
can view; the manager can tell "this machine had 2 high-confidence findings
this week" without seeing what they were.

**Acceptance Scenarios**:

1. **Given** a developer's machine has a high-confidence finding, **When**
   the aggregation runs, **Then** the manager's view shows the count and
   category, and never the masked or unmasked value.
2. **Given** no findings exist anywhere, **When** the manager checks,
   **Then** the view clearly shows "clean" rather than absence of data.

---

### User Story 2 - Manager sees token usage per person or team (Priority: P2)

A manager wants a rollup of token usage, to answer "are we gaining anything
from these subscriptions" or "who's using this heavily."

**Why this priority**: Secondary to the leak signal — it's the thing the
user originally proposed before separating it from "Shadow AI" during
discussion, since token spend on a subscription isn't itself a Shadow AI
signal, just usage visibility.

**Independent Test**: `nexo usage --json` output from N machines aggregates
into a single view broken down by person/machine and by day.

**Acceptance Scenarios**:

1. **Given** 3 machines report usage, **When** aggregated, **Then** the
   manager sees a per-person total without needing to log into each machine.

---

### Edge Cases

- What happens when a developer doesn't want to share their usage/scan data
  at all — is participation opt-in per machine, mandatory via company
  policy, or configurable per repo?
- How does the system distinguish "no agent installed" from "agent installed
  but reporting failed" from "opted out"?
- What happens if the transport (however it's built) itself becomes a leak
  vector — e.g., logging request bodies somewhere?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reporting mechanism MUST NOT transmit secret values,
  conversation content, file contents, or anything beyond what `nexo scan
  --json` and `nexo usage --json` already expose (counts, categories,
  timestamps, agent/model names).
- **FR-002**: Participation MUST be visible and explainable to the person
  whose machine is reporting — no silent background collection.
- **FR-003**: The manager's view MUST distinguish confidence levels (alta /
  media / baixa) exactly as `nexo scan` already does, not collapse them into
  a single "leak count."
- **FR-004**: System MUST work without requiring the manager to have shell
  access to each developer's machine.
- **FR-005**: System MUST NOT require nexo to read OAuth/API credential
  files (`.credentials.json`, `auth.json`) to attribute usage to a plan type
  — this was explicitly rejected earlier in the project for privacy reasons
  and that decision carries over here.

*Unclear requirements:*

- **FR-006**: System MUST transport data via [NEEDS CLARIFICATION: no
  transport mechanism has been chosen — push to a webhook? pull from a
  central collector? a static file synced via existing company tooling?].
- **FR-007**: System MUST identify "whose machine" this is via [NEEDS
  CLARIFICATION: hostname? a configured team/user id? git config user.email?
  — needs a decision that doesn't require reading credential files].
- **FR-008**: Historical retention MUST be [NEEDS CLARIFICATION: how long
  does aggregated data live, and who can delete it].

### Key Entities

- **Report**: One machine's periodic scan+usage snapshot — counts and
  categories only, tagged with machine/person identity and a timestamp.
- **Aggregation view**: Whatever the manager actually looks at — not
  designed yet (could be a static site, a spreadsheet export, a dashboard).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can answer "did any leak happen on the team this
  week, and how severe" without ever seeing a secret value or message
  content.
- **SC-002**: A developer can verify exactly what left their machine, since
  it's identical to what `nexo scan --json` / `nexo usage --json` already
  print locally.
- **SC-003**: Turning off participation on one machine doesn't break
  aggregation for the rest of the team.

## Assumptions

- This is a multi-machine, multi-person feature — it doesn't make sense for
  a solo user, and wasn't scoped for one.
- No transport/storage backend exists yet; this spec doesn't assume a
  server will be built as part of nexo itself. It could as easily be "print
  a report that gets uploaded by existing company tooling" as a bespoke
  service.
- The privacy posture already established in `nexo scan`/`nexo usage`
  (metadata only, never content) is a hard constraint here, not a
  preference — this feature's only reason to exist is trust that it won't
  leak what it's meant to catch.
