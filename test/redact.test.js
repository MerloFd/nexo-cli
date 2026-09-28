const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { redactFile, isPossiblyActive, findSecretsInValue, IDLE_MS } = require('../src/scan/redact');

// Valores montados em runtime: formato valido de credencial, conteudo
// inventado. Ver test/scan.test.js para o motivo - uma string com formato
// real, mesmo falsa, dispara scanner de segredo de terceiros (ja aconteceu).
const repetir = (letra, n) => letra.repeat(n);
const FAKE_AWS = `AK${'IA'}${repetir('Q', 16)}`;
const FAKE_AWS_2 = `AK${'IA'}${repetir('W', 16)}`;
const FAKE_GITHUB = `gh${'p_'}${repetir('Z', 36)}`;

function arquivo(linhas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-redact-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, linhas.join('\n'), 'utf8');
  return file;
}

function ler(file) {
  return fs.readFileSync(file, 'utf8');
}

test('troca o valor de alta confianca por [REDACTED]', () => {
  const file = arquivo([
    JSON.stringify({ type: 'user', message: { role: 'user', content: `minha chave e ${FAKE_AWS}` } }),
  ]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 1);

  const depois = ler(file);
  assert.ok(!depois.includes(FAKE_AWS), 'o valor original nao sobra em lugar nenhum');
  assert.ok(depois.includes('[REDACTED]'));
});

test('linha reescrita continua JSON valido', () => {
  const file = arquivo([
    JSON.stringify({ type: 'user', message: { role: 'user', content: `chave: ${FAKE_AWS}`, extra: 'texto normal' } }),
  ]);

  redactFile(file);

  const linha = ler(file).split('\n')[0];
  assert.doesNotThrow(() => JSON.parse(linha));
  const entry = JSON.parse(linha);
  assert.strictEqual(entry.message.extra, 'texto normal', 'campo sem segredo fica intacto');
});

test('acha o segredo em qualquer profundidade do objeto', () => {
  const file = arquivo([
    JSON.stringify({
      type: 'tool_result',
      output: { stdout: `log: ${FAKE_AWS}`, nested: { deep: [`array com ${FAKE_GITHUB} dentro`] } },
    }),
  ]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 2);

  const depois = ler(file);
  assert.ok(!depois.includes(FAKE_AWS));
  assert.ok(!depois.includes(FAKE_GITHUB));
});

test('mesmo segredo repetido na mesma linha conta cada ocorrencia', () => {
  const file = arquivo([
    JSON.stringify({ a: `primeiro uso: ${FAKE_AWS}`, b: `segundo uso: ${FAKE_AWS}` }),
  ]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 2);
});

test('bloco de chave privada inteiro e removido, nao so o cabecalho', () => {
  const chave = [
    '-----BEGIN RSA PRIVATE KEY-----',
    `${repetir('M', 40)}`,
    `${repetir('Q', 40)}`,
    '-----END RSA PRIVATE KEY-----',
  ].join('\\n');

  const file = arquivo([JSON.stringify({ content: `segue a chave:\\n${chave}\\nfim` })]);

  redactFile(file);

  const depois = ler(file);
  assert.ok(!depois.includes('BEGIN RSA PRIVATE KEY'), 'cabecalho sumiu');
  assert.ok(!depois.includes(repetir('M', 40)), 'corpo em base64 tambem sumiu, nao so o cabecalho');
});

test('achado de media ou baixa confianca nao e mexido', () => {
  const file = arquivo([
    JSON.stringify({ content: 'DB_PASSWORD=Zx9Kq2Lm8Pw4Rt6Vb3Nh7' }),
  ]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 0, 'atribuicao generica e media confianca, redact nao mexe');
  assert.ok(ler(file).includes('Zx9Kq2Lm8Pw4Rt6Vb3Nh7'), 'valor continua la, sem falso positivo destrutivo');
});

test('linha sem segredo nao muda nada', () => {
  const original = JSON.stringify({ content: 'mensagem qualquer sem nada sensivel' });
  const file = arquivo([original]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 0);
  assert.strictEqual(ler(file), original);
});

test('linha que nao e JSON valido fica como esta, sem quebrar o resto', () => {
  const file = arquivo([
    '{isso nao fecha',
    JSON.stringify({ content: `chave: ${FAKE_AWS}` }),
  ]);

  const resultado = redactFile(file);
  assert.strictEqual(resultado.changed, 1);

  const linhas = ler(file).split('\n');
  assert.strictEqual(linhas[0], '{isso nao fecha', 'linha invalida preservada exatamente');
  assert.ok(!linhas[1].includes(FAKE_AWS));
});

test('arquivo sem nenhum segredo devolve changed 0 e nao reescreve', () => {
  const file = arquivo([JSON.stringify({ content: 'nada aqui' })]);
  const antes = fs.statSync(file).mtimeMs;

  redactFile(file);

  assert.strictEqual(fs.statSync(file).mtimeMs, antes, 'arquivo sem alteracao nao e regravado');
});

test('arquivo inexistente devolve erro em vez de lancar excecao', () => {
  const resultado = redactFile('C:\\nao\\existe\\arquivo.jsonl');
  assert.strictEqual(resultado.changed, 0);
  assert.ok(resultado.error);
});

test('sessao mexida agora e considerada possivelmente ativa', () => {
  assert.strictEqual(isPossiblyActive(Date.now()), true);
  assert.strictEqual(isPossiblyActive(Date.now() - IDLE_MS - 1000), false);
});

test('findSecretsInValue ignora placeholder e codigo citado', () => {
  assert.deepStrictEqual(findSecretsInValue('password = md5($senha)'), []);
  assert.deepStrictEqual(findSecretsInValue('sua-chave-aqui'), []);
});

test('findSecretsInValue acha o valor exato de uma regra de alta confianca', () => {
  const achados = findSecretsInValue(`token: ${FAKE_GITHUB}`);
  assert.deepStrictEqual(achados, [FAKE_GITHUB]);
});
