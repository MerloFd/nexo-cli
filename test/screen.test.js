const test = require('node:test');
const assert = require('node:assert');

const { frame, ALT_SCREEN_ON, ALT_SCREEN_OFF, CURSOR_HIDE, CURSOR_SHOW } = require('../src/screen');

test('frame volta o cursor pro topo sem apagar a tela inteira primeiro', () => {
  const out = frame('linha 1\nlinha 2');
  assert.ok(out.startsWith('\x1b[H'), 'comeca voltando o cursor, nunca com \\x1b[2J (apaga tudo)');
  assert.ok(!out.includes('\x1b[2J'), 'nao apaga a tela inteira - isso que causava o pisca-pisca');
});

test('frame fecha CADA linha com erase-to-end-of-line, nao so o fim da tela', () => {
  const out = frame('linha 1\nlinha 2\nlinha 3');
  const linhas = out.split('\n');

  assert.strictEqual(linhas.length, 3, 'preserva o numero de linhas');
  // A ultima linha fecha com "\x1b[K\x1b[0J" (limpa a linha E o resto da
  // tela) - todas as outras so com "\x1b[K" antes da quebra pra proxima.
  linhas.slice(0, -1).forEach((l, i) => {
    assert.ok(l.endsWith('\x1b[K'), `linha ${i} nao fecha com \\x1b[K: ${JSON.stringify(l)}`);
  });
  assert.ok(linhas.at(-1).includes('\x1b[K'), 'ultima linha tambem limpa o proprio resto');
});

test('frame termina com erase-to-end-of-screen, pro frame novo poder ter menos linhas que o anterior', () => {
  const out = frame('so uma linha');
  assert.ok(out.endsWith('\x1b[0J'), 'ultimo codigo e sempre o clear-to-end da tela');
});

test('ALT_SCREEN e CURSOR continuam exportados do modulo compartilhado', () => {
  assert.strictEqual(ALT_SCREEN_ON, '\x1b[?1049h');
  assert.strictEqual(ALT_SCREEN_OFF, '\x1b[?1049l');
  assert.strictEqual(CURSOR_HIDE, '\x1b[?25l');
  assert.strictEqual(CURSOR_SHOW, '\x1b[?25h');
});
