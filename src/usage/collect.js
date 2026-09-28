const fs = require('fs');
const readline = require('readline');

// Uma "amostra" e um turno de conversa: quando, com que modelo, de que
// provedor, em que projeto e quantos tokens de cada tipo. Com isso qualquer
// recorte (dia, semana, modelo, projeto) vira agregacao.
function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

function addTotals(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key] || 0;
  return target;
}

function totalOf(t) {
  return t.input + t.output + t.cacheRead + t.cacheWrite;
}

const num = (fragment, key) => {
  const match = fragment.match(new RegExp(`"${key}":(\\d+)`));
  return match ? Number(match[1]) : 0;
};

// O Claude grava uso, modelo e horario na mesma linha do turno, entao da para
// atribuir cada token ao modelo certo - e o modelo muda no meio da sessao.
async function collectClaude(session) {
  const samples = [];
  let stream;
  let rl;

  try {
    stream = fs.createReadStream(session.filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.includes('"usage"')) continue;

      const usage = line.match(/"usage":\{([^}]*)\}/);
      if (!usage) continue;

      const model = line.match(/"model":"([^"]*)"/);
      const timestamp = line.match(/"timestamp":"([^"]*)"/);

      const totals = {
        input: num(usage[1], 'input_tokens'),
        output: num(usage[1], 'output_tokens'),
        cacheWrite: num(usage[1], 'cache_creation_input_tokens'),
        cacheRead: num(usage[1], 'cache_read_input_tokens'),
        reasoning: num(line, 'thinking_tokens'),
      };

      if (totalOf(totals) === 0) continue;

      samples.push({
        agent: 'claude',
        model: model ? model[1] : 'desconhecido',
        dir: session.dir,
        sessionId: session.sessionId,
        at: timestamp ? new Date(timestamp[1]).getTime() : session.mtime,
        totals,
      });
    }
  } catch {
    return samples;
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return samples;
}

// O Codex grava `last_token_usage` por turno. Os rollouts existem apenas em
// instalacoes que ainda escrevem JSONL; sem eles resta o total da sessao.
async function collectCodex(session) {
  if (!session.filePath || !fs.existsSync(session.filePath)) {
    if (!session.tokens) return [];
    return [
      {
        agent: 'codex',
        model: session.model || 'desconhecido',
        dir: session.dir,
        sessionId: session.sessionId,
        at: session.mtime,
        approximate: true,
        totals: { ...emptyTotals(), input: session.tokens },
      },
    ];
  }

  const samples = [];
  let stream;
  let rl;

  try {
    stream = fs.createReadStream(session.filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let model = session.model || 'desconhecido';

    for await (const line of rl) {
      const m = line.match(/"model":"([^"]*)"/);
      if (m) model = m[1];

      const usage = line.match(/"last_token_usage":\{([^}]*)\}/);
      if (!usage) continue;

      const cacheRead = num(usage[1], 'cached_input_tokens');
      const totals = {
        // Diferente do Claude, o Codex inclui o cache dentro de input_tokens.
        // Descontar evita contar o mesmo token duas vezes.
        input: Math.max(0, num(usage[1], 'input_tokens') - cacheRead),
        output: num(usage[1], 'output_tokens'),
        cacheRead,
        cacheWrite: 0,
        reasoning: num(usage[1], 'reasoning_output_tokens'),
      };

      if (totalOf(totals) === 0) continue;

      const timestamp = line.match(/"timestamp":"([^"]*)"/);
      samples.push({
        agent: 'codex',
        model,
        dir: session.dir,
        sessionId: session.sessionId,
        at: timestamp ? new Date(timestamp[1]).getTime() : session.mtime,
        totals,
      });
    }
  } catch {
    return samples;
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return samples;
}

async function collect(sessions) {
  const samples = [];

  for (const session of sessions) {
    if (session.agent === 'claude' && session.filePath) {
      samples.push(...(await collectClaude(session)));
    } else if (session.agent === 'codex') {
      samples.push(...(await collectCodex(session)));
    }
  }

  return samples;
}

module.exports = { collect, collectClaude, collectCodex, emptyTotals, addTotals, totalOf };
