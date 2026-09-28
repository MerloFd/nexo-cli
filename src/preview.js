const fs = require('fs');
const readline = require('readline');

const MAX_CHARS = 4000;
const MAX_LINES_READ = 5000;

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const block = content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
    if (block) return block.text;
  }
  return '';
}

function isNoise(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('<') ||
    trimmed.startsWith('Caveat:') ||
    trimmed.startsWith('This session is being continued') ||
    trimmed.startsWith('Base directory for this skill:')
  );
}

// Le so o COMECO do arquivo, parando assim que junta caracteres suficientes -
// nao o arquivo inteiro. Uma sessao de 100MB nao pode custar 100MB de leitura
// so pra mostrar as primeiras mensagens; MAX_LINES_READ e uma segunda trava
// para o caso raro de muitas linhas de ruido antes da primeira mensagem real.
async function loadClaudePreview(filePath) {
  const linhas = [];
  let total = 0;
  let lidas = 0;
  let stream;
  let rl;

  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (++lidas > MAX_LINES_READ || total >= MAX_CHARS) break;
      if (!line.includes('"role":"user"') && !line.includes('"role":"assistant"')) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const role = entry.message && entry.message.role;
      if (entry.type !== role) continue;
      if (role !== 'user' && role !== 'assistant') continue;

      const texto = extractText(entry.message.content);
      if (!texto || (role === 'user' && isNoise(texto))) continue;

      const prefixo = role === 'user' ? '> ' : '  ';
      const limpo = texto.replace(/\s+/g, ' ').trim();
      if (!limpo) continue;

      const linha = `${prefixo}${limpo}`;
      linhas.push(linha);
      total += linha.length;
    }
  } catch {
    return [];
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return linhas;
}

// null = agente sem previa disponivel ainda (mostra aviso, nao erro).
// So Claude por enquanto: Codex mudou de JSONL pra SQLite recentemente e o
// schema de mensagem e outro; opencode nem tem session.filePath hoje.
async function loadPreview(session) {
  if (session.agent === 'claude' && session.filePath) {
    return loadClaudePreview(session.filePath);
  }
  return null;
}

module.exports = { loadPreview, loadClaudePreview, MAX_CHARS, MAX_LINES_READ };
