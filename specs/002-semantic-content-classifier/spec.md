# Feature Specification: Semantic Content Classifier for Scan

**Feature Branch**: `002-semantic-content-classifier`

**Created**: 2026-09-28

**Status**: Draft — deliberately not started; documented here so the
decision not to build it yet is recorded, not forgotten.

**Input**: Discussion in the nexo project about extending `nexo scan` beyond
pattern-matched credentials, using a local classifier model (evaluated:
Laya, from Convai Innovations) to catch sensitive content that has no fixed
format — customer data, contract text, salary figures, internal strategy —
none of which any regex can recognize.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag sensitive content without a known shape (Priority: P1)

A user wants to know if a session contains something sensitive that isn't a
credential — a pasted customer record, a contract clause — which `nexo scan`
today cannot see because it only matches structural patterns.

**Why this priority**: This is the entire reason this feature would exist;
without it, this spec is just "install a model for no benefit."

**Independent Test**: Run the classifier against a session containing a
paragraph of pasted customer PII and one containing ordinary code discussion;
the first should be flagged, the second should not.

**Acceptance Scenarios**:

1. **Given** a session with a paragraph that reads as customer data,
   **When** the deep scan runs, **Then** it's flagged with a category and a
   confidence, consistent with how `nexo scan`'s existing findings are
   reported (masked, metadata-only).
2. **Given** a session with only technical discussion, **When** the deep
   scan runs, **Then** nothing is flagged.

---

### Edge Cases

- What happens when the classifier disagrees with itself between runs
  (non-deterministic borderline cases)? Findings need to be stable enough
  that a user trusts the report.
- What happens on a machine where the extra runtime/model can't be
  installed (no GPU, restricted install permissions, offline)? The base
  `nexo scan` must keep working exactly as it does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: This capability MUST be opt-in and MUST NOT be a dependency of
  core `nexo scan` — the base command must keep working with zero external
  dependencies, exactly as it does today.
- **FR-002**: Findings from the classifier MUST follow the same masking
  discipline as pattern-based findings — no raw sensitive content in the
  report or in `--json` output.
- **FR-003**: The feature MUST run fully locally — no conversation content
  may be sent to an external API for classification (this is what rules
  out API-based classifiers like Jev outright; see Assumptions).
- **FR-004**: The feature MUST be clearly separated in the UI/output from
  the zero-dependency structural findings, so a user without the plugin
  installed still gets a complete, non-misleading report of what *is*
  covered.

*Unclear requirements:*

- **FR-005**: Category taxonomy (what counts as "customer data" vs
  "internal strategy" vs …) [NEEDS CLARIFICATION: no taxonomy has been
  defined — this affects both the model choice and the UI].
- **FR-006**: Distribution mechanism [NEEDS CLARIFICATION: separate npm
  package? a `nexo scan --deep` flag that lazy-installs on first use?
  neither has been chosen].

### Key Entities

- **Deep finding**: A classifier-produced finding — category, confidence,
  location — kept structurally parallel to today's pattern-based findings so
  the report can merge both without the user needing to think about which
  engine produced which line.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `nexo scan` without the plugin installed behaves identically
  to today — same speed, same zero dependencies, same output shape.
- **SC-002**: With the plugin installed, a session containing an obvious
  paragraph of customer PII is flagged; a session of pure code discussion is
  not.
- **SC-003**: No conversation content is transmitted anywhere outside the
  local machine at any point.

## Assumptions

- **Jev (TypeSafe AI) is out of scope entirely.** It's API-only, with no
  free tier, and sending session content — which has already been shown to
  contain leaked credentials — to a third-party API is the opposite of what
  this feature is for.
- **Laya (Convai Innovations, Apache 2.0) is the only evaluated candidate**
  that could work: local, open weights. But the practical path
  (`@receptron/laya`) pulls in `onnxruntime-node` (a native binary
  dependency) plus roughly 1.7 GB of model weights on first use — wildly
  disproportionate for a CLI that is otherwise a dependency-free JSONL/SQLite
  reader. This is presumed to remain true unless a much smaller
  quantized/distilled option becomes available.
- **Heuristic alternatives (file/command-based, keyword-based) were judged
  sufficient for the *other* idea this was compared against** (classifying a
  session by topic) and are explicitly not this feature — this spec is only
  about the "no-fixed-format sensitive content" case, where a heuristic
  demonstrably can't do the job a classifier could.
- If ever built, it must ship as an optional plugin a user explicitly
  installs — never a silent dependency of the base tool.
