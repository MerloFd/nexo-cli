# nexo

Sessions from terminal AI agents, all in one place.

Claude Code's `/resume` and `codex resume` each only see their own agent. If you
run more than one agent across several repositories, nothing shows you the whole
picture — and after a weekend nobody remembers where they stopped.

`nexo` reads the local session files of each agent, puts everything in one
searchable list, and opens the one you pick **in a new terminal**, without
taking down what you already have open.

Supports **Claude Code** and **OpenAI Codex** today, with **opencode** as a
best-effort adapter (see the note below the table).

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
nexo --help         help
```

### The list

```
  Sessions global (1 of 71)
  ┌────────────────────────────────────────────────────┐
  │ ⌕ Search…                                          │
  └────────────────────────────────────────────────────┘

> Session switcher tool
    claude · C:\DEV\nexo-cli · now · HEAD · 3.5MB · 323k ctx
  FIX RECURRENCES
    codex · C:\DEV\SistemasAtuais\SO5 · 2d ago · frete-refactor · 18.6MB · 3.7M used
```

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
current one. The choice is saved in `~/.nexo-config.json`; `NEXO_LANG=pt`
overrides it for a single run without touching the file.

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

## nexo scan

Scans the session logs for credentials that went through the chat. Findings come
grouped by confidence, and the value is always masked.

```
34 high-confidence finding(s) and 66 to review, across 22 session(s).

HIGH CONFIDENCE - this shape only exists in real credentials:

  Templates for EN
    claude · 4d ago · C:\DEV\Project
      AWS access key: AKI********GZ (56x)  line 1292
```

Two things the report makes explicit:

1. **Rotate the credential.** It was already sent to the provider along with the
   conversation; deleting the local file undoes nothing.
2. Then clean the log, which sits in plain text in your profile and can be read
   by any process running as you.

`nexo scan --json` returns metadata only — type, count and location. Never the
secret itself.

### `--redact`

```
nexo scan --redact
```

Removes high-confidence secrets in place, replacing the value with
`[REDACTED]` and keeping the line valid JSON. Deliberately narrow, for now:

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

Token overview by day (or `--week`), agent, model and project.

```
Total: 8.2B tokens across 22827 turns

  input            2.6M    0%
  output          19.4M    0%
  cache read       7.9B   97%
  cache write    201.0M    2%

By model

  claude-sonnet-5    7.2B  ████████████████████████
  claude-opus-5    547.9M  █▉
  gpt-5.5           23.5M  ▏
```

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
— which is why only the final 64KB are read instead of the whole file. A cache
keyed by mtime and size avoids re-reading what did not change, so the list comes
up in about 100ms. `NEXO_NO_CACHE=1` turns it off.

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
