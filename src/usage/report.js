const { emptyTotals, addTotals, totalOf } = require('./collect');
const { t } = require('../i18n');

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

// A barra sozinha so compara linhas ENTRE SI (essa barra e maior que aquela);
// sem o percentual do total geral, nao da pra saber se um dia que "parece
// grande" no grafico e na verdade 3% do mes inteiro ou 40% dele. grandTotal,
// quando informado, calcula esse percentual contra o total de fora da
// tabela (a sessao inteira, ou so o recorte de um drill-down especifico).
function tabela(linhas, { titulo, ordenarPorChave = false, limite = 0, grandTotal = 0 } = {}) {
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
    const barra = bar(linha.total, max).padEnd(25);
    const pct = grandTotal > 0 ? `  ${`${Math.round((linha.total / grandTotal) * 100)}%`.padStart(4)} of total` : '';
    out.push(`  ${rotulo}  ${valor}  ${barra}${pct}`.trimEnd());
  }

  if (limite > 0 && ordenadas.length > limite) {
    out.push(t('usage.more', { n: ordenadas.length - limite }));
  }

  out.push('');
  return out;
}

// Os rotulos mudam de tamanho entre idiomas, entao a coluna se alinha em
// tempo de execucao em vez de depender de espacos fixos no texto.
const LARGURA_ROTULO = 14;

function rotulo(nome, valor, pct) {
  return `  ${nome.padEnd(LARGURA_ROTULO)} ${human(valor).padStart(6)}  ${pct(valor)}`;
}

function resumo(samples) {
  const totals = samples.reduce((acc, s) => addTotals(acc, s.totals), emptyTotals());
  const total = totalOf(totals);
  if (total === 0) return [t('usage.empty')];

  const pct = (n) => `${Math.round((n / total) * 100)}%`.padStart(4);

  return [
    t('usage.total', { tokens: human(total), turns: samples.length }),
    '',
    rotulo(t('usage.input'), totals.input, pct),
    rotulo(t('usage.output'), totals.output, pct),
    rotulo(t('usage.cacheRead'), totals.cacheRead, pct),
    rotulo(t('usage.cacheWrite'), totals.cacheWrite, pct),
    '',
  ];
}

function build(samples, { periodo = 'dia', topProjetos = 10 } = {}) {
  if (samples.length === 0) return t('usage.empty');

  const porTempo =
    periodo === 'semana'
      ? agrupar(samples, (s) => semanaDe(s.at))
      : agrupar(samples, (s) => diaDe(s.at));

  const grandTotal = totalOf(samples.reduce((acc, s) => addTotals(acc, s.totals), emptyTotals()));

  const linhas = [
    ...resumo(samples),
    ...tabela(porTempo, {
      titulo: t(periodo === 'semana' ? 'usage.byWeek' : 'usage.byDay'),
      ordenarPorChave: true,
      grandTotal,
    }),
    ...tabela(agrupar(samples, (s) => s.agent), { titulo: t('usage.byAgent'), grandTotal }),
    ...tabela(agrupar(samples, (s) => s.model), { titulo: t('usage.byModel'), grandTotal }),
    ...tabela(agrupar(samples, (s) => s.dir), { titulo: t('usage.byProject'), limite: topProjetos, grandTotal }),
  ];

  const aproximados = samples.filter((s) => s.approximate).length;
  if (aproximados > 0) {
    linhas.push(
      t('usage.approximate.1', { n: aproximados }),
      t('usage.approximate.2'),
      ''
    );
  }

  linhas.push(t('usage.noMoney.1'));
  linhas.push(t('usage.noMoney.2'));

  return linhas.join('\n');
}

module.exports = { build, agrupar, tabela, bar, human, diaDe, semanaDe, resumo };
