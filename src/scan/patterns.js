// Regras com formato proprio: quando casam, a chance de falso positivo e
// baixa. Base conceitual nas regras do gitleaks (MIT), reescritas em JS.
// confidence 'alta' = o formato so existe em credencial de verdade.
// 'media' = depende de contexto e pede conferencia humana.
const RULES = [
  { id: 'aws-access-key', label: 'AWS access key', confidence: 'alta', re: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g },
  { id: 'github-token', confidence: 'alta', label: 'Token do GitHub', re: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,})\b/g },
  { id: 'github-pat', confidence: 'alta', label: 'PAT do GitHub', re: /\b(github_pat_[A-Za-z0-9_]{20,})\b/g },
  { id: 'anthropic-key', confidence: 'alta', label: 'Chave da Anthropic', re: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g },
  { id: 'openai-key', confidence: 'alta', label: 'Chave da OpenAI', re: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/g },
  { id: 'slack-token', confidence: 'alta', label: 'Token do Slack', re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g },
  { id: 'google-api-key', confidence: 'alta', label: 'Chave do Google', re: /\b(AIza[0-9A-Za-z_-]{35})\b/g },
  { id: 'stripe-key', confidence: 'alta', label: 'Chave do Stripe', re: /\b((?:sk|rk)_live_[0-9A-Za-z]{20,})\b/g },
  { id: 'private-key', confidence: 'alta', label: 'Chave privada', re: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----)/g },
  { id: 'jwt', confidence: 'alta', label: 'JWT', re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g },
  {
    id: 'connection-string',
    confidence: 'alta',
    label: 'String de conexao com senha',
    re: /\b((?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/"']+:([^\s:@/"']{4,})@[^\s"']+)/g,
  },
  {
    id: 'mysqli-literal',
    confidence: 'alta',
    label: 'Credencial de banco no codigo',
    re: /new\s+mysqli\s*\(\s*["'][^"']*["']\s*,\s*["']([^"']{2,})["']\s*,\s*["']([^"']{4,})["']/g,
  },
  {
    id: 'assignment',
    confidence: 'media',
    label: 'Segredo atribuido em variavel',
    re: /\b((?:DB_)?(?:PASSWORD|PASSWD|SENHA|SECRET|API_?KEY|ACCESS_?TOKEN|PRIVATE_?KEY|CLIENT_?SECRET))\s*[:=]\s*["']?([^\s"',;)]{6,})["']?/gi,
  },
];

// Valores que aparecem em documentacao e exemplo. Sinalizar isso como
// vazamento treina o usuario a ignorar o relatorio inteiro.
const PLACEHOLDERS = [
  /^x+$/i,
  /^\.{3,}$/,
  /^\*+$/,
  /^<.*>$/,
  // Referencia a variavel nao e o segredo: e o nome de onde ele vem.
  /^[$%{]/,
  /^%[A-Z_]+%$/,
  /^(your|my|the)[-_]?/i,
  /^(change|replace|insert)[-_]?(me|this|here)/i,
  // Os logs sao em portugues: o placeholder tambem vem em portugues.
  /^(sua?|seus?|minha?|meus?)[-_]/i,
  /^(coloque|insira|troque|preencha)/i,
  /[-_]?aqui$/i,
  /^(test|fake|dummy|sample|example|placeholder|redacted|senha|password|secret|token|none|null|undefined|true|false)$/i,
  /^(abc|123|foo|bar|baz)/i,
];

function isPlaceholder(value) {
  const v = String(value).trim();
  if (v.length < 6) return true;

  // Chamada de funcao ou template: e codigo citado, nao o segredo em si.
  if (/[()[\]{}]/.test(v)) return true;

  return PLACEHOLDERS.some((re) => re.test(v));
}

module.exports = { RULES, isPlaceholder };
