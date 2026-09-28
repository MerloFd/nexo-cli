# nexo

Sessions from terminal AI agents, all in one place.

Claude Code's `/resume` and `codex resume` each only see their own agent. If you
run more than one agent across several repositories, nothing shows you the whole
picture — and after a weekend nobody remembers where they stopped.

`nexo` reads the local session files of each agent, puts everything in one
searchable list, and opens the one you pick **in a new terminal**, without
taking down what you already have open.

Supports **Claude Code** and **OpenAI Codex** today.

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
    claude · now · HEAD · 3.5MB · 323k ctx
  FIX RECURRENCES
    codex · 2d ago · frete-refactor · 18.6MB · 3.7M used
```

Type anything and the search starts — no prefix. It ignores accents and case,
treats several terms as AND, and looks at agent, branch, title, directory and
summary. Arrows (or Ctrl+P / Ctrl+N) move, Enter opens, Esc clears the search
and, once empty, quits.

**Ctrl+A** switches scope: every folder on the machine, or only the one you ran
the command from. The header says which is active.

The label is the session's real name: the one you set with `/rename`, or the one
the agent generated, or your first message — in that order.

### Language

English by default. `nexo lang pt` switches to Portuguese, `nexo lang` shows the
current one. The choice is saved in `~/.nexo-config.json`; `NEXO_LANG=pt`
overrides it for a single run without touching the file.

### Where the session opens

From the most capable option to the least:

| Environment | Result |
| --- | --- |
| Herdr | new tab |
| Windows Terminal | new tab |
| tmux | new window |
| classic cmd / PowerShell | new window |
| anything else | prints the ready command |

None of them is required, and if one fails the next takes over.

Inside the VS Code integrated terminal the session opens in an external
terminal: VS Code exposes no API to create a tab from the command line
([vscode#238786](https://github.com/microsoft/vscode/issues/238786)).

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
