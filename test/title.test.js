const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NEXO_NO_CACHE = '1';

const { scanSessions } = require('../src/scanSessions');
const { filterItems } = require('../src/selector');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-title-'));
  const projects = path.join(root, 'projects');
  const proj = path.join(projects, 'C--DEV');
  fs.mkdirSync(proj, { recursive: true });
  return { projects, proj };
}

function write(dir, name, lines) {
  fs.writeFileSync(path.join(dir, name), lines.join('\n'), 'utf8');
}

const base = (id = 'sess-1234') => [
  JSON.stringify({ cwd: 'C:\\DEV', sessionId: id }),
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'mensagem original' } }),
];

test('ai-title vira o titulo da sessao', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Verificar APIs dos clientes' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'Verificar APIs dos clientes');
  assert.strictEqual(session.summary, 'mensagem original', 'resumo original e preservado');
});

test('custom-title (/rename) tem prioridade sobre ai-title', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Titulo automatico' }),
    JSON.stringify({ type: 'custom-title', customTitle: 'BUG GRAFICO SEMANAL' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'BUG GRAFICO SEMANAL');
});

test('prioriza o custom-title mesmo se o ai-title vier depois', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'custom-title', customTitle: 'NOME QUE EU DEI' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Titulo automatico tardio' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'NOME QUE EU DEI');
});

test('rename posterior sobrescreve o anterior', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'custom-title', customTitle: 'NOME ANTIGO' }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'mais conversa' } }),
    JSON.stringify({ type: 'custom-title', customTitle: 'NOME NOVO' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'NOME NOVO');
});

test('sessao sem titulo fica com title null', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', base());

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, null);
  assert.strictEqual(session.summary, 'mensagem original');
});

test('titulo com acento e quebra de linha e limpo', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'custom-title', customTitle: 'Gráfico\tsemanal\nquebrado' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'Gráfico semanal quebrado');
});

test('titulo entra na busca mesmo sem estar no resumo', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    JSON.stringify({ type: 'custom-title', customTitle: 'DEPLOY PRODUCAO' }),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(filterItems(sessions, 'deploy').length, 1);
  assert.strictEqual(filterItems(sessions, 'producao').length, 1);
});

test('titulo em arquivo grande e lido do fim, nao do comeco', async () => {
  const { projects, proj } = fixture();
  const filler = Array.from({ length: 4000 }, (_, i) =>
    JSON.stringify({ type: 'assistant', cwd: 'C:\\DEV', message: { role: 'assistant', content: `linha ${i} `.repeat(20) } })
  );

  write(proj, 'grande.jsonl', [
    ...base(),
    JSON.stringify({ type: 'custom-title', customTitle: 'TITULO VELHO' }),
    ...filler,
    JSON.stringify({ type: 'custom-title', customTitle: 'TITULO ATUAL' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'TITULO ATUAL');
});

test('linha de titulo corrompida nao derruba o scan', async () => {
  const { projects, proj } = fixture();
  write(proj, 'a.jsonl', [
    ...base(),
    '{"type":"custom-title","customTitle":quebrado',
    JSON.stringify({ type: 'ai-title', aiTitle: 'Titulo valido' }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.title, 'Titulo valido');
});
