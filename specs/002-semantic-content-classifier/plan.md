# Implementation Plan: Semantic Content Classifier for Scan

**Branch**: `002-semantic-content-classifier` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Status**: Not started. Recorded to preserve the reasoning for *not*
building this yet, so the decision doesn't need re-litigating from scratch
later.

## Summary

Add an optional, locally-run classifier (candidate: Laya) as a `nexo scan`
plugin, to catch sensitive content with no fixed format — the gap the
regex/entropy engine cannot close by design.

## Technical Context

**Language/Version**: Node.js, matching the host CLI — but the actual
inference would run through `onnxruntime-node`, a native addon, which is
new territory for this project (everything today is pure JS).

**Primary Dependencies**: `@receptron/laya` (MIT, Node 20+) →
`onnxruntime-node` (native binary, per-platform) + `@huggingface/tokenizers`
+ ~1.7 GB of fp32 model weights downloaded on first use. An INT8-quantized
export would shrink the weights but the native runtime dependency remains
either way.

**Storage**: Downloaded model weights need a cache location — not designed.

**Testing**: Would need fixtures with synthetic (not real) sensitive
content, mirroring how `test/scan.test.js` already avoids embedding
real-shaped secrets.

**Target Platform**: Wherever `onnxruntime-node` ships prebuilt binaries for
— not yet confirmed to cover the same platform matrix as the rest of nexo.

**Project Type**: CLI plugin (separate package), not a core dependency.

**Performance Goals**: Not established — no latency budget has been set for
a "deep scan" pass, and it will always be slower than the regex pass.

**Constraints**: Must not affect `nexo scan`'s current zero-dependency,
sub-second behavior when the plugin isn't installed.

**Scale/Scope**: Single-session, single-machine — no distributed inference
under consideration.

## Constitution Check

No formal constitution file exists for this project. The relevant
project-level principle, established through this session's decisions, is:
**the core CLI stays dependency-free**; anything that needs a native
runtime or GB-scale download must be opt-in and separately packaged. This
plan does not violate that as long as FR-001 (spec.md) is honored.

## Project Structure (if built)

```text
specs/002-semantic-content-classifier/
├── spec.md
└── plan.md

# hypothetical, if implementation starts:
packages/nexo-scan-deep/       # separate package, not in nexo's own deps
├── src/
│   └── classify.js            # wraps @receptron/laya
├── package.json                # carries the heavy deps, not nexo's own
└── test/
```

## Open Questions (block starting this)

1. **Is the model too heavy, full stop?** 1.7 GB for a CLI feature is a real
   ergonomics problem regardless of packaging — first-run experience would
   involve a multi-minute download most users won't expect from a session
   switcher. No smaller model has been evaluated.
2. **Taxonomy** (spec.md FR-005) — without categories, there's nothing to
   ask the classifier to distinguish.
3. **Does this ever get prioritized over the two v1-scoped-out items that
   are strictly cheaper** — Codex `--redact` support and broader agent
   coverage (specs 003 and 004)? Given effort/value, both of those are
   smaller and more clearly scoped than this one.

## Next Step

None planned. Revisit only if a materially lighter local classifier becomes
available, or if a concrete case of undetected sensitive content (not
covered by pattern/entropy matching) makes the gap costly enough to justify
the download size.
