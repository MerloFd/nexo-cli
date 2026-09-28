const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadPreview, loadClaudePreview, MAX_CHARS } = require('../src/preview');

function arquivo(linhas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-preview-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, linhas.join('\n'), 'utf8');
  return file;
}

function userLine(texto) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: texto } });
}

function assistantLine(texto) {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: texto } });
}

test('extrai mensagens de usuario e agente na ordem, com prefixo distinto', async () => {
  const file = arquivo([
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' }),
    userLine('primeira pergunta'),
    assistantLine('primeira resposta'),
  ]);

  const linhas = await loadClaudePreview(file);
  assert.strictEqual(linhas.length, 2);
  assert.ok(linhas[0].startsWith('> '), 'mensagem do usuario tem prefixo >');
  assert.ok(linhas[0].includes('primeira pergunta'));
  assert.ok(!linhas[1].startsWith('> '), 'resposta do agente nao tem o mesmo prefixo');
  assert.ok(linhas[1].includes('primeira resposta'));
});

test('pula ruido automatico (ide_opened_file, caveat) igual ao resto do projeto', async () => {
  const file = arquivo([
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' }),
    userLine('<ide_opened_file>abriu arquivo</ide_opened_file>'),
    userLine('Caveat: mensagem de sistema'),
    userLine('essa e a mensagem de verdade'),
  ]);

  const linhas = await loadClaudePreview(file);
  assert.strictEqual(linhas.length, 1);
  assert.ok(linhas[0].includes('essa e a mensagem de verdade'));
});

test('para de ler ao atingir o limite de caracteres, nao le o arquivo inteiro', async () => {
  const mensagens = Array.from({ length: 200 }, (_, i) => userLine(`mensagem numero ${i} `.repeat(20)));
  const file = arquivo([JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' }), ...mensagens]);

  const linhas = await loadClaudePreview(file);
  const total = linhas.join('').length;

  assert.ok(total <= MAX_CHARS + 500, `deveria parar perto do limite, ficou em ${total}`);
  assert.ok(linhas.length < mensagens.length, 'nao processou todas as 200 mensagens disponiveis');
});

test('conteudo em blocos (array) e suportado, igual ao resumo da lista', async () => {
  const file = arquivo([
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' }),
    userLine([{ type: 'image' }, { type: 'text', text: 'texto dentro de bloco' }]),
  ]);

  const linhas = await loadClaudePreview(file);
  assert.ok(linhas[0].includes('texto dentro de bloco'));
});

test('sessao sem mensagem nenhuma devolve lista vazia, nao null', async () => {
  const file = arquivo([JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' })]);
  assert.deepStrictEqual(await loadClaudePreview(file), []);
});

test('arquivo inexistente devolve lista vazia em vez de lancar excecao', async () => {
  assert.deepStrictEqual(await loadClaudePreview('C:\\nao\\existe\\arquivo.jsonl'), []);
});

test('loadPreview so atende Claude por enquanto - outros agentes devolvem null', async () => {
  const file = arquivo([JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'x' }), userLine('oi')]);

  const claude = await loadPreview({ agent: 'claude', filePath: file });
  assert.ok(Array.isArray(claude) && claude.length === 1);

  assert.strictEqual(await loadPreview({ agent: 'codex', filePath: file }), null);
  assert.strictEqual(await loadPreview({ agent: 'opencode', filePath: null }), null);
});

test('claude sem filePath tambem devolve null, nao quebra', async () => {
  assert.strictEqual(await loadPreview({ agent: 'claude', filePath: null }), null);
});
