const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const { RULES, isPlaceholder } = require('./patterns');
const { entropyFindings, shannon } = require('./entropy');
const cache = require('../cache');

// Cache proprio, separado do cache da lista de sessoes (~/.nexo-cache.json)
// - guardam formas de dado diferentes (findings de segredo vs. metadado de
// sessao) sob a mesma chave "path|mtime|size", e misturar os dois no mesmo
// arquivo corromperia a leitura de um pelo formato do outro.
const SCAN_CACHE_FILE = path.join(os.homedir(), '.nexo-scan-cache.json');

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

// O titulo e o resumo nao vem do arquivo: no Codex vem das colunas de texto
// do state*.sqlite. Isso cria um ponto cego real - se o rollout foi rotacionado
// ou apagado e a linha do banco ficou, varrer so o arquivo reportaria "nada
// encontrado" enquanto a lista do nexo exibe a credencial na tela como resumo
// da sessao. Pior que nao achar: achar e dizer que esta limpo.
//
// Nao tem numero de linha porque nao e um arquivo; line 0 marca isso, e o
// relatorio troca "linha N" por "no titulo/resumo".
function scanMetadata(session) {
  const campos = [session.title, session.summary].filter((v) => typeof v === 'string' && v);
  const findings = [];

  for (const texto of campos) {
    for (const hit of matchRules(texto)) {
      findings.push({
        line: 0,
        rule: hit.rule,
        label: hit.label,
        confidence: hit.confidence || 'media',
        masked: mask(hit.value),
        length: String(hit.value).length,
        inMetadata: true,
      });
    }
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
      // line 0 e o marcador de "veio do metadado, nao de uma linha" - um
      // Math.min cru o escolheria sempre e o relatorio diria "no titulo"
      // mesmo para um segredo que tambem esta no arquivo. Fica com a menor
      // linha REAL, e inMetadata guarda a outra metade da informacao.
      if (f.line > 0) acc.firstLine = acc.firstLine > 0 ? Math.min(acc.firstLine, f.line) : f.line;
      if (f.inMetadata) acc.inMetadata = true;
    } else {
      groups.set(key, {
        rule: f.rule,
        label: f.label,
        confidence: f.confidence,
        masked: f.masked,
        length: f.length,
        occurrences: 1,
        firstLine: f.line,
        inMetadata: Boolean(f.inMetadata),
      });
    }
  }

  const peso = { alta: 0, media: 1, baixa: 2 };
  return [...groups.values()].sort(
    (a, b) => peso[a.confidence] - peso[b.confidence] || b.occurrences - a.occurrences
  );
}

// Sessao encerrada nunca mais muda, e a maioria das sessoes de verdade nao
// tem segredo nenhum - sem cache, "nexo scan" relia o arquivo inteiro toda
// vez so pra achar zero findings de novo. Chavear por mtime+tamanho (igual
// a lista de sessoes ja faz) evita reler o que nao mudou desde o ultimo scan.
async function scanSessions(sessions, { onProgress, cacheFile = SCAN_CACHE_FILE } = {}) {
  const results = [];
  const usaCache = !process.env.NEXO_NO_CACHE;
  const cacheAtual = usaCache ? cache.load(cacheFile) : new Map();
  const cacheNovo = new Map();

  for (const session of sessions) {
    if (!session.filePath) continue;

    let findings;
    let key = null;
    try {
      const stat = fs.statSync(session.filePath);
      key = cache.keyFor(session.filePath, stat);
      const entry = usaCache ? cacheAtual.get(key) : null;
      findings = entry ? entry.findings : await scanFile(session.filePath);
    } catch {
      findings = await scanFile(session.filePath);
    }

    if (onProgress) onProgress(session);
    // So o resultado do ARQUIVO entra no cache: a chave e mtime+tamanho dele,
    // e o metadado vive fora do arquivo (no banco do Codex), entao mudaria sem
    // a chave mudar. Varrer duas strings curtas nao vale um cache proprio.
    if (key) cacheNovo.set(key, { findings });

    findings = [...findings, ...scanMetadata(session)];
    if (findings.length === 0) continue;

    results.push({
      agent: session.agent,
      sessionId: session.sessionId,
      dir: session.dir,
      title: session.title || null,
      filePath: session.filePath,
      // So o Codex traz isto: o redact dele precisa limpar tambem as colunas
      // de texto do state*.sqlite, nao so o rollout.
      dbPath: session.dbPath || null,
      mtime: session.mtime,
      findings: groupFindings(findings),
    });
  }

  if (usaCache) cache.save(cacheNovo, cacheFile);
  return results.sort((a, b) => b.mtime - a.mtime);
}

module.exports = { scanSessions, scanFile, scanMetadata, groupFindings, mask, matchRules, SCAN_CACHE_FILE };
