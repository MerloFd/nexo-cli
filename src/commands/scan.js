const { scanSessions } = require('../scan');
const { isPossiblyActive } = require('../scan/redact');
const { redactSession } = require('../scan/redactSession');
const { runInteractiveScan } = require('../scan/interactive');
const { daysAgo } = require('../scanSessions');
const { t } = require('../i18n');

const AGENTES_COM_REDACT = new Set(['claude', 'codex']);

// Claude e Codex gravam a conversa em JSONL de uma linha por entrada, entao os
// dois usam a mesma reescrita linha a linha. A diferenca e que no Codex o
// segredo fica em DOIS lugares: o rollout e as colunas de texto do
// state*.sqlite (first_user_message, que e justamente o que aparece como
// resumo da sessao na lista). Limpar so um deixaria copia legivel no outro.
function redactCandidates(results) {
  return results.filter(
    (r) => AGENTES_COM_REDACT.has(r.agent) && r.findings.some((f) => f.confidence === 'alta')
  );
}

function applyRedactions(results) {
  const candidatos = redactCandidates(results);
  // A checagem de mtime continua valendo para os dois agentes: o lock do banco
  // prova que ninguem escreve NESTE instante, nao que a sessao esta encerrada.
  // As duas defesas somadas sao mais seguras que qualquer uma sozinha.
  const puladas = candidatos.filter((r) => isPossiblyActive(r.mtime));
  const alvo = candidatos.filter((r) => !isPossiblyActive(r.mtime));

  const resultados = alvo.map((r) => ({ result: r, outcome: redactSession(r) }));

  // Banco ocupado nao e falha nem sucesso: e "tente de novo com o Codex
  // fechado". Entra na mesma lista de puladas que o mtime alimenta.
  const ocupadas = resultados.filter((e) => e.outcome.dbBusy).map((e) => e.result);
  const feitas = resultados.filter(
    (e) => !e.outcome.dbBusy && (e.outcome.changed > 0 || e.outcome.error || e.outcome.dbError)
  );

  return { feitas, puladas: [...puladas, ...ocupadas] };
}

function contar(results, confidence) {
  return results.reduce(
    (n, r) => n + r.findings.filter((f) => f.confidence === confidence).length,
    0
  );
}

function imprimirGrupo(results, confidence, titulo, nota) {
  const comAchado = results
    .map((r) => ({ ...r, findings: r.findings.filter((f) => f.confidence === confidence) }))
    .filter((r) => r.findings.length > 0);

  if (comAchado.length === 0) return;

  console.log(`${titulo}`);
  if (nota) console.log(`${nota}`);
  console.log('');

  for (const result of comAchado) {
    const rotulo = result.title || result.sessionId.slice(0, 8);
    console.log(`  ${rotulo}`);
    console.log(`    ${result.agent} · ${daysAgo(result.mtime)} · ${result.dir}`);

    for (const f of result.findings) {
      const vezes = f.occurrences > 1 ? ` (${f.occurrences}x)` : '';
      // firstLine 0 = o achado nao veio de uma linha do arquivo, veio do
      // titulo/resumo (no Codex, uma coluna do banco). Dizer "linha 0"
      // mandaria o usuario procurar no lugar errado.
      const onde =
        f.firstLine > 0 ? t('scan.lineLabel', { n: f.firstLine }) : t('scan.metadataLabel');
      console.log(`      ${f.label}: ${f.masked}${vezes}  ${onde}`);
    }

    console.log(`    ${result.filePath}`);
    console.log('');
  }
}

function printReport(results) {
  if (results.length === 0) {
    console.log(t('scan.clean'));
    return;
  }

  const altas = contar(results, 'alta');
  const resto = contar(results, 'media') + contar(results, 'baixa');
  console.log(t('scan.summary', { high: altas, rest: resto, sessions: results.length }));

  imprimirGrupo(results, 'alta', t('scan.group.high'));
  imprimirGrupo(
    results,
    'media',
    t('scan.group.medium'),
    t('scan.group.medium.note')
  );
  imprimirGrupo(
    results,
    'baixa',
    t('scan.group.low'),
    t('scan.group.low.note')
  );

  if (altas > 0) {
    console.log(t('scan.advice.title'));
    console.log(t('scan.advice.1'));
    console.log(t('scan.advice.2'));
    console.log(t('scan.advice.3'));
    console.log(t('scan.advice.4'));
  }
}

// Uma sessao do Codex pode terminar em quatro estados diferentes, e o
// relatorio tem que distinguir os quatro - "parcial" lido como sucesso e a
// pior saida possivel aqui, porque o usuario pararia de procurar o segredo.
function linhaDoResultado(outcome) {
  if (outcome.partial) return t('scan.redact.partial', { message: outcome.error });
  if (outcome.error) return t('cli.warning', { message: outcome.error });
  if (outcome.dbError) return t('cli.warning', { message: outcome.dbError });

  // Dois lugares limpos: diz quanto saiu de cada um, senao o numero somado
  // esconde que o indice do Codex tambem guardava copia.
  if (outcome.dbChanged > 0) {
    return t('scan.redact.countSplit', {
      n: outcome.changed,
      rollout: outcome.rolloutChanged,
      db: outcome.dbChanged,
    });
  }

  return t('scan.redact.count', { n: outcome.changed });
}

function printRedactReport({ feitas, puladas }) {
  console.log('');

  if (feitas.length === 0 && puladas.length === 0) {
    console.log(t('scan.redact.nothing'));
    return;
  }

  console.log(t('scan.redact.title'));
  console.log('');

  for (const { result, outcome } of feitas) {
    const rotulo = result.title || result.sessionId.slice(0, 8);
    console.log(`  ${rotulo}: ${linhaDoResultado(outcome)}`);
  }

  if (puladas.length > 0) {
    console.log('');
    console.log(t('scan.redact.skippedActive', { n: puladas.length }));
    for (const r of puladas) console.log(`  ${r.title || r.sessionId.slice(0, 8)}`);
  }

  console.log('');
  console.log(t('scan.redact.note1'));
  console.log(t('scan.redact.note2'));
}

// A saida legivel por maquina carrega apenas metadado: tipo, contagem e
// localizacao. Nunca o valor. Assim ela pode ser agregada por terceiros sem
// transportar o segredo junto.
function printJson(results, redacted) {
  const payload = results.map((r) => ({
    agent: r.agent,
    sessionId: r.sessionId,
    dir: r.dir,
    title: r.title,
    mtime: new Date(r.mtime).toISOString(),
    findings: r.findings.map((f) => ({
      rule: f.rule,
      confidence: f.confidence,
      occurrences: f.occurrences,
      firstLine: f.firstLine,
      length: f.length,
    })),
  }));

  // Sem --redact, mantem o formato de sempre (lista plana) para nao quebrar
  // quem ja consome esse JSON. So com --redact o formato ganha essa segunda
  // chave, porque so ai existe outra coisa para reportar.
  if (!redacted) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        findings: payload,
        redacted: {
          sessions: redacted.feitas.map(({ result, outcome }) => ({
            sessionId: result.sessionId,
            agent: result.agent,
            occurrencesRemoved: outcome.changed || 0,
            // Quebrado por destino so onde existem dois (Codex). Para o Claude
            // fica null, em vez de repetir o total num campo que nao se aplica.
            inSessionLog: outcome.dbChanged === undefined ? null : outcome.rolloutChanged,
            inCodexIndex: outcome.dbChanged === undefined ? null : outcome.dbChanged,
            // true quando o indice foi limpo e o log nao: ainda ha copia do
            // segredo em disco, e quem consome este JSON precisa saber disso.
            partial: Boolean(outcome.partial),
            error: outcome.error || outcome.dbError || null,
          })),
          skippedPossiblyActive: redacted.puladas.map((r) => r.sessionId),
        },
      },
      null,
      2
    )
  );
}

// Tela interativa so entra quando faz sentido: terminal de verdade, nada de
// --json (saida pra maquina) nem --redact (esse fica com o comportamento
// direto de sempre, pra automacao/CI) - e so quando ha achado de alta
// confianca de fato selecionavel, senao a tela abriria vazia a toa.
function podeSerInterativo({ json, redact }, results) {
  if (json || redact) return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  return results.some(
    (r) => AGENTES_COM_REDACT.has(r.agent) && r.findings.some((f) => f.confidence === 'alta')
  );
}

async function run(sessions, { json = false, redact = false } = {}) {
  const comArquivo = sessions.filter((s) => s.filePath);

  if (!json) {
    console.log(t('scan.scanning', { n: comArquivo.length }));
  }

  const results = await scanSessions(comArquivo);

  if (podeSerInterativo({ json, redact }, results)) {
    const redigido = await runInteractiveScan(results);
    if (!redigido) return 0;
    printRedactReport(redigido);
    return redigido.feitas.some((f) => f.outcome.error) ? 1 : 0;
  }

  const redacted = redact ? applyRedactions(results) : null;

  if (json) {
    printJson(results, redacted);
  } else {
    printReport(results);
    if (redacted) printRedactReport(redacted);
  }

  if (redacted) return redacted.feitas.some((f) => f.outcome.error) ? 1 : 0;

  // So achado de alta confianca reprova o exit code - baixa/media confianca
  // sao ruido/hash na maioria das vezes (ver scan.group.low.note), e fazer
  // um pre-commit hook falhar nisso deixaria o gate barulhento demais pra
  // ser adotado de verdade.
  return contar(results, 'alta') > 0 ? 2 : 0;
}

module.exports = { run, printReport, printJson, redactCandidates, applyRedactions };
