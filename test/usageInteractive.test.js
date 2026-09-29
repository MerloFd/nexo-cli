const test = require('node:test');
const assert = require('node:assert');

const { viewportFor } = require('../src/usage/interactive');

test('viewportFor divide por 2 - cada dia/semana ocupa duas linhas de tela (linha + respiro)', () => {
  // Mesmo bug corrigido em src/scan/interactive.js: sem o /2, a lista de
  // dias estourava a altura real do terminal e empurrava o resumo/rodape
  // pra fora da tela.
  assert.strictEqual(viewportFor(50), 19);
  assert.strictEqual(viewportFor(24), 6);
});
