// Entropia de Shannon em bits por caractere. Chave aleatoria fica acima de
// ~3.5; palavra de idioma natural fica bem abaixo.
function shannon(text) {
  if (!text) return 0;

  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) || 0) + 1);

  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }

  return bits;
}

// So vale como suspeita quando a string de alta entropia esta perto de uma
// palavra que sugere segredo. Sozinha, ela e indistinguivel de hash de commit,
// UUID ou id de sessao - que aparecem aos milhares nesses arquivos.
const NEARBY = /(senha|password|passwd|secret|token|api[_-]?key|credential|auth|bearer|private[_-]?key)/i;

const CANDIDATE = /[A-Za-z0-9+/=_-]{24,}/g;
const WINDOW = 48;

// Identificadores que os proprios agentes geram aos milhares por sessao.
const IDENTIFICADOR = /^(req|msg|toolu|call|run|thread|asst|evt|file|ses|chatcmpl)[-_]/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Caminho de arquivo e ref de git tem entropia alta e nao sao segredo.
function pareceCaminho(value) {
  return value.includes('/') || value.includes('\\');
}

// Sequencia de palavras minusculas separadas por - ou _ e nome legivel
// (branch, slug, chave de traducao). Segredo real mistura caixa e digito.
function parecePalavras(value) {
  const partes = value.split(/[-_]/);
  return partes.length >= 3 && partes.every((p) => /^[a-z]{2,}$/.test(p));
}

function ruido(value) {
  return IDENTIFICADOR.test(value) || UUID.test(value) || pareceCaminho(value) || parecePalavras(value);
}

function entropyFindings(text, { minEntropy = 4.2 } = {}) {
  const findings = [];

  for (const match of text.matchAll(CANDIDATE)) {
    const value = match[0];
    if (ruido(value)) continue;
    if (shannon(value) < minEntropy) continue;

    const before = text.slice(Math.max(0, match.index - WINDOW), match.index);
    if (!NEARBY.test(before)) continue;

    findings.push({ rule: 'high-entropy', label: 'String de alta entropia perto de palavra sensivel', value });
  }

  return findings;
}

module.exports = { shannon, entropyFindings };
