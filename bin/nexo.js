#!/usr/bin/env node
const { daysAgo } = require('../src/scanSessions');
const { scanAll } = require('../src/agents');
const { pickSession, printPlainList } = require('../src/pick');
const { openSession } = require('../src/backends');
const { filterItems } = require('../src/selector');
const { t } = require('../src/i18n');
const { isFirstRun } = require('../src/config');

const HELP = `nexo - sessions from terminal AI agents, all in one place

Usage:
  nexo                list the sessions and open the one you pick
  nexo <term>         open the list already filtered
  nexo scan           look for credentials leaked into the session logs
  nexo usage          token usage overview
  nexo lang [en|pt]   show or change the interface language
  nexo --help         this help

Options:
  --list              just print the sessions
  --json              JSON output (works for scan and usage too)
  --redact            in scan, remove high-confidence secrets (Claude only)
  --week              in usage, group by week instead of day
  --open <id>         open that session directly (a prefix is enough)

In the list:
  type                searches right away, no prefix needed
  arrows, ctrl+p/n    move
  ctrl+a              switch between every folder and the current one
  enter               open the session
  tab                 mark the session (repeat on more), enter opens them all
  esc                 clears the search; with it empty, quits
`;

const COMMANDS = new Set(['scan', 'usage', 'lang']);

function parseArgs(argv) {
  const flags = { list: false, json: false, help: false, open: null, week: false, redact: false };
  const terms = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--list' || arg === '-l') flags.list = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--week' || arg === '--semana') flags.week = true;
    else if (arg === '--redact') flags.redact = true;
    else if (arg === '--open') flags.open = argv[++i] || '';
    else if (!arg.startsWith('-')) terms.push(arg);
  }

  const command = COMMANDS.has(terms[0]) ? terms.shift() : null;

  return { flags, command, args: terms, query: terms.join(' ') };
}

function reportOpen(session) {
  const { backend, failures } = openSession(session);
  failures.forEach((f) => console.error(t('cli.warning', { message: f })));
  console.log(
    t('cli.opening', { dir: session.dir, id: session.sessionId.slice(0, 8), backend })
  );

  // O VS Code nao expoe API para criar aba no terminal integrado, entao a
  // sessao sai em um terminal externo. Avisar evita parecer bug.
  if (process.env.TERM_PROGRAM === 'vscode' && backend !== 'fallback') {
    console.log(t('cli.vscodeNote'));
  }
}

async function main() {
  const { flags, command, args, query } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  if (command === 'lang') {
    process.exitCode = require('../src/commands/lang').run(args[0]);
    return;
  }

  // Dica unica, em vez de perguntar o idioma: pergunta na primeira execucao
  // travaria uso em script e em pipe.
  const primeiraVez = isFirstRun();

  const all = await scanAll();
  if (all.length === 0) {
    console.error(t('cli.noSessions'));
    process.exitCode = 1;
    return;
  }

  if (flags.open !== null) {
    const id = flags.open.trim();
    const match = all.find((s) => s.sessionId === id) || all.find((s) => s.sessionId.startsWith(id));
    if (!id || !match) {
      console.error(t('cli.notFound', { id: id || '-' }));
      process.exitCode = 1;
      return;
    }
    reportOpen(match);
    return;
  }

  const sessions = query ? filterItems(all, query) : all;

  if (command === 'scan') {
    process.exitCode = await require('../src/commands/scan').run(sessions, { json: flags.json, redact: flags.redact });
    return;
  }

  if (command === 'usage') {
    process.exitCode = await require('../src/commands/usage').run(sessions, {
      json: flags.json,
      periodo: flags.week ? 'semana' : 'dia',
    });
    return;
  }

  if (sessions.length === 0) {
    console.error(t('cli.noMatch', { query }));
    process.exitCode = 1;
    return;
  }

  if (flags.json) {
    const payload = sessions.map((s) => ({
      agent: s.agent,
      sessionId: s.sessionId,
      dir: s.dir,
      title: s.title,
      age: daysAgo(s.mtime),
      mtime: new Date(s.mtime).toISOString(),
      summary: s.summary,
    }));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (flags.list) {
    printPlainList(sessions);
    return;
  }

  const { chosen, batch } = await pickSession(sessions);

  // O lote (Tab pra marcar, Enter pra abrir tudo de uma vez) so existe depois
  // que o seletor fecha, porque a tela estava em modo alternativo ate agora;
  // o relatorio so sai aqui.
  for (const entry of batch) {
    entry.failures.forEach((f) => console.error(t('cli.warning', { message: f })));
    if (entry.backend) {
      console.log(
        t('cli.opening', {
          dir: entry.session.dir,
          id: entry.session.sessionId.slice(0, 8),
          backend: entry.backend,
        })
      );
    }
  }

  if (!chosen) {
    // So e cancelamento de fato quando nada foi aberto; um lote bem-sucedido
    // ja fechou o seletor por conta propria, sem precisar dessa mensagem.
    if (batch.length === 0) console.log(t('cli.cancelled'));
    if (primeiraVez) console.log(t('cli.langHint'));
    return;
  }

  reportOpen(chosen);
  if (primeiraVez) console.log(t('cli.langHint'));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
