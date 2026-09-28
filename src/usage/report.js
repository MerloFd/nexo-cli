const { emptyTotals, addTotals, totalOf } = require('./collect');

const BLOCOS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

// Barra com oitavos de bloco: em 20 colunas isso da 160 niveis, suficiente
// para diferenciar valores proximos sem precisar de cor.
function bar(value, max, width = 24) {
  if (!max || value <= 0) return '';
  const oitavos = Math.round((value / max) * width * 8);
  const cheios = Math.floor(oitavos / 8);
  const resto = oitavos % 8;
  return '█'.repeat(cheios) + BLOCOS[resto];
}

function human(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

function diaDe(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Segunda-feira da semana, para agrupar sem depender de locale.
function semanaDe(ms) {
  const d = new Date(ms);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

const ROTULO_MAXIMO = 42;

// Em caminho, o fim identifica e o comeco se repete: cortar pela esquerda
// preserva a parte que distingue um projeto do outro.
function encurtar(texto, largura) {
  if (texto.length <= largura) return texto;
  return `…${texto.slice(-(largura - 1))}`;
}

function agrupar(samples, chave) {
  const grupos = new Map();

  for (const s of samples) {
    const k = chave(s);
    if (!grupos.has(k)) grupos.set(k, { key: k, totals: emptyTotals(), turns: 0 });
    const g = grupos.get(k);
    addTotals(g.totals, s.totals);
    g.turns++;
  }

  return [...grupos.values()].map((g) => ({ ...g, total: totalOf(g.totals) }));
}

function tabela(linhas, { titulo, ordenarPorChave = false, limite = 0 } = {}) {
  if (linhas.length === 0) return [];

  const ordenadas = ordenarPorChave
    ? [...linhas].sort((a, b) => String(a.key).localeCompare(String(b.key)))
    : [...linhas].sort((a, b) => b.total - a.total);

  const visiveis = limite > 0 ? ordenadas.slice(0, limite) : ordenadas;
  const max = Math.max(...visiveis.map((l) => l.total));
  const largura = Math.min(
    ROTULO_MAXIMO,
    Math.max(...visiveis.map((l) => String(l.key).length))
  );

  const out = [`${titulo}`, ''];

  for (const linha of visiveis) {
    const rotulo = encurtar(String(linha.key), largura).padEnd(largura);
    const valor = human(linha.total).padStart(6);
    out.push(`  ${rotulo}  ${valor}  ${bar(linha.total, max)}`);
  }

  if (limite > 0 && ordenadas.length > limite) {
    out.push(`  ... e mais ${ordenadas.length - limite}`);
  }

  out.push('');
  return out;
}

function resumo(samples) {
  const totals = samples.reduce((acc, s) => addTotals(acc, s.totals), emptyTotals());
  const total = totalOf(totals);
  if (total === 0) return ['Nenhum uso de token encontrado.'];

  const pct = (n) => `${Math.round((n / total) * 100)}%`.padStart(4);

  return [
    `Total: ${human(total)} tokens em ${samples.length} turnos`,
    '',
    `  entrada        ${human(totals.input).padStart(6)}  ${pct(totals.input)}`,
    `  saida          ${human(totals.output).padStart(6)}  ${pct(totals.output)}`,
    `  leitura cache  ${human(totals.cacheRead).padStart(6)}  ${pct(totals.cacheRead)}`,
    `  escrita cache  ${human(totals.cacheWrite).padStart(6)}  ${pct(totals.cacheWrite)}`,
    '',
  ];
}

function build(samples, { periodo = 'dia', topProjetos = 10 } = {}) {
  if (samples.length === 0) return 'Nenhum uso de token encontrado.';

  const porTempo =
    periodo === 'semana'
      ? agrupar(samples, (s) => semanaDe(s.at))
      : agrupar(samples, (s) => diaDe(s.at));

  const linhas = [
    ...resumo(samples),
    ...tabela(porTempo, { titulo: periodo === 'semana' ? 'Por semana' : 'Por dia', ordenarPorChave: true }),
    ...tabela(agrupar(samples, (s) => s.agent), { titulo: 'Por agente' }),
    ...tabela(agrupar(samples, (s) => s.model), { titulo: 'Por modelo' }),
    ...tabela(agrupar(samples, (s) => s.dir), { titulo: 'Por projeto', limite: topProjetos }),
  ];

  const aproximados = samples.filter((s) => s.approximate).length;
  if (aproximados > 0) {
    linhas.push(
      `Nota: ${aproximados} sessao(oes) do Codex sem detalhe por turno entraram`,
      'apenas com o total da sessao, sem quebra por dia.',
      ''
    );
  }

  linhas.push('Sem valores em dinheiro: em plano de assinatura o token nao e cobrado');
  linhas.push('por unidade, entao qualquer cifra aqui seria inventada.');

  return linhas.join('\n');
}

module.exports = { build, agrupar, tabela, bar, human, diaDe, semanaDe, resumo };
