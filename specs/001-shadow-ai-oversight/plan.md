# Implementation Plan: Shadow AI Oversight for Teams

**Branch**: `001-shadow-ai-oversight` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Status**: Not started. This plan exists to capture the shape of the
problem and the open questions, not to commit to an architecture.

## Summary

Aggregate the metadata `nexo scan` and `nexo usage` already produce, across
multiple machines, into something a manager can look at — without ever
centralizing secret values or conversation content.

## Technical Context

**Language/Version**: Node.js (same as the rest of nexo), if the collector
piece is even built in this repo — could equally be "nexo just needs a
stable JSON schema and someone else's tooling ingests it."

**Primary Dependencies**: None chosen. No HTTP client/server exists in nexo
today — it's a pure CLI. Adding a network component is a meaningful shift
in what this tool is.

**Storage**: N/A for nexo itself under the current framing (nexo emits
JSON; storage/aggregation is a separate concern, deliberately not designed
here — see Open Questions).

**Testing**: Unaffected — `nexo scan --json` / `nexo usage --json` already
have test coverage for the exact fields this would depend on.

**Target Platform**: Wherever `nexo` already runs (Windows-first today).

**Project Type**: Ambiguous — could stay "CLI that emits JSON, consumed by
existing infra" or grow into "CLI + a small aggregation service." This is
the central undecided question of this spec.

**Scale/Scope**: Unknown — depends entirely on team size, which hasn't been
discussed.

## Open Questions (block starting this)

These need a decision from the project owner before any code is written —
none of them have a default that's obviously correct:

1. **Does nexo build the collector, or just the emitter?** The minimal,
   lowest-risk version of this feature is: nexo already prints
   `--json` output; a manager could point *any* existing company tool
   (a cron job + a shared drive, a real observability stack, whatever
   already exists) at that output. Building a bespoke aggregation
   service inside this project is a much bigger commitment and changes
   nexo from "a CLI you run" into "a CLI plus a service you operate."
2. **Identity without touching credentials.** FR-005 rules out reading
   `.credentials.json`/`auth.json` to figure out who's reporting or what
   plan they're on. What identifies a report, then — git config, a config
   file the user fills in once, hostname? Each has different privacy and
   spoofability trade-offs that haven't been evaluated.
3. **Opt-in mechanics.** Per-machine config flag? Company policy applied
   some other way? This determines a lot of the eventual implementation
   and hasn't been discussed at all beyond "developer should be able to
   see what leaves their machine."
4. **Is this even a nexo problem?** Worth naming directly: a team that
   cares enough about Shadow AI to want a dashboard likely already has (or
   should get) actual DLP/observability tooling built for exactly this.
   nexo's differentiator was the multi-agent *local* switcher; whether it
   should also become team infrastructure is a scope decision, not just a
   technical one.

## Next Step

Do not start implementation from this plan. The next step is a decision
from the project owner on question 4 above — whether this stays a personal
tool or becomes team infrastructure — since that answer changes every other
question's answer.
