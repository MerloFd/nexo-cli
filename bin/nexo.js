#!/usr/bin/env node
const { daysAgo } = require('../src/scanSessions');
const { scanAll } = require('../src/agents');
const { pickSession, printPlainList } = require('../src/pick');
const { openSession } = require('../src/backends');
const { filterItems } = require('../src/selector');

const HELP = `nexo - troca entre sessoes do Claude Code

Uso:
  nexo                lista as sessoes e abre a escolhida
  nexo <termo>        ja abre a lista filtrada por <termo>
  nexo --list         apenas imprime as sessoes
  nexo --json         imprime as sessoes como JSON
  nexo --open <id>    abre direto a sessao com esse id (aceita prefixo)
  nexo --help         esta ajuda

Na lista:
  W/S, J/K, setas     mover
  /                   filtrar (digite para buscar, Esc limpa)
  Enter               abrir a sessao
  Esc, Q, Ctrl+C      sair
`;

function parseArgs(argv) {
  const flags = { list: false, json: false, help: false, open: null };
  const terms = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--list' || arg === '-l') flags.list = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--open') flags.open = argv[++i] || '';
    else if (!arg.startsWith('-')) terms.push(arg);
  }

  return { flags, query: terms.join(' ') };
}

function reportOpen(session) {
  const { backend, failures } = openSession(session);
  failures.forEach((f) => console.error(`aviso: ${f}`));
  console.log(`Abrindo ${session.dir} [${session.sessionId.slice(0, 8)}] via ${backend}`);
}

async function main() {
  const { flags, query } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  const all = await scanAll();
  if (all.length === 0) {
    console.error('Nenhuma sessao do Claude Code encontrada.');
    process.exitCode = 1;
    return;
  }

  if (flags.open !== null) {
    const id = flags.open.trim();
    const match = all.find((s) => s.sessionId === id) || all.find((s) => s.sessionId.startsWith(id));
    if (!id || !match) {
      console.error(`Sessao nao encontrada: ${id || '(vazio)'}`);
      process.exitCode = 1;
      return;
    }
    reportOpen(match);
    return;
  }

  const sessions = query ? filterItems(all, query) : all;
  if (sessions.length === 0) {
    console.error(`Nenhuma sessao corresponde a "${query}".`);
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

  const chosen = await pickSession(sessions);
  if (!chosen) {
    console.log('Cancelado.');
    return;
  }

  reportOpen(chosen);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exitCode = 1;
});
