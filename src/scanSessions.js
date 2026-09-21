const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const NOISE_PREFIXES = [
  '<',
  'Caveat:',
  'This session is being continued',
  'Base directory for this skill:',
];

const MAX_LINES_SCANNED = 2000;

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

async function readSessionMeta(filePath) {
  let stream;
  let rl;
  let cwd = null;
  let sessionId = null;
  let summary = null;

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

async function scanSessions(projectsDir = DEFAULT_PROJECTS_DIR) {
  const sessions = [];
  if (!fs.existsSync(projectsDir)) return sessions;

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

        const { cwd, sessionId, summary } = await readSessionMeta(filePath);
        if (!cwd) continue;

        sessions.push({
          dir: cwd,
          sessionId: sessionId || path.basename(file.name, '.jsonl'),
          mtime: stat.mtimeMs,
          summary: summary || '(sem mensagens)',
        });
      } catch {
        continue;
      }
    }
  }

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

module.exports = { scanSessions, daysAgo, DEFAULT_PROJECTS_DIR };
