const fs = require('fs');
const readline = require('readline');

const { RULES, isPlaceholder } = require('./patterns');
const { entropyFindings, shannon } = require('./entropy');

// O relatorio nunca carrega o segredo inteiro: mostrar o valor recriaria o
// vazamento em log, terminal e historico de shell.
function mask(value) {
  const v = String(value);
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 3)}${'*'.repeat(Math.min(8, v.length - 5))}${v.slice(-2)}`;
}

// As linhas sao JSON, entao o texto vem escapado. Sem desfazer isso, valores
// saem grudados em \" e \\ e viram achados diferentes para o mesmo segredo.
function unescapeJson(line) {
  return line
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Regras genericas casam qualquer atribuicao, inclusive PASSWORD=senha.
// Exigir alguma aleatoriedade separa segredo real de valor de exemplo.
const MIN_ENTROPY_GENERICA = 2.6;
const REGRAS_GENERICAS = new Set(['assignment']);

function matchRules(text) {
  const found = [];

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const match of text.matchAll(rule.re)) {
      // O grupo mais especifico da regra e o valor sensivel; sem grupo, o
      // proprio casamento ja e o segredo.
      const value = match[match.length - 1] || match[1] || match[0];
      if (isPlaceholder(value)) continue;
      if (REGRAS_GENERICAS.has(rule.id) && shannon(value) < MIN_ENTROPY_GENERICA) continue;

      found.push({ rule: rule.id, label: rule.label, confidence: rule.confidence || 'media', value });
    }
  }

  return found;
}

async function scanFile(filePath, { maxLineLength = 20000 } = {}) {
  const findings = [];
  let stream;
  let rl;

  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = 0;
    for await (const raw of rl) {
      lineNumber++;
      if (!raw) continue;

      // Linhas gigantescas sao conteudo de arquivo colado ou saida de
      // ferramenta; varrer o bloco inteiro custa caro e o inicio ja denuncia.
      const cortada = raw.length > maxLineLength ? raw.slice(0, maxLineLength) : raw;
      const line = unescapeJson(cortada);

      for (const hit of [...matchRules(line), ...entropyFindings(line)]) {
        findings.push({
          line: lineNumber,
          rule: hit.rule,
          label: hit.label,
          confidence: hit.confidence || 'baixa',
          masked: mask(hit.value),
          length: String(hit.value).length,
        });
      }
    }
  } catch {
    return findings;
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return findings;
}

// Um mesmo segredo costuma aparecer dezenas de vezes na mesma sessao (o
// agente relê o arquivo, o usuario repete a mensagem). Agrupar evita um
// relatorio de 300 linhas para dois segredos.
function groupFindings(findings) {
  const groups = new Map();

  for (const f of findings) {
    const key = `${f.rule}|${f.masked}`;
    const acc = groups.get(key);
    if (acc) {
      acc.occurrences++;
      acc.firstLine = Math.min(acc.firstLine, f.line);
    } else {
      groups.set(key, {
        rule: f.rule,
        label: f.label,
        confidence: f.confidence,
        masked: f.masked,
        length: f.length,
        occurrences: 1,
        firstLine: f.line,
      });
    }
  }

  const peso = { alta: 0, media: 1, baixa: 2 };
  return [...groups.values()].sort(
    (a, b) => peso[a.confidence] - peso[b.confidence] || b.occurrences - a.occurrences
  );
}

async function scanSessions(sessions, { onProgress } = {}) {
  const results = [];

  for (const session of sessions) {
    if (!session.filePath) continue;

    const findings = await scanFile(session.filePath);
    if (onProgress) onProgress(session);
    if (findings.length === 0) continue;

    results.push({
      agent: session.agent,
      sessionId: session.sessionId,
      dir: session.dir,
      title: session.title || null,
      filePath: session.filePath,
      mtime: session.mtime,
      findings: groupFindings(findings),
    });
  }

  return results.sort((a, b) => b.mtime - a.mtime);
}

module.exports = { scanSessions, scanFile, groupFindings, mask, matchRules };
