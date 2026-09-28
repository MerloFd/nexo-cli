const test = require('node:test');
const assert = require('node:assert');

const { extractCtrlEnter, SEQUENCES } = require('../src/ctrlEnter');

test('reconhece a sequencia do Windows Terminal (ESC[27;5;13~)', () => {
  const r = extractCtrlEnter('\x1b[27;5;13~');
  assert.strictEqual(r.hits, 1);
  assert.strictEqual(r.remainder, '');
  assert.strictEqual(r.carry, '');
});

test('reconhece a sequencia CSI u (ESC[13;5u)', () => {
  const r = extractCtrlEnter('\x1b[13;5u');
  assert.strictEqual(r.hits, 1);
  assert.strictEqual(r.remainder, '');
});

test('texto digitado ao redor da sequencia nao se perde', () => {
  const r = extractCtrlEnter('ab\x1b[27;5;13~cd');
  assert.strictEqual(r.hits, 1);
  assert.strictEqual(r.remainder, 'abcd');
});

test('duas pressionadas no mesmo chunk contam as duas', () => {
  const r = extractCtrlEnter('\x1b[27;5;13~\x1b[27;5;13~');
  assert.strictEqual(r.hits, 2);
  assert.strictEqual(r.remainder, '');
});

test('enter comum nao e confundido com ctrl+enter', () => {
  const r = extractCtrlEnter('\r');
  assert.strictEqual(r.hits, 0);
  assert.strictEqual(r.remainder, '\r');
});

test('digitos soltos do meio da sequencia nao vazam pro texto', () => {
  // Sem a interceptacao, o decodificador padrao do readline fragmenta essa
  // sequencia em keypress separados, dois dos quais ("1", "3") apareceriam
  // como texto digitado na busca. A extracao evita isso na origem.
  const r = extractCtrlEnter('\x1b[27;5;13~');
  assert.ok(!r.remainder.includes('1'));
  assert.ok(!r.remainder.includes('3'));
});

test('sequencia cortada ao meio entre dois chunks ainda e reconhecida', () => {
  const meio = Math.floor(SEQUENCES[0].length / 2);
  const primeiraParte = SEQUENCES[0].slice(0, meio);
  const segundaParte = SEQUENCES[0].slice(meio);

  const primeiro = extractCtrlEnter(primeiraParte);
  assert.strictEqual(primeiro.hits, 0, 'pedaco incompleto nao conta ainda');
  assert.ok(primeiro.carry.length > 0, 'guarda o pedaco para completar depois');
  assert.strictEqual(primeiro.remainder, '', 'no fragmento incompleto nada vaza para o texto');

  const segundo = extractCtrlEnter(segundaParte, primeiro.carry);
  assert.strictEqual(segundo.hits, 1, 'completa e conta ao juntar as duas partes');
  assert.strictEqual(segundo.remainder, '');
});

test('prefixo que nunca vai completar a sequencia e liberado como texto', () => {
  // "\x1b[27;9" nao e prefixo de nenhuma sequencia conhecida (o modificador
  // 9 nao existe nas duas que reconhecemos), entao nao deve ficar preso
  // esperando para sempre.
  const r = extractCtrlEnter('\x1b[99;9;9x');
  assert.strictEqual(r.hits, 0);
  assert.strictEqual(r.carry, '');
  assert.strictEqual(r.remainder, '\x1b[99;9;9x');
});

test('string vazia nao quebra', () => {
  const r = extractCtrlEnter('');
  assert.strictEqual(r.hits, 0);
  assert.strictEqual(r.remainder, '');
  assert.strictEqual(r.carry, '');
});
