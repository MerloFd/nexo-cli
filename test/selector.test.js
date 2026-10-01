const test = require('node:test');
const assert = require('node:assert');

// Fixa o idioma: sem isso a suite quebraria conforme a preferencia da maquina.
process.env.NEXO_LANG = 'en';

const { createState, applyKey, render, ANSI } = require('../src/selector');

function items(n) {
  return Array.from({ length: n }, (_, i) => {
    const sessionId = `id${String(i).padStart(6, '0')}`;
    return {
      dir: `C:\\DEV\\proj${i}`,
      sessionId,
      agent: 'claude',
      age: `${i}d atras`,
      summary: `resumo da sessao ${i}`,
      ref: { sessionId, dir: `C:\\DEV\\proj${i}` },
    };
  });
}

function press(state, key) {
  return applyKey(state, key);
}

test('setas navegam a lista', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 2);
  state = press(state, { name: 'up' }).state;
  assert.strictEqual(state.index, 1);
});

test('ctrl+n e ctrl+p navegam', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 'n', ctrl: true }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'p', ctrl: true }).state;
  assert.strictEqual(state.index, 0);
});

test('letras NAO navegam: viram busca', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 's', sequence: 's' }).state;

  assert.strictEqual(state.query, 's', 'a letra foi para a busca');
  assert.strictEqual(state.index, 0, 'o indice nao se moveu');
});

test('navegacao circula nas pontas', () => {
  let state = createState(items(3), { viewport: 3 });
  state = press(state, { name: 'up' }).state;
  assert.strictEqual(state.index, 2, 'subir no topo vai pro fim');
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 0, 'descer no fim volta pro topo');
});

test('viewport acompanha o indice', () => {
  let state = createState(items(20), { viewport: 5 });
  for (let i = 0; i < 7; i++) state = press(state, { name: 'down' }).state;

  assert.strictEqual(state.index, 7);
  assert.ok(state.offset <= state.index, 'indice nao fica acima da janela');
  assert.ok(state.index < state.offset + state.viewport, 'indice nao fica abaixo da janela');
});

test('offset nunca passa do limite', () => {
  let state = createState(items(8), { viewport: 5 });
  state = press(state, { name: 'end' }).state;
  assert.strictEqual(state.index, 7);
  assert.strictEqual(state.offset, 3);
});

test('pageup e pagedown nao circulam', () => {
  let state = createState(items(20), { viewport: 5 });
  state = press(state, { name: 'pageup' }).state;
  assert.strictEqual(state.index, 0);
  state = press(state, { name: 'pagedown' }).state;
  assert.strictEqual(state.index, 5);
});

test('home e end vao pras pontas', () => {
  let state = createState(items(10), { viewport: 4 });
  state = press(state, { name: 'end' }).state;
  assert.strictEqual(state.index, 9);
  state = press(state, { name: 'home' }).state;
  assert.strictEqual(state.index, 0);
});

test('Enter seleciona', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'return' }).action, 'select');
  assert.strictEqual(press(state, { sequence: '\r' }).action, 'select');
});

test('Esc sai quando a busca esta vazia', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'escape' }).action, 'cancel');
});

test('ctrl+c sempre cancela', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'c', ctrl: true }).action, 'cancel');
});

test('tecla sem efeito nao altera o estado', () => {
  const state = createState(items(3), { viewport: 3 });
  const result = press(state, { name: 'f5' });
  assert.strictEqual(result.action, 'none');
  assert.strictEqual(result.state.index, 0);
  assert.strictEqual(result.state.query, '');
});

test('keypress sem objeto de tecla nao quebra', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(applyKey(state, {}).action, 'none');
  assert.strictEqual(applyKey(state).action, 'none');
});

test('lista de um item unico nao quebra com navegacao', () => {
  let state = createState(items(1), { viewport: 5 });
  state = press(state, { name: 'down' }).state;
  state = press(state, { name: 'up' }).state;
  state = press(state, { name: 'pagedown' }).state;
  assert.strictEqual(state.index, 0);
});

test('lista vazia nao quebra', () => {
  const state = createState([], { viewport: 5 });
  const result = press(state, { name: 'down' });
  assert.strictEqual(result.state.index, 0);
  assert.doesNotThrow(() => render(state));
});

test('render marca a linha selecionada e respeita a largura', () => {
  let state = createState(items(10), { viewport: 3, columns: 80, color: false });
  state = press(state, { name: 'down' }).state;

  const lines = render(state).split('\n');
  lines.forEach((line) => assert.ok(line.length <= 80, `linha excede 80 colunas: ${line}`));

  const marked = lines.filter((l) => l.includes('│> '));
  assert.strictEqual(marked.length, 1);
  assert.ok(marked[0].includes('resumo da sessao 1'));
});

test('caixa de busca aparece mesmo sem termo digitado', () => {
  const out = render(createState(items(3), { viewport: 3, columns: 80, color: false }));
  assert.ok(out.includes('Search'), 'mostra o placeholder');
  assert.ok(out.includes('\u250c'), 'desenha a caixa');
});

test('cabecalho mostra posicao e total', () => {
  let state = createState(items(9), { viewport: 4, columns: 80, color: false });
  assert.ok(render(state).includes('(1 of 9)'));

  state = press(state, { name: 'down' }).state;
  assert.ok(render(state).includes('(2 of 9)'));
});

test('cada sessao ocupa duas linhas: rotulo em cima, metadados embaixo', () => {
  const rich = [
    {
      dir: 'C:\\DEV',
      sessionId: 'id1',
      agent: 'claude',
      age: '2d atras',
      branch: 'master',
      bytes: 1677721,
      tokens: 291000,
      tokensKind: 'context',
      title: 'BUG GRAFICO',
      summary: 'mensagem crua',
    },
  ];

  const lines = render(createState(rich, { viewport: 1, columns: 90, color: false }))
    .split('\n')
    .filter((l) => l.trim());

  const head = lines.find((l) => l.includes('BUG GRAFICO'));
  const meta = lines.find((l) => l.includes('claude'));
  const metaSemBorda = meta.replace(/^\s*│/, '').replace(/│\s*$/, '').trim();

  assert.ok(head.includes('│> '), 'a primeira linha traz o marcador e o rotulo');
  assert.deepStrictEqual(metaSemBorda.split(' \u00b7 '), [
    'claude',
    'C:\\DEV',
    '2d atras',
    'master',
    '1.6MB',
    '291k ctx',
  ]);
});

test('metadados ausentes somem em vez de virar campo vazio', () => {
  const magro = [{ dir: 'C:\\DEV', sessionId: 'id1', agent: 'codex', age: 'agora', summary: 'oi' }];
  const out = render(createState(magro, { viewport: 1, columns: 80, color: false }));
  const meta = out.split('\n').find((l) => l.includes('codex'));

  assert.ok(meta.includes('codex \u00b7 C:\\DEV \u00b7 agora'), 'so os campos preenchidos aparecem, sem buracos');
});

test('tokens de contexto e acumulados nao se confundem', () => {
  const build = (tokens, tokensKind) => [
    { dir: 'C:\\DEV', sessionId: 'i', agent: 'a', age: 'agora', summary: 's', tokens, tokensKind },
  ];

  const ctx = render(createState(build(291000, 'context'), { viewport: 1, columns: 80, color: false }));
  const cum = render(createState(build(3672898, 'cumulative'), { viewport: 1, columns: 80, color: false }));

  assert.ok(ctx.includes('291k ctx'));
  assert.ok(cum.includes('3.7M usados'));
});

test('titulo tem prioridade sobre resumo na linha', () => {
  const withTitle = [
    { dir: 'C:\\DEV', sessionId: 'id1', agent: 'claude', age: 'agora', title: 'MEU TITULO', summary: 'mensagem crua' },
  ];
  const out = render(createState(withTitle, { viewport: 1, columns: 80, color: false }));

  assert.ok(out.includes('MEU TITULO'));
  assert.ok(!out.includes('mensagem crua'));
});

test('render mostra indicadores de rolagem', () => {
  let state = createState(items(30), { viewport: 4, columns: 80, color: false });
  const topo = render(state);
  assert.ok(!topo.includes('above'));
  assert.ok(topo.includes('below'));

  for (let i = 0; i < 10; i++) state = press(state, { name: 'down' }).state;
  const meio = render(state);
  assert.ok(meio.includes('above'));
  assert.ok(meio.includes('below'));
});

test('cores saem quando color=false', () => {
  const state = createState(items(3), { viewport: 3, color: false });
  assert.ok(!render(state).includes('\x1b['));
});

test('cores entram quando color=true', () => {
  const state = createState(items(3), { viewport: 3, color: true });
  assert.ok(render(state).includes('\x1b['));
});

test('toggleMark adiciona e remove a sessao do conjunto marcado', () => {
  const { createState, toggleMark } = require('../src/selector');
  let state = createState(items(3), { viewport: 3 });

  assert.strictEqual(state.marked.size, 0);
  state = toggleMark(state, 'id000001');
  assert.ok(state.marked.has('id000001'));
  state = toggleMark(state, 'id000001');
  assert.ok(!state.marked.has('id000001'), 'marcar de novo desmarca');
});

test('item marcado ganha check quando nao esta selecionado', () => {
  const { createState, toggleMark, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 80, color: false });
  state = toggleMark(state, 'id000001');

  const linhas = render(state).split('\n');
  const linhaMarcada = linhas.find((l) => l.includes('resumo da sessao 1'));

  assert.ok(linhaMarcada.includes('│✓ '), 'marca com check quem foi marcado');
});

test('check some quando o item marcado esta selecionado', () => {
  const { createState, toggleMark, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 80, color: false });
  state = toggleMark(state, 'id000000');

  const linhas = render(state).split('\n');
  const atual = linhas.find((l) => l.includes('resumo da sessao 0'));

  assert.ok(atual.includes('│> '), 'selecao tem prioridade visual sobre o check');
});

test('Tab so marca e avanca - nao abre nada', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });

  const result = applyKey(state, { name: 'tab' });
  assert.strictEqual(result.action, 'move', 'Tab nunca fecha nem abre sozinho');
  assert.ok(result.state.marked.has('id000000'));
  assert.strictEqual(result.state.index, 1, 'avanca pro proximo depois de marcar');
});

test('Tab marca varios em sequencia', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state;
  state = applyKey(state, { name: 'tab' }).state;

  assert.strictEqual(state.marked.size, 2);
  assert.ok(state.marked.has('id000000'));
  assert.ok(state.marked.has('id000001'));
  assert.strictEqual(state.index, 2);
});

test('Tab em lista vazia nao quebra', () => {
  const { createState, applyKey } = require('../src/selector');
  const result = applyKey(createState([], { viewport: 3 }), { name: 'tab' });

  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.marked.size, 0);
});

test('Enter sem nada marcado abre so o item destacado, como sempre', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'select');
});

test('Enter com marcas pendentes vira lote, ignorando o item so destacado', () => {
  const { createState, applyKey, move } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state; // marca 0, vai pro 1
  state = applyKey(state, { name: 'tab' }).state; // marca 1, vai pro 2
  state = move(state, 1); // destaca 3, sem marcar

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'open-batch');
  assert.strictEqual(result.items.length, 2, 'so os marcados entram no lote');
  assert.deepStrictEqual(
    result.items.map((i) => i.sessionId).sort(),
    ['id000000', 'id000001']
  );
});

test('marca sobrevive a busca que esconde o item da tela', () => {
  const { createState, applyKey, setQuery } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state; // marca item 0
  state = setQuery(state, 'sessao 3'); // filtro esconde o item 0

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'open-batch');
  assert.strictEqual(result.items[0].sessionId, 'id000000', 'a marca nao se perde com o filtro');
});

test('sem --send, Enter abre direto sem passar por modal nenhum', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'select');
  assert.strictEqual(result.state.confirmSend, null);
});

test('com --send, Enter suspende em modal em vez de abrir na hora', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3, sendPrompt: 'onde paramos?' });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'move', 'ainda nao abre nada - so entra no modal');
  assert.ok(result.state.confirmSend, 'modal fica pendente');
  assert.strictEqual(result.state.confirmSend.pending.type, 'select');
});

test('no modal, S confirma o envio e finalmente libera a acao pendente', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, sendPrompt: 'onde paramos?' });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { sequence: 'S' });
  assert.strictEqual(result.action, 'select');
  assert.strictEqual(result.send, true);
  assert.strictEqual(result.state.confirmSend, null, 'modal fecha depois de responder');
});

test('no modal, Enter (padrao) libera a acao sem mandar nada', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, sendPrompt: 'onde paramos?' });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'select');
  assert.strictEqual(result.send, false, 'padrao do modal e nao mandar');
});

test('no modal, Esc cancela e volta pra lista sem abrir nada', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, sendPrompt: 'onde paramos?' });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { name: 'escape' });
  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.confirmSend, null);
});

test('no modal, teclas de busca/navegacao nao vazam pra lista por baixo', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, sendPrompt: 'onde paramos?' });
  state = applyKey(state, { name: 'return' }).state;

  const result = applyKey(state, { sequence: 'x', name: 'x' });
  assert.strictEqual(result.action, 'none');
  assert.strictEqual(result.state.query, '', 'nao comeca a buscar por engano');
  assert.ok(result.state.confirmSend, 'modal continua na tela');
});

test('render mostra o modal de confirmacao em vez da lista, quando pendente', () => {
  const { createState, applyKey, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 90, sendPrompt: 'onde paramos?', color: false });
  state = applyKey(state, { name: 'return' }).state;

  const out = render(state);
  assert.ok(out.includes('onde paramos?'), 'mostra o texto que sera mandado');
  assert.ok(out.includes('[S] Yes'), 'mostra a opcao de confirmar');
  assert.ok(!out.includes('Buscar'), 'a caixa de busca fica escondida atras do modal');
});

test('com --send e lote marcado, modal carrega os itens do lote, nao so o destacado', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(4), { viewport: 4, sendPrompt: 'onde paramos?' });

  state = applyKey(state, { name: 'tab' }).state;
  state = applyKey(state, { name: 'tab' }).state;
  const suspenso = applyKey(state, { name: 'return' });

  assert.strictEqual(suspenso.state.confirmSend.pending.type, 'open-batch');
  assert.strictEqual(suspenso.state.confirmSend.pending.items.length, 2);

  const result = applyKey(suspenso.state, { sequence: 'S' });
  assert.strictEqual(result.action, 'open-batch');
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.send, true);
});

test('sem newSessionAgents, atNewSession nunca liga - comportamento de sempre', () => {
  const { createState } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(state.atNewSession, false);
  assert.strictEqual(state.index, 0, 'indice 0 continua apontando pro primeiro item de verdade');
});

test('com newSessionAgents, a lista abre com "nova sessao" ja destacada', () => {
  const { createState } = require('../src/selector');
  const state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });
  assert.strictEqual(state.atNewSession, true);
});

test('Down sai da linha de nova sessao pro primeiro item; Up volta', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.atNewSession, false);
  assert.strictEqual(state.index, 0);

  state = applyKey(state, { name: 'up' }).state;
  assert.strictEqual(state.atNewSession, true, 'Up no primeiro item de verdade volta pra nova sessao');
});

test('Up na linha de nova sessao (com wrap) vai pro ultimo item', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  state = applyKey(state, { name: 'up' }).state;
  assert.strictEqual(state.atNewSession, false);
  assert.strictEqual(state.index, 2, 'wrap leva pro ultimo item de verdade');
});

test('Home vai pra nova sessao; End vai pro ultimo item de verdade', () => {
  const { createState, applyKey, move } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });
  state = move(state, 1);
  assert.strictEqual(state.atNewSession, false);

  const home = applyKey(state, { name: 'home' });
  assert.strictEqual(home.state.atNewSession, true);

  const end = applyKey(home.state, { name: 'end' });
  assert.strictEqual(end.state.atNewSession, false);
  assert.strictEqual(end.state.index, 2);
});

test('Tab na linha de nova sessao marca ela tambem, e avanca', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  state = applyKey(state, { name: 'tab' }).state;
  assert.strictEqual(state.newSessionMarked, true);
  assert.strictEqual(state.marked.size, 0, 'nao mexe no Set de sessoes reais');
  assert.strictEqual(state.atNewSession, false);
  assert.strictEqual(state.index, 0);
});

test('Enter na nova sessao (destacada, nada marcado) trava escolhendo provedor', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'move', 'ainda nao abre nada de verdade');
  assert.deepStrictEqual(result.state.pickingProvider, { index: 0 });
  assert.strictEqual(result.state.newSessionMarked, true, 'autosseleciona quando nada mais estava marcado');
});

test('travado escolhendo provedor, setas ciclam (com wrap) e Enter confirma', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex', 'opencode'] });
  state = applyKey(state, { name: 'return' }).state;

  state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.pickingProvider.index, 1);

  state = applyKey(state, { name: 'up' }).state;
  state = applyKey(state, { name: 'up' }).state;
  assert.strictEqual(state.pickingProvider.index, 2, 'wrap pro ultimo provedor');

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'new-session-batch');
  assert.strictEqual(result.agent, 'opencode');
  assert.deepStrictEqual(result.items, [], 'nenhuma sessao real estava marcada');
  assert.strictEqual(result.state.pickingProvider, null);
  assert.strictEqual(result.state.newSessionMarked, false);
});

test('travado escolhendo provedor, nenhuma outra tecla faz nada', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });
  state = applyKey(state, { name: 'return' }).state;

  const antes = state;
  const result = applyKey(state, { sequence: 'x', name: 'x' });
  assert.strictEqual(result.action, 'none');
  assert.strictEqual(result.state, antes, 'nem busca, nem navegacao da lista respondem travado');
});

test('Esc travado cancela so a nova sessao - marcas de sessoes reais continuam', () => {
  const { createState, applyKey, move } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  state = move(state, 1); // destaca um item real
  state = applyKey(state, { name: 'tab' }).state; // marca esse item real
  state = applyKey(state, { name: 'home' }).state; // volta pra nova sessao
  state = applyKey(state, { name: 'tab' }).state; // marca a nova sessao tambem
  state = applyKey(state, { name: 'return' }).state; // trava escolhendo provedor

  const result = applyKey(state, { name: 'escape' });
  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.pickingProvider, null);
  assert.strictEqual(result.state.newSessionMarked, false, 'desiste so da nova sessao');
  assert.strictEqual(result.state.marked.size, 1, 'a marca da sessao real sobrevive');
});

test('lote com sessao real marcada + nova sessao: o provedor escolhido some junto dos itens reais no resultado', () => {
  const { createState, applyKey, move } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, newSessionAgents: ['claude', 'codex'] });

  state = move(state, 1);
  state = applyKey(state, { name: 'tab' }).state; // marca sessao real
  state = applyKey(state, { name: 'home' }).state;
  state = applyKey(state, { name: 'tab' }).state; // marca nova sessao
  state = applyKey(state, { name: 'return' }).state; // trava

  const result = applyKey(state, { name: 'return' }); // confirma claude (index 0)
  assert.strictEqual(result.action, 'new-session-batch');
  assert.strictEqual(result.agent, 'claude');
  assert.strictEqual(result.items.length, 1, 'a sessao real marcada entra no lote junto');
});

test('render mostra a linha de nova sessao destacada, e o painel de provedor fica do lado, nao num modal', () => {
  const { createState, applyKey, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 120, color: false, newSessionAgents: ['claude', 'codex'] });

  const lista = render(state);
  assert.ok(lista.includes('> [+] - New session'));
  assert.ok(lista.includes('pick a provider'), 'painel ja aparece so de estar destacada, antes do Enter');
  assert.ok(lista.includes('Buscar') || lista.includes('Search'), 'a lista continua visivel ao lado, nao e um modal');

  state = applyKey(state, { name: 'return' }).state;
  const travado = render(state);
  assert.ok(travado.includes('Choose provider:'));
  assert.ok(travado.includes('> claude'));
  assert.ok(travado.includes('codex'));
});

test('painel de provedor: o divisor fica na mesma coluna em toda linha, mesmo colorida', () => {
  const { createState, applyKey, render, visibleLength } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 120, color: true, newSessionAgents: ['claude', 'codex', 'opencode'] });
  state = applyKey(state, { name: 'return' }).state;

  const linhas = render(state)
    .split('\n')
    .filter((l) => (l.includes('New session') || l.includes('resumo')) && l.includes('│'));

  const posicoes = new Set(linhas.map((l) => visibleLength(l.slice(0, l.indexOf('│')))));
  assert.strictEqual(posicoes.size, 1, `divisor em colunas diferentes: ${[...posicoes]}`);
});

test('terminal estreito demais nao mostra o painel de provedor (sem espaco pras duas colunas)', () => {
  const { createState, render } = require('../src/selector');
  const state = createState(items(3), { viewport: 3, columns: 50, color: false, newSessionAgents: ['claude', 'codex'] });

  const out = render(state);
  assert.ok(!out.includes('pick a provider'));
});

test('cada provedor no painel usa a mesma cor da marca que a lista principal', () => {
  const { createState, applyKey, render } = require('../src/selector');
  let state = createState(items(3), {
    viewport: 3,
    columns: 120,
    color: true,
    newSessionAgents: ['claude', 'codex', 'opencode'],
  });
  state = applyKey(state, { name: 'return' }).state;

  const out = render(state);
  assert.ok(out.includes('\x1b[38;2;217;119;87m'), 'claude com a cor terracota da marca');
  assert.ok(out.includes('\x1b[38;2;16;163;127m'), 'codex com o verde da marca');
  assert.ok(out.includes('\x1b[38;2;0;122;255m'), 'opencode com o azul da marca');
});

test('linha de nova sessao mostra o texto combinado e o path atual em cinza', () => {
  const { createState, render, ANSI } = require('../src/selector');
  const state = createState(items(3), {
    viewport: 3,
    columns: 90,
    color: true,
    cwd: 'C:\\DEV\\Projeto',
    newSessionAgents: ['claude', 'codex'],
  });

  const out = render(state);
  assert.ok(out.includes('[+] - New session'));
  assert.ok(out.includes('C:\\DEV\\Projeto'));
  assert.ok(out.includes(`${ANSI.dim}C:\\DEV\\Projeto${ANSI.reset}`), 'path pintado em dim');
});

test('idade recente, de hoje, da semana e antiga ganham cores diferentes', () => {
  const base = { dir: 'C:\DEV', sessionId: 'id1', agent: 'claude', summary: 's' };
  const agora = Date.now();

  // A linha selecionada (unica de cada lista) sempre ganha ciano no titulo -
  // isolar a linha de METADADOS (a segunda) evita que essa cor de selecao se
  // misture com a cor de idade que o teste quer checar.
  const metaLinhas = [
    { ...base, age: 'agora', mtime: agora - 30 * 60 * 1000 },
    { ...base, age: '5h atras', mtime: agora - 5 * 3600 * 1000 },
    { ...base, age: '3d atras', mtime: agora - 3 * 86400 * 1000 },
    { ...base, age: '2mo atras', mtime: agora - 60 * 86400 * 1000 },
  ].map((item) => {
    const linhas = render(createState([item], { viewport: 1, columns: 90, color: true })).split('\n');
    return linhas.find((l) => l.includes('claude'));
  });

  assert.ok(metaLinhas[0].includes('\x1b[32m'), 'recente (< 1h) e verde');
  assert.ok(metaLinhas[1].includes('\x1b[36m'), 'de hoje (< 24h) e ciano');
  assert.ok(metaLinhas[2].includes('\x1b[33m'), 'da semana (< 7d) e amarelo');
  assert.ok(
    !metaLinhas[3].includes('\x1b[32m') && !metaLinhas[3].includes('\x1b[36m') && !metaLinhas[3].includes('\x1b[33m'),
    'antiga nao usa nenhuma das cores de recente'
  );
});

test('sem cor habilitada, a idade nao carrega nenhum codigo ANSI', () => {
  const item = { dir: 'C:\DEV', sessionId: 'id1', agent: 'claude', age: 'agora', mtime: Date.now(), summary: 's' };
  const out = render(createState([item], { viewport: 1, columns: 90, color: false }));

  assert.ok(!out.includes('\x1b['));
  assert.ok(out.includes('agora'));
});

test('linha que precisa truncar cai de volta no dim uniforme, sem quebrar cor', () => {
  const item = {
    dir: 'C:\DEV',
    sessionId: 'id1',
    agent: 'claude',
    age: 'agora',
    mtime: Date.now(),
    branch: 'uma-branch-com-nome-bem-comprido-para-forcar-o-corte-da-linha',
    summary: 's',
  };

  const out = render(createState([item], { viewport: 1, columns: 30, color: true }));
  const linhas = out.split('\n').filter((l) => l.trim());

  // A linha de metadados cortada deve caber no limite e nao deixar um codigo
  // ANSI pela metade (o que corromperia o resto do terminal).
  const meta = linhas.find((l) => l.includes('claude'));
  assert.ok(meta);
  const semCores = meta.replace(/\x1b\[[0-9]*m/g, '');
  assert.ok(semCores.length <= 30, `linha visivel excede a largura: "${semCores}" (${semCores.length})`);
});

test('sem mtime, a idade usa o dim padrao em vez de quebrar', () => {
  const item = { dir: 'C:\DEV', sessionId: 'id1', agent: 'claude', age: 'agora', summary: 's' };
  assert.doesNotThrow(() => render(createState([item], { viewport: 1, columns: 90, color: true })));
});

const { previewActive, visibleLength, PREVIEW_BREAKPOINT } = require('../src/selector');

test('preview vem ligado por padrao, mas so ativa com largura suficiente', () => {
  const state = createState(items(3), { viewport: 3, columns: PREVIEW_BREAKPOINT });
  assert.strictEqual(previewActive(state), true, 'comeca ligado por padrao');

  const desligado = applyKey(state, { name: 't', ctrl: true }).state;
  assert.strictEqual(previewActive(desligado), false);

  const estreito = { ...state, columns: PREVIEW_BREAKPOINT - 1 };
  assert.strictEqual(previewActive(estreito), false, 'sem largura suficiente, nao mostra mesmo ligado');
});

test('Ctrl+T so alterna a flag, sem mexer em selecao ou busca', () => {
  let state = createState(items(5), { viewport: 5, columns: 130 });
  state = applyKey(state, { name: 'down' }).state;

  const antes = { index: state.index, query: state.query };
  state = applyKey(state, { name: 't', ctrl: true }).state;

  assert.strictEqual(state.index, antes.index);
  assert.strictEqual(state.query, antes.query);
});

test('visibleLength ignora codigo ANSI ao contar', () => {
  const colorido = '\x1b[1m\x1b[36mtexto\x1b[0m';
  assert.strictEqual(visibleLength(colorido), 5);
  assert.strictEqual(visibleLength('sem cor'), 7);
});

test('painel de preview mostra "carregando" quando previewLines e undefined', () => {
  const state = createState(items(3), { viewport: 3, columns: 130, color: false });

  const out = render(state, undefined);
  assert.ok(out.includes('Loading preview'));
});

test('painel mostra aviso quando o agente nao tem previa (null)', () => {
  const state = createState(items(3), { viewport: 3, columns: 130, color: false });

  const out = render(state, null);
  assert.ok(out.includes('No preview for this agent'));
});

test('painel mostra o conteudo quando previewLines chega preenchido', () => {
  const state = createState(items(3), { viewport: 3, columns: 130, color: false });

  const out = render(state, ['> pergunta do usuario', '  resposta do agente']);
  assert.ok(out.includes('pergunta do usuario'));
  assert.ok(out.includes('resposta do agente'));
});

test('com Ctrl+T desligado, o conteudo da previa nao aparece mesmo se fornecido', () => {
  let state = createState(items(3), { viewport: 3, columns: 130, color: false });
  state = applyKey(state, { name: 't', ctrl: true }).state;

  const out = render(state, ['isso nao deveria aparecer']);
  assert.ok(!out.includes('isso nao deveria aparecer'));
});

test('terminal estreito nao mostra previa mesmo com preview ligado por padrao', () => {
  const state = createState(items(3), { viewport: 3, columns: 80, color: false });

  const out = render(state, ['conteudo que nao cabe']);
  assert.ok(!out.includes('conteudo que nao cabe'));
});

test('previa muito longa nao estica o quadro além da lista', () => {
  const state = createState(items(3), { viewport: 3, columns: 130, color: false });

  const previaEnorme = Array.from({ length: 50 }, (_, i) => `linha ${i}`);
  const linhasSemPreview = render(state, undefined).split('\n').length;
  const linhasComPreview = render(state, previaEnorme).split('\n').length;

  assert.strictEqual(linhasComPreview, linhasSemPreview, 'a altura do quadro nao muda com o tamanho da previa');
});

test('linha de preview mais larga que a coluna e cortada, nao estoura', () => {
  const state = createState(items(3), { viewport: 3, columns: PREVIEW_BREAKPOINT, color: false });

  const linhaEnorme = 'x'.repeat(500);
  const out = render(state, [linhaEnorme]);

  out.split('\n').forEach((l) => assert.ok(l.length <= PREVIEW_BREAKPOINT + 20, `linha suspeita: ${l.length} chars`));
});

test('o divisor do painel fica na mesma coluna em toda linha, mesmo com cores variando', () => {
  const variados = [
    { dir: 'C:\DEV', sessionId: 'id1', agent: 'claude', age: 'agora', mtime: Date.now(), branch: 'master', summary: 'a' },
    { dir: 'C:\DEV', sessionId: 'id2', agent: 'codex', age: '3d atras', mtime: Date.now() - 3 * 86400000, tokens: 500000, tokensKind: 'cumulative', summary: 'b' },
  ];

  const state = createState(variados, { viewport: 5, columns: 130, color: true });

  const out = render(state, ['linha da previa']);
  const posicoes = out
    .split('\n')
    .filter((l) => (l.includes('claude') || l.includes('codex')) && l.includes('│'))
    .map((l) => visibleLength(l.slice(0, l.indexOf('│'))));

  // Cada linha tem cores diferentes (idade verde/dim, branch, tokens) mas o
  // divisor precisa cair na mesma coluna visivel em todas - senao o
  // alinhamento do painel desmancha conforme o conteudo de cada sessao.
  const distintas = new Set(posicoes.map((p) => Math.round(p)));
  assert.ok(distintas.size <= 1, `divisor em colunas diferentes: ${[...distintas]}`);
});

test('titulo comprido demais para a coluna esquerda e cortado, nao estoura o divisor', () => {
  const longo = [
    {
      dir: 'C:\DEV',
      sessionId: 'id1',
      agent: 'codex',
      age: '109d atras',
      mtime: Date.now(),
      summary:
        'To com um problema na exibição dos dados na table no frete maritimo nessa pasta gigante de verdade que nao cabe em lugar nenhum',
    },
  ];

  const state = createState(longo, { viewport: 3, columns: 130, color: false });

  const out = render(state, null);
  const corpo = out.split('\n').filter((l) => l.includes('│') && !l.includes('⌕'));

  corpo.forEach((linha) => {
    assert.ok(linha.length <= 130 + 5, `linha ultrapassou a largura do terminal: ${linha.length} chars`);
  });

  // A posicao do divisor precisa ser consistente mesmo quando o texto original
  // era bem mais comprido que a coluna reservada pra ele.
  const posicoes = new Set(corpo.map((l) => l.indexOf('│')));
  assert.strictEqual(posicoes.size, 1, `divisor fora de posicao: ${[...posicoes]}`);
});

test('titulo comprido colorido nao vaza cor pro lado do preview', () => {
  const longo = [
    {
      dir: 'C:\DEV',
      sessionId: 'id1',
      agent: 'claude',
      age: 'agora',
      mtime: Date.now(),
      summary: 'x'.repeat(200),
    },
  ];

  let state = createState(longo, { viewport: 3, columns: 130, color: true });
  state = applyKey(state, { name: 'down' }).state; // desmarca como selecionado, usa a cor do meta

  const out = render(state, ['previa']);
  const linhaMeta = out.split('\n').find((l) => l.includes('previa'));

  // Depois do reset (\x1b[0m) que fecha o texto truncado, nao pode sobrar
  // outro codigo de cor ainda aberto antes do divisor.
  assert.ok(linhaMeta.includes('\x1b[0m'), 'a linha cortada fecha a cor com reset');
});

test('mostra so o titulo na primeira linha, o path vai para a linha de metadados', () => {
  const state = createState(items(1), { viewport: 1, columns: 90, color: false });
  const out = render(state);
  const linhas = out.split('\n');

  const head = linhas.find((l) => l.includes('resumo da sessao 0'));
  assert.ok(head, 'titulo aparece na primeira linha');
  assert.ok(!head.includes('|'), 'path nao fica mais junto do titulo');

  const meta = linhas.find((l) => l.includes('claude') || l.includes('codex'));
  assert.ok(meta.includes('C:\\DEV\\proj0'), 'path aparece na linha de metadados');
});

test('quando nao cabe, o path corta antes do titulo, nunca o contrario', () => {
  const item = {
    dir: 'C:\\DEV\\um\\caminho\\bem\\comprido\\que\\nao\\cabe\\de\\jeito\\nenhum\\na\\tela',
    sessionId: 'id1',
    agent: 'claude',
    age: 'agora',
    title: 'Titulo curto',
    summary: 's',
  };

  const out = render(createState([item], { viewport: 1, columns: 40, color: false }));
  const head = out.split('\n').find((l) => l.includes('Titulo curto'));

  assert.ok(head.includes('Titulo curto'), 'titulo inteiro sobrevive ao corte');
  assert.ok(head.length <= 40, `linha excede a largura: ${head.length}`);
});

test('na linha selecionada, titulo e path saem no mesmo bloco de cor', () => {
  const state = createState(items(2), { viewport: 2, columns: 90, color: true });
  const linhas = render(state).split('\n');

  const selecionada = linhas.find((l) => l.includes('> resumo'));
  assert.ok(selecionada.includes(ANSI.bold + ANSI.cyan), 'titulo e path selecionados usam a mesma cor');
});

test('na linha selecionada, os campos apagados (agent/branch/bytes/tokens) viram branco', () => {
  const item = {
    dir: 'C:\\DEV',
    sessionId: 'id1',
    agent: 'claude',
    age: '3d atras',
    mtime: Date.now() - 3 * 86400000,
    branch: 'master',
    bytes: 1048576,
    summary: 's',
  };

  const state = createState([item], { viewport: 1, columns: 90, color: true });
  const meta = render(state).split('\n').find((l) => l.includes('claude'));

  assert.ok(meta.includes(ANSI.white), 'campos apagados usam branco quando a linha esta selecionada');
  assert.ok(!meta.includes(ANSI.dim), 'nao sobra dim nos campos que deveriam ter virado branco');
});

test('idade mantem a propria cor mesmo na linha selecionada, nao vira branco', () => {
  const item = {
    dir: 'C:\\DEV',
    sessionId: 'id1',
    agent: 'claude',
    age: 'agora',
    mtime: Date.now(),
    summary: 's',
  };

  const state = createState([item], { viewport: 1, columns: 90, color: true });
  const meta = render(state).split('\n').find((l) => l.includes('claude'));

  assert.ok(meta.includes(ANSI.green), 'idade recente continua verde mesmo selecionada');
});
