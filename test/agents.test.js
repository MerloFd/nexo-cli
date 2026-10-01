const test = require('node:test');
const assert = require('node:assert');

const { AGENTS, byId, resumeArgs, newSessionArgs } = require('../src/agents');

test('AGENTS lista claude, codex e opencode', () => {
  assert.deepStrictEqual(AGENTS.map((a) => a.id).sort(), ['claude', 'codex', 'opencode']);
});

test('byId acha o adapter certo, ou null se nao existir', () => {
  assert.strictEqual(byId('claude').id, 'claude');
  assert.strictEqual(byId('nao-existe'), null);
});

test('resumeArgs delega pro adapter certo, de acordo com session.agent', () => {
  const args = resumeArgs({ agent: 'claude', sessionId: 'abc123' });
  assert.deepStrictEqual(args, ['claude', '-r', 'abc123']);
});

test('resumeArgs falha claro com agente desconhecido, em vez de chutar um comando', () => {
  assert.throws(() => resumeArgs({ agent: 'inexistente', sessionId: 'x' }), /desconhecido/);
});

test('newSessionArgs e so o nome do CLI - sem flag nenhuma ja comeca do zero', () => {
  assert.deepStrictEqual(newSessionArgs('claude'), ['claude']);
  assert.deepStrictEqual(newSessionArgs('codex'), ['codex']);
  assert.deepStrictEqual(newSessionArgs('opencode'), ['opencode']);
});

test('newSessionArgs falha com agente desconhecido', () => {
  assert.throws(() => newSessionArgs('inexistente'), /desconhecido/);
});
