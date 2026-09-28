const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collectClaude, collectCodex, totalOf, emptyTotals } = require('../src/usage/collect');
const { agrupar, tabela, bar, human, diaDe, semanaDe, build } = require('../src/usage/report');
const { normalizeDir } = require('../src/paths');

function arquivo(linhas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-usage-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, linhas.join('\n'), 'utf8');
  return file;
}

function turnoClaude(model, at, usage) {
  return JSON.stringify({ timestamp: at, message: { model, usage } });
}

test('atribui cada turno ao modelo daquele turno', async () => {
  const file = arquivo([
    turnoClaude('claude-sonnet-5', '2026-09-20T10:00:00.000Z', { input_tokens: 10, output_tokens: 5 }),
    turnoClaude('claude-opus-5', '2026-09-20T11:00:00.000Z', { input_tokens: 100, output_tokens: 50 }),
  ]);

  const amostras = await collectClaude({ filePath: file, dir: 'C:\\DEV', sessionId: 'x', mtime: 0 });

  assert.strictEqual(amostras.length, 2);
  assert.strictEqual(amostras[0].model, 'claude-sonnet-5');
  assert.strictEqual(amostras[1].model, 'claude-opus-5');
  assert.strictEqual(totalOf(amostras[1].totals), 150);
});

test('soma os quatro componentes de token do Claude', async () => {
  const file = arquivo([
    turnoClaude('m', '2026-09-20T10:00:00.000Z', {
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: 4,
      cache_read_input_tokens: 8,
    }),
  ]);

  const [amostra] = await collectClaude({ filePath: file, dir: 'C:\\DEV', sessionId: 'x', mtime: 0 });

  assert.deepStrictEqual(amostra.totals, {
    input: 1,
    output: 2,
    cacheWrite: 4,
    cacheRead: 8,
    reasoning: 0,
  });
  assert.strictEqual(totalOf(amostra.totals), 15);
});

test('turno sem token nenhum e descartado', async () => {
  const file = arquivo([turnoClaude('m', '2026-09-20T10:00:00.000Z', { input_tokens: 0, output_tokens: 0 })]);
  assert.strictEqual((await collectClaude({ filePath: file, dir: 'd', sessionId: 'x', mtime: 0 })).length, 0);
});

test('Codex conta cache sem duplicar, porque ele o inclui no input', async () => {
  const file = arquivo([
    JSON.stringify({
      timestamp: '2026-09-20T10:00:00.000Z',
      model: 'gpt-5.5',
      last_token_usage: {
        input_tokens: 1000,
        cached_input_tokens: 900,
        output_tokens: 50,
        reasoning_output_tokens: 10,
      },
    }),
  ]);

  const [amostra] = await collectCodex({ filePath: file, dir: 'C:\\DEV', sessionId: 'x', mtime: 0 });

  assert.strictEqual(amostra.totals.input, 100, 'input descontado do cache');
  assert.strictEqual(amostra.totals.cacheRead, 900);
  assert.strictEqual(totalOf(amostra.totals), 1050, 'nao conta os 900 duas vezes');
});

test('sessao do Codex sem rollout entra como total aproximado', async () => {
  const amostras = await collectCodex({
    filePath: null,
    dir: 'C:\\DEV',
    sessionId: 'x',
    mtime: 1,
    tokens: 5000,
    model: 'gpt-5.5',
  });

  assert.strictEqual(amostras.length, 1);
  assert.strictEqual(amostras[0].approximate, true);
  assert.strictEqual(totalOf(amostras[0].totals), 5000);
});

test('arquivo ilegivel devolve lista vazia', async () => {
  assert.deepStrictEqual(
    await collectClaude({ filePath: 'C:\\nao\\existe.jsonl', dir: 'd', sessionId: 'x', mtime: 0 }),
    []
  );
});

test('agrupamento soma por chave', () => {
  const amostras = [
    { agent: 'claude', totals: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } },
    { agent: 'claude', totals: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } },
    { agent: 'codex', totals: { input: 3, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } },
  ];

  const grupos = agrupar(amostras, (s) => s.agent);
  const claude = grupos.find((g) => g.key === 'claude');

  assert.strictEqual(claude.total, 15);
  assert.strictEqual(claude.turns, 2);
});

test('semana agrupa a partir da segunda-feira', () => {
  assert.strictEqual(semanaDe(Date.parse('2026-09-24T12:00:00Z')), '2026-09-21');
  assert.strictEqual(semanaDe(Date.parse('2026-09-21T00:00:00Z')), '2026-09-21');
  assert.strictEqual(diaDe(Date.parse('2026-09-24T12:00:00Z')), '2026-09-24');
});

test('a barra e proporcional e nunca passa da largura', () => {
  assert.strictEqual(bar(0, 100, 10), '');
  assert.ok(bar(100, 100, 10).length <= 10);
  assert.ok(bar(50, 100, 10).length < bar(100, 100, 10).length);
});

test('numeros grandes viram k, M e B', () => {
  assert.strictEqual(human(999), '999');
  assert.strictEqual(human(1500), '2k');
  assert.strictEqual(human(2500000), '2.5M');
  assert.strictEqual(human(8100000000), '8.1B');
});

test('caminho longo e cortado pela esquerda, preservando o fim', () => {
  const linhas = [
    { key: 'C:\\Users\\Alguem\\OneDrive - Empresa Muito Longa\\Documentos\\Projeto\\Front-End', total: 100 },
    { key: 'C:\\DEV', total: 50 },
  ];

  const saida = tabela(linhas, { titulo: 'Por projeto' }).join('\n');

  assert.ok(saida.includes('Front-End'), 'mantem o fim, que identifica');
  assert.ok(saida.includes('\u2026'), 'marca o corte');
  saida.split('\n').forEach((l) => assert.ok(l.length < 80, `linha longa demais: ${l}`));
});

test('maiuscula da unidade de disco nao separa o mesmo projeto', () => {
  assert.strictEqual(normalizeDir('c:\\DEV\\App'), 'C:\\DEV\\App');
  assert.strictEqual(normalizeDir('C:/DEV/App'), 'C:\\DEV\\App');
  assert.strictEqual(normalizeDir('\\\\?\\C:\\DEV\\App'), 'C:\\DEV\\App');
  assert.strictEqual(normalizeDir('C:\\DEV\\App\\'), 'C:\\DEV\\App');
});

test('relatorio avisa quando ha sessao aproximada', () => {
  const amostras = [
    {
      agent: 'codex',
      model: 'gpt-5.5',
      dir: 'C:\\DEV',
      at: Date.now(),
      approximate: true,
      totals: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    },
  ];

  const saida = build(amostras);
  assert.ok(saida.includes('sem detalhe por turno'));
});

test('relatorio nao inventa valor em dinheiro', () => {
  const amostras = [
    {
      agent: 'claude',
      model: 'm',
      dir: 'C:\\DEV',
      at: Date.now(),
      totals: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    },
  ];

  const saida = build(amostras);
  assert.ok(!saida.includes('$'), 'nenhuma cifra no relatorio');
  assert.ok(saida.includes('assinatura'), 'explica por que nao ha custo');
});

test('lista vazia nao quebra o relatorio', () => {
  assert.strictEqual(build([]), 'Nenhum uso de token encontrado.');
  assert.deepStrictEqual(tabela([], { titulo: 'x' }), []);
  assert.deepStrictEqual(emptyTotals(), {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  });
});
