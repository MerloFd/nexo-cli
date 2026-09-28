const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { t, MESSAGES } = require('../src/i18n');
const { setLang, currentLang, load, isFirstRun, IDIOMAS } = require('../src/config');

function arquivoTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-cfg-'));
  return path.join(dir, 'config.json');
}

test('ingles e o idioma padrao', () => {
  const file = arquivoTemp();
  assert.strictEqual(load(file).lang, 'en');
});

test('todas as chaves existem nos dois idiomas', () => {
  const emIngles = Object.keys(MESSAGES.en).sort();
  const emPortugues = Object.keys(MESSAGES.pt).sort();

  assert.deepStrictEqual(emPortugues, emIngles, 'nenhum idioma pode ter chave a mais ou a menos');
});

test('nenhuma mensagem fica vazia', () => {
  for (const [lang, tabela] of Object.entries(MESSAGES)) {
    for (const [chave, texto] of Object.entries(tabela)) {
      assert.ok(String(texto).trim().length > 0, `${lang}.${chave} esta vazia`);
    }
  }
});

test('os dois idiomas usam os mesmos marcadores em cada chave', () => {
  const marcadores = (texto) => (String(texto).match(/\{(\w+)\}/g) || []).sort();

  for (const chave of Object.keys(MESSAGES.en)) {
    assert.deepStrictEqual(
      marcadores(MESSAGES.pt[chave]),
      marcadores(MESSAGES.en[chave]),
      `os marcadores de ${chave} divergem entre idiomas`
    );
  }
});

test('interpola os parametros', () => {
  assert.strictEqual(t('cli.notFound', { id: 'abc123' }, 'en'), 'Session not found: abc123');
  assert.strictEqual(t('cli.notFound', { id: 'abc123' }, 'pt'), 'Sessao nao encontrada: abc123');
});

test('parametro ausente nao vira "undefined" na tela', () => {
  assert.ok(t('cli.notFound', {}, 'en').includes('{id}'), 'mantem o marcador visivel');
  assert.ok(!t('cli.notFound', {}, 'en').includes('undefined'));
});

test('idioma desconhecido cai no ingles', () => {
  assert.strictEqual(t('usage.input', {}, 'xx'), MESSAGES.en['usage.input']);
});

test('chave inexistente devolve a propria chave em vez de quebrar', () => {
  assert.strictEqual(t('nao.existe.essa.chave', {}, 'en'), 'nao.existe.essa.chave');
});

test('troca de idioma e gravada e lida de volta', () => {
  const file = arquivoTemp();

  assert.strictEqual(setLang('pt', file), true);
  assert.strictEqual(load(file).lang, 'pt');

  assert.strictEqual(setLang('en', file), true);
  assert.strictEqual(load(file).lang, 'en');
});

test('idioma invalido e recusado sem alterar o arquivo', () => {
  const file = arquivoTemp();
  setLang('pt', file);

  assert.strictEqual(setLang('klingon', file), false);
  assert.strictEqual(load(file).lang, 'pt', 'preferencia anterior preservada');
});

test('variavel de ambiente tem prioridade sobre o arquivo', () => {
  const file = arquivoTemp();
  setLang('pt', file);
  const antes = process.env.NEXO_LANG;

  process.env.NEXO_LANG = 'en';
  assert.strictEqual(currentLang(file), 'en');

  process.env.NEXO_LANG = 'invalido';
  assert.strictEqual(currentLang(file), 'pt', 'valor invalido no ambiente e ignorado');

  if (antes === undefined) delete process.env.NEXO_LANG;
  else process.env.NEXO_LANG = antes;
});

test('config corrompida nao derruba nada', () => {
  const file = arquivoTemp();
  fs.writeFileSync(file, '{isso nao e json', 'utf8');

  assert.strictEqual(load(file).lang, 'en');
});

test('primeira execucao e detectada pela ausencia do arquivo', () => {
  const file = arquivoTemp();

  assert.strictEqual(isFirstRun(file), true);
  setLang('en', file);
  assert.strictEqual(isFirstRun(file), false);
});

test('a lista de idiomas suportados bate com as tabelas', () => {
  assert.deepStrictEqual([...IDIOMAS].sort(), Object.keys(MESSAGES).sort());
});
