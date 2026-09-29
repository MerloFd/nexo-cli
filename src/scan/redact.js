const fs = require('fs');
const { matchRules, mask } = require('./index');

// So os padroes de alta confianca entram no redact - sao os que so existem em
// credencial de verdade (chave AWS, token do GitHub, etc). Os de media/baixa
// confianca (atribuicao generica, entropia) tem chance real de ser codigo
// citado ou ruido, e reescrever o log por engano e uma acao sem volta.
const BLOCO_PEM_RE = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;

// A regra de chave privada so marca a linha "-----BEGIN...-----" como sinal
// de que ha uma chave ali - o corpo em base64 que vem depois (o segredo de
// verdade) fica fora do casamento. Redigir so o cabecalho deixaria a chave
// inteira exposta logo abaixo; por isso, so para chave privada, o alvo do
// redact e o bloco PEM inteiro, nao o valor que o scan reporta.
// "only", quando presente, restringe o redact aos achados que o usuario de
// fato selecionou na tela interativa (chave "regra|mascara", o mesmo par que
// agrupa achados em scan/index.js) - sem isso, mantem o comportamento de
// sempre: todo achado de alta confianca no arquivo.
function findSecretsInValue(value, only) {
  const secrets = [];

  for (const hit of matchRules(value).filter((f) => f.confidence === 'alta')) {
    if (only && !only.has(`${hit.rule}|${mask(hit.value)}`)) continue;

    if (hit.rule === 'private-key') {
      for (const bloco of value.matchAll(BLOCO_PEM_RE)) secrets.push(bloco[0]);
    } else {
      secrets.push(hit.value);
    }
  }

  return secrets;
}

function redactValue(value, secrets, countRef) {
  let out = value;
  for (const secret of secrets) {
    if (out.includes(secret)) {
      out = out.split(secret).join('[REDACTED]');
      countRef.count++;
    }
  }
  return out;
}

// Percorre toda string dentro do objeto (mensagem, saida de ferramenta, campo
// aninhado) e troca cada ocorrencia literal do segredo por [REDACTED].
function redactObject(node, secrets, countRef) {
  if (typeof node === 'string') return redactValue(node, secrets, countRef);
  if (Array.isArray(node)) return node.map((item) => redactObject(item, secrets, countRef));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = redactObject(value, secrets, countRef);
    return out;
  }
  return node;
}

const IDLE_MS = 5 * 60 * 1000;

// Uma sessao mexida ha pouco pode estar aberta num agente ativo agora, que
// anexa linha por linha - reescrever o arquivo por baixo dele corromperia o
// proximo append. Sem um jeito de perguntar "esta em uso?", a defesa possivel
// e nao mexer no que mudou ha pouco tempo.
function isPossiblyActive(mtimeMs, now = Date.now()) {
  return now - mtimeMs < IDLE_MS;
}

// Le a sessao inteira, decide linha por linha (cada linha e um JSON
// independente) se ha segredo de alta confianca em algum campo de texto, e
// reescreve so as linhas que mudaram. Linha que nao e JSON valido fica como
// esta - nao e o que o redact resolve, e forcar o parse quebraria o arquivo.
function redactFile(filePath, { only = null } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { changed: 0, error: err.message };
  }

  const linhas = raw.split('\n');
  let mudancas = 0;

  const saida = linhas.map((linha) => {
    if (!linha.trim()) return linha;

    let entry;
    try {
      entry = JSON.parse(linha);
    } catch {
      return linha;
    }

    const secrets = [];
    (function coletar(node) {
      if (typeof node === 'string') secrets.push(...findSecretsInValue(node, only));
      else if (Array.isArray(node)) node.forEach(coletar);
      else if (node && typeof node === 'object') Object.values(node).forEach(coletar);
    })(entry);

    if (secrets.length === 0) return linha;

    const countRef = { count: 0 };
    const limpo = redactObject(entry, secrets, countRef);
    mudancas += countRef.count;
    return JSON.stringify(limpo);
  });

  if (mudancas === 0) return { changed: 0 };

  fs.writeFileSync(filePath, saida.join('\n'), 'utf8');
  return { changed: mudancas };
}

module.exports = { redactFile, isPossiblyActive, findSecretsInValue, redactObject, IDLE_MS };
