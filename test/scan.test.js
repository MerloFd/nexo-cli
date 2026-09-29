const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanFile, scanSessions, groupFindings, mask, matchRules } = require('../src/scan');
const { isPlaceholder } = require('../src/scan/patterns');
const { shannon, entropyFindings } = require('../src/scan/entropy');

// Os valores de teste sao montados em tempo de execucao, nunca escritos
// inteiros aqui: um scanner de segredo casa pelo FORMATO, e uma credencial
// falsa com formato valido dispara alerta e polui o historico do repositorio
// do mesmo jeito que uma real. Concatenar mantem o teste honesto sem deixar
// nenhuma string escaneavel no codigo-fonte.
const repetir = (letra, n) => letra.repeat(n);
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const SENHA_FALSA = ['Zx9', 'Kq2', 'Lm8', 'Pw4'].join('');

const FAKE = {
  aws: `AK${'IA'}${repetir('Q', 16)}`,
  github: `gh${'p_'}${repetir('Z', 36)}`,
  anthropic: `sk-${'ant-'}${repetir('Q', 24)}`,
  google: `AI${'za'}${repetir('W', 35)}`,
  jwt: [b64({ alg: 'HS256' }), b64({ sub: '1234567890' }), repetir('Q', 20)].join('.'),
  conexao: `my${'sql'}://raiz:${SENHA_FALSA}@db.interno:3306/loja`,
};

function escrever(linhas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-scan-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, linhas.join('\n'), 'utf8');
  return file;
}

function regras(texto) {
  return matchRules(texto).map((f) => f.rule);
}

test('reconhece credenciais de formato conhecido', () => {
  assert.ok(regras(`chave: ${FAKE.aws}`).includes('aws-access-key'));
  assert.ok(regras(`token ${FAKE.github}`).includes('github-token'));
  assert.ok(regras(`key ${FAKE.anthropic}`).includes('anthropic-key'));
  assert.ok(regras(`g ${FAKE.google}`).includes('google-api-key'));
  assert.ok(regras(`t ${FAKE.jwt}`).includes('jwt'));
  assert.ok(regras(`db ${FAKE.conexao}`).includes('connection-string'));
  assert.ok(regras('-----BEGIN RSA PRIVATE KEY-----').includes('private-key'));
});

test('pega credencial literal de banco no codigo', () => {
  const codigo = `new mysqli("localhost", "raiz_admin", "${SENHA_FALSA}", "loja")`;
  assert.ok(regras(codigo).includes('mysqli-literal'));
});

test('regras de formato conhecido sao de alta confianca', () => {
  const achados = matchRules(`chave: ${FAKE.aws}`);
  assert.strictEqual(achados[0].confidence, 'alta');
});

test('placeholder de documentacao nao vira achado', () => {
  ['xxxxxxxx', 'your-token-here', 'changeme', 'SUA_CHAVE', '<seu-token>', '${API_KEY}', '%TOKEN%']
    .forEach((v) => assert.ok(isPlaceholder(v), `deveria ignorar: ${v}`));
});

test('codigo citado nao vira achado', () => {
  assert.ok(isPlaceholder('md5($_POST[senha])'), 'chamada de funcao');
  assert.ok(isPlaceholder('{{API_KEY}}'), 'template');
  assert.strictEqual(regras('password = md5($senha)').length, 0);
});

test('atribuicao de valor obvio nao vira achado', () => {
  assert.strictEqual(regras('PASSWORD=password').length, 0);
  assert.strictEqual(regras('SECRET=secret').length, 0);
});

test('atribuicao com valor aleatorio vira achado de media confianca', () => {
  const achados = matchRules(`DB_PASSWORD=${SENHA_FALSA}Rt6`);
  assert.strictEqual(achados.length, 1);
  assert.strictEqual(achados[0].confidence, 'media');
});

test('entropia de Shannon separa aleatorio de palavra', () => {
  assert.ok(shannon(`${SENHA_FALSA}Rt6Vb3Nh7`) > 3.5);
  assert.ok(shannon('passwordpassword') < 3);
});

test('entropia so acusa perto de palavra sensivel', () => {
  const solto = `commit ${SENHA_FALSA}Rt6Vb3Nh7Jd5Fg1Ss`;
  const proximo = `token: ${SENHA_FALSA}Rt6Vb3Nh7Jd5Fg1Ss`;

  assert.strictEqual(entropyFindings(solto).length, 0, 'sem contexto, nao acusa');
  assert.strictEqual(entropyFindings(proximo).length, 1, 'com contexto, acusa');
});

test('ruido conhecido nao vira achado de entropia', () => {
  const casos = [
    'token req_011Cf5ezuh5PNGyDuJLqHchp',
    'token 550e8400-e29b-41d4-a716-446655440000',
    'api /home/usuario/public_html/modulos/pages/plataforma',
    'token origin/fix-webservice-token-opcional-e-doc',
  ];

  casos.forEach((c) => assert.strictEqual(entropyFindings(c).length, 0, `deveria ignorar: ${c}`));
});

test('mascara nunca devolve o valor inteiro', () => {
  const m = mask(FAKE.aws);
  assert.ok(!m.includes(FAKE.aws));
  assert.ok(m.startsWith('AKI'));
  assert.ok(m.includes('*'));
  assert.strictEqual(mask('curto'), '*****', 'valor curto some por completo');
});

test('varre arquivo e aponta a linha', async () => {
  const file = escrever([
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'oi' } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: `minha chave ${FAKE.aws}` } }),
  ]);

  const achados = await scanFile(file);
  assert.strictEqual(achados.length, 1);
  assert.strictEqual(achados[0].line, 2);
  assert.strictEqual(achados[0].rule, 'aws-access-key');
});

test('texto escapado em JSON nao corrompe o valor detectado', async () => {
  const file = escrever([
    JSON.stringify({ message: { content: `config: "senha" e ${FAKE.aws}\\n proxima linha` } }),
  ]);

  const achados = await scanFile(file);
  const aws = achados.find((f) => f.rule === 'aws-access-key');
  assert.ok(aws);
  assert.strictEqual(aws.length, FAKE.aws.length, 'nao arrastou barra de escape');
});

test('arquivo inexistente devolve lista vazia em vez de quebrar', async () => {
  assert.deepStrictEqual(await scanFile('C:\\nao\\existe\\x.jsonl'), []);
});

test('mesmo segredo repetido vira um achado com contagem', () => {
  const agrupado = groupFindings([
    { line: 10, rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***AA', length: 20 },
    { line: 4, rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***AA', length: 20 },
    { line: 7, rule: 'jwt', label: 'JWT', confidence: 'alta', masked: 'eyJ***ZZ', length: 60 },
  ]);

  assert.strictEqual(agrupado.length, 2);
  const aws = agrupado.find((f) => f.rule === 'aws-access-key');
  assert.strictEqual(aws.occurrences, 2);
  assert.strictEqual(aws.firstLine, 4, 'guarda a primeira ocorrencia');
});

test('alta confianca aparece antes do que precisa conferencia', () => {
  const agrupado = groupFindings([
    { line: 1, rule: 'high-entropy', label: 'E', confidence: 'baixa', masked: 'a***b', length: 30 },
    { line: 2, rule: 'assignment', label: 'A', confidence: 'media', masked: 'c***d', length: 20 },
    { line: 3, rule: 'aws-access-key', label: 'W', confidence: 'alta', masked: 'e***f', length: 20 },
  ]);

  assert.deepStrictEqual(agrupado.map((f) => f.confidence), ['alta', 'media', 'baixa']);
});

function sessaoDe(filePath) {
  const stat = fs.statSync(filePath);
  return { agent: 'claude', sessionId: 'id1', dir: 'C:\\DEV', filePath, mtime: stat.mtimeMs, title: null };
}

test('scanSessions nao rele um arquivo que nao mudou desde o ultimo scan', async (t) => {
  const file = escrever([JSON.stringify({ message: { content: `chave: ${FAKE.aws}` } })]);
  const cacheFile = path.join(os.tmpdir(), `nexo-scan-cache-${Date.now()}.json`);

  const leituras = t.mock.method(fs, 'createReadStream');

  const primeira = await scanSessions([sessaoDe(file)], { cacheFile });
  assert.strictEqual(primeira[0].findings.length, 1, 'acha o segredo na primeira leitura');
  assert.strictEqual(leituras.mock.calls.length, 1);

  const segunda = await scanSessions([sessaoDe(file)], { cacheFile });
  assert.deepStrictEqual(segunda[0].findings, primeira[0].findings, 'mesmo resultado, vindo do cache');
  assert.strictEqual(leituras.mock.calls.length, 1, 'nao releu o arquivo - o cache resolveu sozinho');

  fs.rmSync(cacheFile, { force: true });
});

test('NEXO_NO_CACHE=1 ignora o cache do scan e rele sempre', async (t) => {
  const file = escrever([JSON.stringify({ message: { content: `chave: ${FAKE.aws}` } })]);
  const cacheFile = path.join(os.tmpdir(), `nexo-scan-cache-${Date.now()}.json`);
  const leituras = t.mock.method(fs, 'createReadStream');

  const antes = process.env.NEXO_NO_CACHE;
  process.env.NEXO_NO_CACHE = '1';

  await scanSessions([sessaoDe(file)], { cacheFile });
  await scanSessions([sessaoDe(file)], { cacheFile });
  assert.strictEqual(leituras.mock.calls.length, 2, 'com NEXO_NO_CACHE, sempre rele');

  if (antes === undefined) delete process.env.NEXO_NO_CACHE;
  else process.env.NEXO_NO_CACHE = antes;
  fs.rmSync(cacheFile, { force: true });
});

test('scanSessions tambem cacheia o "nada encontrado" - nao so os achados', async (t) => {
  const file = escrever(['linha comum, sem segredo nenhum']);
  const cacheFile = path.join(os.tmpdir(), `nexo-scan-cache-${Date.now()}.json`);
  const leituras = t.mock.method(fs, 'createReadStream');

  const primeira = await scanSessions([sessaoDe(file)], { cacheFile });
  const segunda = await scanSessions([sessaoDe(file)], { cacheFile });

  assert.strictEqual(primeira.length, 0);
  assert.strictEqual(segunda.length, 0);
  assert.strictEqual(leituras.mock.calls.length, 1, 'sessao limpa tambem entra no cache, nao so a com achado');

  fs.rmSync(cacheFile, { force: true });
});
