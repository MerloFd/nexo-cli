# nexo

Sessions from terminal AI agents, all in one place.

Claude Code's `/resume` and `codex resume` each only see their own agent. If you
run more than one agent across several repositories, nothing shows you the whole
picture — and after a weekend nobody remembers where they stopped.

`nexo` reads the local session files of each agent, puts everything in one
searchable list, and opens the one you pick **in a new terminal**, without
taking down what you already have open.

## Highlights

- One list for every agent and every repository on the machine — no more
  hopping between `/resume` and `codex resume` one project at a time.
- Opens sessions in a **new terminal tab**, never replaces the one you're
  typing in.
- **Tab** marks several sessions, **Enter** reopens all of them at once.
- **`--send`** asks each reopened session "where did we leave off?" for you,
  after confirming — no more retyping the same question into every tab.
- Built-in **credential scanner** (`nexo scan`) and redaction for secrets
  that leaked into a session log.
- **Token usage breakdown** (`nexo usage`) by day, agent, model and project.
- Colored, table-aligned list with a live side-by-side conversation preview.
- 11 terminal environments detected automatically (see [Where the session
  opens](#where-the-session-opens)), Windows included — most competing tools
  are Unix-only.

## Supported agents

| Agent | Status |
| --- | --- |
| [Claude Code](https://claude.com/claude-code) | Full support — list, search, resume, preview, `scan --redact` |
| [Codex](https://openai.com/codex/) | List, search, resume, `scan` — no preview or `--redact` yet |
| [opencode](https://opencode.ai) | Best-effort — built from its public schema, not verified against a real install (see [How it works](#how-it-works)) |

## Install

```
git clone https://github.com/MerloFd/nexo-cli
cd nexo-cli
npm install -g .
```

Node 18+. No external dependencies.

## Usage

```
nexo                list the sessions and open the one you pick
nexo <term>         open the list already filtered
nexo scan           look for credentials leaked into the session logs
nexo usage          token usage overview
nexo lang [en|pt]   show or change the interface language
nexo --help         this help

Options:
  --list              just print the sessions, no interactive list
  --json              JSON output (works for scan and usage too)
  --open <id>         open that session directly (a prefix of the id is enough)
  --send <text>       ask to send this text to every session you open (Herdr only)
  --redact            in scan, remove high-confidence secrets (Claude only)
  --week              in usage, group by week instead of day

In the list:
  type                searches right away, no prefix needed
  arrows, ctrl+p/n    move
  ctrl+a              switch between every folder and the current one
  ctrl+←/→            cycle the agent filter tab
  ctrl+t              toggle the side-by-side preview
  enter               open the session
  tab                 mark the session (repeat on more), enter opens them all
  esc                 clears the search; with it empty, quits
```

### The list

```
  Sessions global (1 of 71)
  ┌────────────────────────────────────────────────────┐
  │ ⌕ Search…                                          │
  └────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │> Session switcher tool                                        │
  │    claude · C:\DEV\nexo-cli · now  · HEAD · 3.5MB · 323k ctx  │
  │  FIX RECURRENCES                                              │
  │    codex  · C:\DEV\SO5      · 2d ago · frete-refactor         │
  └──────────────────────────────────────────────────────────────┘
```

Each agent's name is colored with that agent's own brand color (terracotta
for Claude, green for Codex/OpenAI) so a mixed list stays scannable at a
glance. Columns line up like a table across the sessions currently on
screen — directory capped at 36 chars, everything else padded to the widest
value on that page.

Type anything and the search starts — no prefix. It ignores accents and case,
treats several terms as AND, and looks at agent, branch, title, directory and
summary. Arrows (or Ctrl+P / Ctrl+N) move, Enter opens, Esc clears the search
and, once empty, quits.

**Ctrl+A** switches scope: every folder on the machine, or only the one you ran
the command from. The header says which is active.

**Tab** marks the highlighted session (✓) and moves to the next one — it opens
nothing by itself. Mark as many as you like, then **Enter** opens all of them
at once, as tabs of a single instance instead of separate windows. Marks
survive searching and switching scope, so you can mark, filter for something
else, and mark more. With nothing marked, Enter keeps its plain behavior:
opens the highlighted session and closes the list.

The label is the session's real name: the one you set with `/rename`, or the one
the agent generated, or your first message — in that order.

### Starting a new session

The list always opens with **+ New session** pinned above every real session.
Enter on it asks which provider:

```
┌────────────────────────────────┐
│ Which provider?                │
│                                │
│ > claude                       │
│   codex                        │
│   opencode                     │
│                                │
│ [Enter] open    [Esc] cancel   │
└────────────────────────────────┘
```

Arrows (wrapping) pick a provider, Enter starts it in the current directory,
Esc backs out without starting anything. It opens through the exact same
backend chain as resuming a session — agnostic of terminal, same as
everything else in the list.

### `--send`, resuming several sessions at once

```
nexo --send "where did we leave off?"
```

Closing several agents and having to open each one back up just to ask it
where it stopped gets old fast. With `--send`, opening a session (or a whole
batch marked with Tab) asks first — a modal, defaulting to **No** — and only
sends the text once you confirm with **S**:

```
┌───────────────────────────────────────────────────────┐
│ Send this message to these 3 sessions about to open?  │
│                                                        │
│ "where did we leave off?"                             │
│                                                        │
│ [Enter] No (default)    [S] Yes    [Esc] cancel       │
└────────────────────────────────────────────────────────┘
```

Supported by **Herdr, tmux, WezTerm and kitty** — every backend that has its
own way to type into a specific pane after opening it. Herdr knows exactly
when the agent finished booting before it sends anything; the other three
don't expose that, so they wait a fixed ~2.5s instead — a best-effort
estimate, not a guarantee, on a slow machine the agent might not be ready
yet. On any other backend (Windows Terminal, plain cmd/PowerShell, GNOME
Terminal, Konsole, Xfce Terminal, iTerm2, Terminal.app), the session still
opens normally and `nexo` tells you the text wasn't sent, instead of staying
quiet about it.

**Ctrl+←/→** cycles a filter tab — every agent that has a session, plus "all" —
shown above the list once more than one agent is present. A side-by-side
preview of the highlighted session's conversation is on by default whenever
the terminal is at least 116 columns wide; **Ctrl+T** toggles it off:

```
> Fits (Melhorias)                                    │ claude · Fits (Melhorias)
    claude · C:\DEV\SO5 · 1221 turns · 1h ago · HEAD   │ C:\DEV\SistemasAtuais\SO5 · 1h ago
  FIX GERENCIADOR CARDS COM SPEC                       │
    claude · C:\DEV\SO5 · 542 turns · 1h ago · HEAD    │ > eu tenho o spec-kit instalado...
                                                        │   Achado. specify-cli tá instalado...
```

Preview is Claude-only for now — Codex and opencode show a plain "no preview"
message instead of content. It shows the first ~4000 characters of the
conversation, no syntax highlighting, no scrolling: a quick look at where the
session started, not a full transcript reader.

Session age also gets a color hint in the metadata line: green under an hour,
cyan under a day, yellow under a week, and the usual dim beyond that.

### Language

English by default. `nexo lang pt` switches to Portuguese, `nexo lang` shows the
current one — see [Configuration](#configuration) for where the choice is saved
and how to override it for a single run.

### Where the session opens

From the most capable option to the least:

| Environment | Result |
| --- | --- |
| Herdr | new tab, labeled with the session's title |
| WezTerm | new tab |
| kitty | new tab (needs `allow_remote_control yes` in kitty.conf) |
| iTerm2 | new tab |
| Windows Terminal | new tab |
| tmux | new window |
| classic cmd / PowerShell | new window |
| GNOME Terminal | new tab |
| Konsole | new tab (needs "Run all Konsole windows in a single process") |
| Xfce Terminal | new tab |
| Terminal.app | new window (no reliable way to force a tab without extra permissions) |
| anything else | prints the ready command |

WezTerm, kitty and iTerm2 are detected by an environment variable that only
exists when you're actually running inside them — a near-certain match.
GNOME Terminal, Konsole and Xfce Terminal are only detected by checking if
the program is installed, which is a guess if more than one is present.
None of them is required, and if one fails the next takes over.

Inside the VS Code integrated terminal the session opens in an external
terminal: VS Code exposes no API to create a tab from the command line
([vscode#238786](https://github.com/microsoft/vscode/issues/238786)).

Ctrl+Enter also marks, as a bonus, on terminals that send it as a distinct
key combination — many don't, and it then behaves just like plain Enter with
no way to tell the difference. Tab is the one guaranteed to work everywhere,
since it's a single byte every terminal decodes the same way.

## Configuration

No setup required — everything below has a sane default and is optional.

| What | Where | Override |
| --- | --- | --- |
| Language | `~/.nexo-config.json` | `NEXO_LANG=pt` for a single run |
| Session cache | `~/.nexo-cache.json` | `NEXO_NO_CACHE=1` disables it |
| Scan cache | `~/.nexo-scan-cache.json` | `NEXO_NO_CACHE=1` disables it too |

The cache is keyed by each session file's mtime and size, so it only re-reads
what actually changed — that's what keeps the list opening in about 100ms
even with hundreds of sessions on disk. Delete `~/.nexo-cache.json` (or run
with `NEXO_NO_CACHE=1`) if a session ever shows stale data.

## nexo scan

Scans the session logs for credentials that went through the chat. The value
is always masked — the report never shows what it found, only that it found
something and where.

An interactive table when run in a terminal, colored by confidence, with the
high-confidence findings selectable:

```
  nexo scan (0 selected)

> ALTA   AWS access key                AKI********QQ
      claude · Templates for EN · linha 1292
  ALTA   Token do GitHub               ghp********ZZ  (4x)
      claude · FIX RECURRENCES · linha 8885

  ↑↓ move   tab mark (high-confidence only)   enter redact   esc quit
```

**Tab** marks a finding (only high-confidence, Claude sessions — the same
ones `--redact` targets), **Enter** asks for confirmation and shows exactly
how many credentials are about to be rewritten, defaulting to **No**. Only
the findings you actually picked get touched — everything else in that
session file, and every other session, is left alone. With nothing marked,
Enter acts on the highlighted row instead.

Piped, scripted, or with `--json`, the output stays the static grouped report
of always:

```
34 high-confidence finding(s) and 66 to review, across 22 session(s).

HIGH CONFIDENCE - this shape only exists in real credentials:

  Templates for EN
    claude · 4d ago · C:\DEV\Project
      AWS access key: AKI********GZ (56x)  line 1292
```

Two things the static report makes explicit:

1. **Rotate the credential.** It was already sent to the provider along with the
   conversation; deleting the local file undoes nothing.
2. Then clean the log, which sits in plain text in your profile and can be read
   by any process running as you.

`nexo scan --json` returns metadata only — type, count and location. Never the
secret itself. It's cached the same way the session list is (see
[Configuration](#configuration)): a session that hasn't changed since the last
scan isn't re-read.

**Exit code**: `0` clean, `1` a `--redact` failed on a file, `2` at least one
high-confidence finding — medium and low confidence never fail the command,
so a CI or pre-commit hook can gate on `nexo scan --json` without getting
noisy false positives from a stray hash or an example password:

```
nexo scan --json || exit 1
```

### `--redact`

```
nexo scan --redact
```

Same rewrite as picking every high-confidence finding in the interactive
table, but non-interactive and unconditional — for automation, where nothing
is there to confirm a modal. Replaces the value in place with `[REDACTED]`,
keeping the line valid JSON. Deliberately narrow, for now:

- **Claude Code only.** Codex now stores sessions in SQLite, which needs a
  different rewrite approach that isn't built yet.
- **High-confidence findings only** (a real key/token shape). Medium and low
  confidence findings can be quoted code or noise, and rewriting one by
  mistake is not reversible — those are left alone; review them by hand.
- **A session changed in the last 5 minutes is skipped**, since a live agent
  may still be appending to that same file — rewriting under it could
  corrupt the next write. This is a heuristic, not a guarantee.
- For a private key, the **whole PEM block** is removed, not just the
  `-----BEGIN...-----` marker line the report shows.

This only removes the **local copy**. The secret was already sent to the
provider with the conversation — rotate it; `--redact` does not undo that.

## nexo usage

An interactive dashboard when run in a terminal, a static report otherwise
(piped, scripted, or with `--json`).

```
Total: 8.2B tokens across 22827 turns

  input            2.6M    0%
  output          19.4M    0%
  cache read       7.9B   97%
  cache write    201.0M    2%

By day

> 2026-09-28      1.2B  █████████████▋              14% of total
  2026-09-29    410.9M  ████▊                        5% of total
  ↓ 24 below

  [↑↓] move   [Enter] drill into a day   [Tab] day/week   [Esc] quit
```

Arrows move between days (or weeks, `Tab` switches), scrolling exactly like
the session list when there are more than fit on screen. **Enter** drills
into the highlighted day: the same totals, broken down by agent, model and
project, but scoped to just that one day — and the percentages there are
relative to that day, not to the whole range. **Esc** backs out one level at a
time, then quits.

The bar alone only ranks rows against each other — it can't tell you whether
a "tall" day is 5% or 50% of everything. The percentage next to it always
answers that against the total in scope: the full range at the top level,
just that one day once you drill in.

Each turn is counted against the model used on that turn, because the model
changes mid-session. There are no money figures: on a subscription plan tokens
are not billed per unit, so any amount would be made up.

## How it works

| Agent | Source | Resume |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/*/*.jsonl` | `claude -r <id>` |
| Codex | `~/.codex/state*.sqlite`, falling back to the JSONL rollouts | `codex resume <id>` |
| opencode | `~/.local/share/opencode/opencode.db` (`OPENCODE_DB` overrides it) | `opencode --session <id>` |

The opencode adapter is built from its public schema, unit-tested against a
synthetic database, but not verified against a real opencode installation —
none was available while writing it. If you use opencode and hit a problem,
please open an issue.

The project directory comes from the `cwd` field inside the file, never from the
folder name: `C--DEV-SO5-SO5-Back-End` is too ambiguous to decode back.

Title, branch and usage are rewritten throughout the file, so the last ones win
— which is why only the final 64KB are read instead of the whole file. See
[Configuration](#configuration) for how the session cache that keeps this fast
is controlled.

## Similar projects

- [fast-resume](https://github.com/angristan/fast-resume) — same idea, in Rust,
  with more agents. Ships no Windows binary and uses `exec()`, replacing your
  current session instead of opening another one.
- [ccusage](https://ccusage.com) — token and cost accounting for ~18 agents.
  More thorough than `nexo usage`, but it neither lists nor resumes sessions.

## Tests

```
npm test
```

## License

MIT
