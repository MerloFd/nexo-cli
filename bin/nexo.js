#!/usr/bin/env node
const { daysAgo } = require('../src/scanSessions');
const { scanAll } = require('../src/agents');
const { pickSession, printPlainList } = require('../src/pick');
const { openSession } = require('../src/backends');
const { filterItems } = require('../src/selector');

const HELP = `nexo - sessoes de agentes de IA de terminal, em um lugar so

Uso:
  nexo                lista as sessoes e abre a escolhida
  nexo <termo>        ja abre a lista filtrada por <termo>
  nexo scan           procura credencial vazada nos logs de sessao
  nexo usage          panorama de uso de tokens
  nexo --help         esta ajuda

Opcoes:
  --list              apenas imprime as sessoes
  --json              saida em JSON (vale para scan e usage)
  --semana            em usage, agrupa por semana em vez de dia
  --open <id>         abre direto a sessao com esse id (aceita prefixo)

Na lista:
  digite              busca direto, sem prefixo
  setas, Ctrl+P/N     mover
  Enter               abrir a sessao
  Esc                 limpa a busca; com ela vazia, sai
`;

function parseArgs(argv) {
  const flags = { list: false, json: false, help: false, open: null, semana: false };
  const terms = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--list' || arg === '-l') flags.list = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--semana' || arg === '--week') flags.semana = true;
    else if (arg === '--open') flags.open = argv[++i] || '';
    else if (!arg.startsWith('-')) terms.push(arg);
  }

  const command = terms[0] === 'scan' || terms[0] === 'usage' ? terms.shift() : null;

  return { flags, command, query: terms.join(' ') };
}

function reportOpen(session) {
  const { backend, failures } = openSession(session);
  failures.forEach((f) => console.error(`aviso: ${f}`));
  console.log(`Abrindo ${session.dir} [${session.sessionId.slice(0, 8)}] via ${backend}`);

  // O VS Code nao expoe API para criar aba no terminal integrado, entao a
  // sessao sai em um terminal externo. Avisar evita parecer bug.
  if (process.env.TERM_PROGRAM === 'vscode' && backend !== 'fallback') {
    console.log('Nota: o terminal do VS Code nao permite abrir abas por comando; abri um terminal externo.');
  }
}

async function main() {
  const { flags, command, query } = parseArgs(process.argv.slice(2));

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

  if (command === 'scan') {
    process.exitCode = await require('../src/commands/scan').run(sessions, { json: flags.json });
    return;
  }

  if (command === 'usage') {
    process.exitCode = await require('../src/commands/usage').run(sessions, {
      json: flags.json,
      periodo: flags.semana ? 'semana' : 'dia',
    });
    return;
  }

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
