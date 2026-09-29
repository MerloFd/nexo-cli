const test = require('node:test');
const assert = require('node:assert');

process.env.NEXO_LANG = 'en';

const {
  flattenFindings,
  createState,
  applyKey,
  move,
  toggleMark,
  markAndAdvance,
  render,
} = require('../src/scanState');

function resultado(overrides) {
  return {
    sessionId: 'id1',
    agent: 'claude',
    dir: 'C:\\DEV',
    title: 'BUG',
    filePath: 'C:\\DEV\\id1.jsonl',
    mtime: Date.now() - 3600000,
    findings: [{ rule: 'aws-access-key', label: 'AWS access key', confidence: 'alta', masked: 'AKI***AA', occurrences: 1, firstLine: 3 }],
    ...overrides,
  };
}

test('flattenFindings marca redactable so alta confianca em sessao claude', () => {
  const results = [
    resultado(),
    resultado({
      sessionId: 'id2',
      agent: 'codex',
      findings: [{ rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***BB', occurrences: 1, firstLine: 1 }],
    }),
    resultado({
      sessionId: 'id3',
      findings: [{ rule: 'assignment', label: 'Segredo', confidence: 'media', masked: 'abc***xyz', occurrences: 1, firstLine: 5 }],
    }),
  ];

  const rows = flattenFindings(results);
  assert.strictEqual(rows.length, 3);

  const porId = Object.fromEntries(rows.map((r) => [r.sessionId, r]));
  assert.strictEqual(porId.id1.redactable, true, 'claude + alta = selecionavel');
  assert.strictEqual(porId.id2.redactable, false, 'codex ainda nao suporta redact');
  assert.strictEqual(porId.id3.redactable, false, 'media confianca nunca e selecionavel');
});

test('flattenFindings ordena alta antes de media/baixa', () => {
  const results = [
    resultado({
      sessionId: 'id-media',
      findings: [{ rule: 'assignment', label: 'A', confidence: 'media', masked: 'x', occurrences: 1, firstLine: 1 }],
    }),
    resultado({ sessionId: 'id-alta' }),
  ];

  const rows = flattenFindings(results);
  assert.deepStrictEqual(rows.map((r) => r.confidence), ['alta', 'media']);
});

test('toggleMark so marca linha redactable', () => {
  const rows = flattenFindings([
    resultado(),
    resultado({
      sessionId: 'id2',
      agent: 'codex',
      findings: [{ rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***BB', occurrences: 1, firstLine: 1 }],
    }),
  ]);
  const state = createState(rows, { viewport: 5 });

  const marcado = toggleMark(state, rows[0].key);
  assert.ok(marcado.marked.has(rows[0].key));

  const naoMuda = toggleMark(state, rows.find((r) => r.agent === 'codex').key);
  assert.strictEqual(naoMuda.marked.size, 0, 'linha nao redactable nao marca');
});

test('Tab marca e avanca, pulando quem nao e selecionavel sem travar', () => {
  const rows = flattenFindings([
    resultado(),
    resultado({
      sessionId: 'id2',
      agent: 'codex',
      findings: [{ rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***BB', occurrences: 1, firstLine: 1 }],
    }),
    resultado({ sessionId: 'id3' }),
  ]);
  let state = createState(rows, { viewport: 5 });

  state = markAndAdvance(state); // marca id1 (alta), vai pro id2 (codex, nao redactable)
  assert.strictEqual(state.index, 1);
  assert.strictEqual(state.marked.size, 1);

  state = markAndAdvance(state); // tenta marcar id2 (nao entra), avanca pro id3
  assert.strictEqual(state.index, 2);
  assert.strictEqual(state.marked.size, 1, 'codex nao marcou');
});

test('Enter sem nada marcado age sobre a linha destacada, se for redactable', () => {
  const rows = flattenFindings([resultado()]);
  const state = createState(rows, { viewport: 5 });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'move', 'entra no modal de confirmacao, nao redige na hora');
  assert.deepStrictEqual(result.state.confirmRedact.keys, [rows[0].key]);
});

test('Enter sobre linha nao redactable, sem nada marcado, nao faz nada', () => {
  const rows = flattenFindings([
    resultado({ agent: 'codex' }),
  ]);
  const state = createState(rows, { viewport: 5 });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'none');
});

test('modal: S confirma e devolve a acao redact com as chaves certas', () => {
  const rows = flattenFindings([resultado()]);
  let state = createState(rows, { viewport: 5 });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { sequence: 'S' });
  assert.strictEqual(result.action, 'redact');
  assert.deepStrictEqual(result.keys, [rows[0].key]);
  assert.strictEqual(result.state.confirmRedact, null);
});

test('modal: Enter (padrao) so fecha o modal, sem redigir', () => {
  const rows = flattenFindings([resultado()]);
  let state = createState(rows, { viewport: 5 });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.confirmRedact, null);
});

test('Esc sem modal cancela; Esc com modal so fecha o modal', () => {
  const rows = flattenFindings([resultado()]);
  let state = createState(rows, { viewport: 5 });

  assert.strictEqual(applyKey(state, { name: 'escape' }).action, 'cancel');

  state = applyKey(state, { name: 'return' }).state;
  const result = applyKey(state, { name: 'escape' });
  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.confirmRedact, null);
});

test('render mostra a tag de confianca, o valor mascarado e as dicas de tecla', () => {
  const rows = flattenFindings([resultado()]);
  const state = createState(rows, { viewport: 5, color: false, columns: 100 });

  const out = render(state);
  assert.ok(out.includes('ALTA'));
  assert.ok(out.includes('AKI***AA'));
  assert.ok(out.includes('enter redact'));
});

test('render no modal mostra quantas credenciais serao afetadas', () => {
  const rows = flattenFindings([resultado()]);
  let state = createState(rows, { viewport: 5, color: false, columns: 100 });
  state = applyKey(state, { name: 'return' }).state;

  const out = render(state);
  assert.ok(out.includes('Redact 1 credential'));
});

test('move nao estoura os limites da lista', () => {
  const rows = flattenFindings([resultado(), resultado({ sessionId: 'id2' })]);
  let state = createState(rows, { viewport: 5 });

  state = move(state, -5);
  assert.strictEqual(state.index, 0);

  state = move(state, 10);
  assert.strictEqual(state.index, 1);
});
