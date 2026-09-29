const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyRedaction, viewportFor } = require('../src/scan/interactive');
const { flattenFindings } = require('../src/scanState');
const { mask } = require('../src/scan');

const repetir = (letra, n) => letra.repeat(n);
const FAKE_AWS = `AK${'IA'}${repetir('Q', 16)}`;
const FAKE_AWS_2 = `AK${'IA'}${repetir('W', 16)}`;

function arquivo(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-scan-interactive-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, conteudo, 'utf8');
  return file;
}

test('applyRedaction redige so o achado selecionado, deixando o resto do arquivo', () => {
  const file = arquivo(
    JSON.stringify({ type: 'user', message: { role: 'user', content: `chave 1: ${FAKE_AWS} e chave 2: ${FAKE_AWS_2}` } })
  );

  const results = [
    {
      sessionId: 'id1',
      agent: 'claude',
      dir: 'C:\\DEV',
      title: 'BUG',
      filePath: file,
      mtime: Date.now() - 3600000,
      findings: [
        { rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: mask(FAKE_AWS), occurrences: 1, firstLine: 1 },
        { rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: mask(FAKE_AWS_2), occurrences: 1, firstLine: 1 },
      ],
    },
  ];

  const rows = flattenFindings(results);
  const alvo = rows.find((r) => r.masked === mask(FAKE_AWS));

  const { feitas, puladas } = applyRedaction(rows, [alvo.key]);

  assert.strictEqual(puladas.length, 0);
  assert.strictEqual(feitas.length, 1);
  assert.strictEqual(feitas[0].outcome.changed, 1);

  const depois = fs.readFileSync(file, 'utf8');
  assert.ok(!depois.includes(FAKE_AWS), 'o selecionado sumiu');
  assert.ok(depois.includes(FAKE_AWS_2), 'o outro achado da mesma sessao continua intacto');
});

test('applyRedaction pula sessao possivelmente ativa (mexida ha pouco)', () => {
  const file = arquivo(JSON.stringify({ type: 'user', message: { role: 'user', content: `chave: ${FAKE_AWS}` } }));

  const results = [
    {
      sessionId: 'id1',
      agent: 'claude',
      dir: 'C:\\DEV',
      title: 'BUG',
      filePath: file,
      mtime: Date.now(), // "agora" - dentro da janela de possivelmente ativa
      findings: [{ rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: mask(FAKE_AWS), occurrences: 1, firstLine: 1 }],
    },
  ];

  const rows = flattenFindings(results);
  const { feitas, puladas } = applyRedaction(rows, [rows[0].key]);

  assert.strictEqual(feitas.length, 0, 'nao mexeu no arquivo');
  assert.strictEqual(puladas.length, 1);
  assert.ok(fs.readFileSync(file, 'utf8').includes(FAKE_AWS), 'valor original continua no arquivo');
});

test('applyRedaction agrupa duas selecoes do mesmo arquivo numa unica reescrita', () => {
  const file = arquivo(
    JSON.stringify({ type: 'user', message: { role: 'user', content: `chave 1: ${FAKE_AWS} e chave 2: ${FAKE_AWS_2}` } })
  );

  const results = [
    {
      sessionId: 'id1',
      agent: 'claude',
      dir: 'C:\\DEV',
      title: 'BUG',
      filePath: file,
      mtime: Date.now() - 3600000,
      findings: [
        { rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: mask(FAKE_AWS), occurrences: 1, firstLine: 1 },
        { rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: mask(FAKE_AWS_2), occurrences: 1, firstLine: 1 },
      ],
    },
  ];

  const rows = flattenFindings(results);
  const { feitas } = applyRedaction(rows, rows.map((r) => r.key));

  assert.strictEqual(feitas.length, 1, 'um arquivo so, uma entrada no relatorio');
  assert.strictEqual(feitas[0].outcome.changed, 2, 'as duas trocas contam');

  const depois = fs.readFileSync(file, 'utf8');
  assert.ok(!depois.includes(FAKE_AWS) && !depois.includes(FAKE_AWS_2));
});

test('viewportFor divide por 2 - cada achado ocupa duas linhas de tela', () => {
  // Bug real: sem o /2, mais de uma duzia de achados ja estourava a altura
  // do terminal e empurrava o cabecalho pra fora, dando a impressao de que
  // as setas nao faziam nada (a selecao se movia fora da area visivel).
  assert.strictEqual(viewportFor(50), 22);
  assert.strictEqual(viewportFor(24), 9);
  assert.ok(viewportFor(50) * 2 + 6 <= 50, 'o espaço usado pela lista nunca estoura a altura do terminal');
});
