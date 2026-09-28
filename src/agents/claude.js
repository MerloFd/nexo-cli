const { scanSessions, DEFAULT_PROJECTS_DIR } = require('../scanSessions');

async function scan(projectsDir = DEFAULT_PROJECTS_DIR) {
  const sessions = await scanSessions(projectsDir);
  return sessions.map((session) => ({ ...session, agent: 'claude' }));
}

function resumeArgs(session) {
  return ['claude', '-r', session.sessionId];
}

module.exports = { id: 'claude', label: 'claude', scan, resumeArgs };
