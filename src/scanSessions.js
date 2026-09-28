const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const cache = require('./cache');
const { normalizeDir } = require('./paths');

const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const NOISE_PREFIXES = [
  '<',
  'Caveat:',
  'This session is being continued',
  'Base directory for this skill:',
];

const MAX_LINES_SCANNED = 2000;
const TAIL_BYTES = 64 * 1024;

function isNoise(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return NOISE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const block = content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
    if (block) return block.text;
  }
  return '';
}

function cleanSummary(text) {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function readChunk(filePath, position, length) {
  if (length <= 0) return '';
  const buffer = Buffer.alloc(length);
  let fd;

  try {
    fd = fs.openSync(filePath, 'r');
    const read = fs.readSync(fd, buffer, 0, length, position);
    return buffer.toString('utf8', 0, read);
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function collectMeta(lines, acc) {
  for (const line of lines) {
    if (!line.trim()) continue;

    // A maioria das linhas e resposta do agente ou saida de ferramenta, com
    // dezenas de KB. Descartar por substring antes do parse evita pagar
    // JSON.parse em tudo que nao interessa.
    const mayHelp =
      (!acc.cwd && line.includes('"cwd"')) ||
      (!acc.sessionId && line.includes('"sessionId"')) ||
      (!acc.summary && line.includes('"role":"user"'));
    if (!mayHelp) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;

    if (!acc.sessionId && typeof entry.sessionId === 'string') acc.sessionId = entry.sessionId;
    if (!acc.cwd && typeof entry.cwd === 'string' && entry.cwd.trim()) acc.cwd = entry.cwd;

    if (!acc.summary && entry.type === 'user' && entry.message && entry.message.role === 'user') {
      const text = extractText(entry.message.content);
      if (text && !isNoise(text)) acc.summary = cleanSummary(text);
    }

    if (acc.cwd && acc.sessionId && acc.summary) return true;
  }

  return false;
}

// O cabecalho quase sempre tem cwd, id e a primeira mensagem nos primeiros KB.
// Ler um buffer fixo custa metade de abrir um stream por arquivo; o streaming
// fica so como rede de seguranca para os casos em que o buffer nao basta.
function readHeadMeta(filePath, fileSize) {
  const acc = { cwd: null, sessionId: null, summary: null };
  const text = readChunk(filePath, 0, Math.min(fileSize, TAIL_BYTES));
  if (text) collectMeta(text.split('\n'), acc);
  return acc;
}

async function readStreamMeta(filePath, acc) {
  let stream;
  let rl;
  let cwd = acc.cwd;
  let sessionId = acc.sessionId;
  let summary = acc.summary;

  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let scanned = 0;
    for await (const line of rl) {
      if (scanned++ > MAX_LINES_SCANNED) break;
      if (!line.trim()) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;

      if (!sessionId && typeof entry.sessionId === 'string') sessionId = entry.sessionId;
      if (!cwd && typeof entry.cwd === 'string' && entry.cwd.trim()) cwd = entry.cwd;

      if (!summary && entry.type === 'user' && entry.message && entry.message.role === 'user') {
        const text = extractText(entry.message.content);
        if (text && !isNoise(text)) summary = cleanSummary(text);
      }

      if (cwd && sessionId && summary) break;
    }
  } catch {
    // arquivo ilegivel: devolve o que conseguiu ate aqui
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return { cwd, sessionId, summary };
}

async function readSessionMeta(filePath, fileSize) {
  const head = readHeadMeta(filePath, fileSize);
  if (head.cwd && head.summary) return head;

  return readStreamMeta(filePath, head);
}

function lastMatch(text, regex) {
  let last = null;
  for (const match of text.matchAll(regex)) last = match[1];
  return last;
}

function sumUsage(fragment) {
  const field = (key) => {
    const match = fragment.match(new RegExp(`"${key}":(\\d+)`));
    return match ? Number(match[1]) : 0;
  };

  const total =
    field('input_tokens') +
    field('cache_creation_input_tokens') +
    field('cache_read_input_tokens');

  return total > 0 ? total : null;
}

// Titulo, branch e uso sao reescritos ao longo de todo o arquivo, entao os
// valores atuais estao no fim. Le so o rabo (a base inteira passa de 150MB) e
// extrai tudo do mesmo buffer, sem I/O adicional por campo.
function readTailMeta(filePath, fileSize) {
  const length = Math.min(fileSize, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  let fd;

  try {
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, length, Math.max(0, fileSize - length));
  } catch {
    return {};
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  const text = buffer.toString('utf8');

  let custom = null;
  let ai = null;
  for (const line of text.split('\n')) {
    if (!line.includes('-title"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'custom-title' && entry.customTitle) custom = entry.customTitle;
      else if (entry.type === 'ai-title' && entry.aiTitle) ai = entry.aiTitle;
    } catch {
      continue;
    }
  }

  const title = custom || ai;
  const usage = lastMatch(text, /"usage":\{([^}]*)\}/g);

  return {
    title: title ? cleanSummary(title) : null,
    branch: lastMatch(text, /"gitBranch":"([^"]*)"/g) || null,
    model: lastMatch(text, /"model":"([^"]*)"/g) || null,
    tokens: usage ? sumUsage(usage) : null,
  };
}

// Diferente do titulo/branch/tokens (que valem o ultimo, lido so do rabo do
// arquivo), turnos e uma CONTAGEM - exige ler o arquivo inteiro, nao so o
// fim. Custo medido: ~380ms no maior arquivo encontrado (23MB). So compensa
// porque o resultado entra no mesmo cache por mtime+tamanho de tudo mais:
// paga uma vez por versao do arquivo, nunca de novo enquanto ele nao mudar.
async function countTurns(filePath) {
  let stream;
  let rl;
  let turnos = 0;

  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.includes('"role":"user"') && !line.includes('"role":"assistant"')) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const role = entry.message && entry.message.role;
      if ((entry.type === 'user' && role === 'user') || (entry.type === 'assistant' && role === 'assistant')) {
        turnos++;
      }
    }
  } catch {
    return null;
  } finally {
    if (rl) rl.close();
    if (stream) stream.destroy();
  }

  return turnos;
}

async function scanSessions(projectsDir = DEFAULT_PROJECTS_DIR, { cacheFile } = {}) {
  const sessions = [];
  if (!fs.existsSync(projectsDir)) return sessions;

  const useCache = !process.env.NEXO_NO_CACHE;
  const previous = useCache ? cache.load(cacheFile) : new Map();
  const fresh = new Map();

  let projectDirs;
  try {
    projectDirs = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsDir, d.name));
  } catch {
    return sessions;
  }

  for (const projectDir of projectDirs) {
    let files;
    try {
      files = fs
        .readdirSync(projectDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(projectDir, file.name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.size === 0) continue;

        const key = cache.keyFor(filePath, stat);
        const cached = previous.get(key);
        if (cached) {
          fresh.set(key, cached);
          sessions.push({ ...cached, mtime: stat.mtimeMs });
          continue;
        }

        const { cwd, sessionId, summary } = await readSessionMeta(filePath, stat.size);
        if (!cwd) continue;

        const tail = readTailMeta(filePath, stat.size);
        const turns = await countTurns(filePath);
        const session = {
          dir: normalizeDir(cwd),
          sessionId: sessionId || path.basename(file.name, '.jsonl'),
          mtime: stat.mtimeMs,
          title: tail.title || null,
          branch: tail.branch,
          model: tail.model,
          tokens: tail.tokens,
          tokensKind: tail.tokens ? 'context' : null,
          turns,
          bytes: stat.size,
          filePath,
          summary: summary || '(sem mensagens)',
        };

        fresh.set(key, session);
        sessions.push(session);
      } catch {
        continue;
      }
    }
  }

  if (useCache) cache.save(fresh, cacheFile);

  sessions.sort((a, b) => b.mtime - a.mtime);
  return sessions;
}

function daysAgo(mtimeMs) {
  const diffMs = Date.now() - mtimeMs;
  if (diffMs < 0) return 'agora';

  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days}d atras`;

  const hours = Math.floor(diffMs / 3600000);
  if (hours > 0) return `${hours}h atras`;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes > 0) return `${minutes}min atras`;

  return 'agora';
}

module.exports = { scanSessions, daysAgo, countTurns, DEFAULT_PROJECTS_DIR };
