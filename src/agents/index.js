const claude = require('./claude');
const codex = require('./codex');

const AGENTS = [claude, codex];

function byId(id) {
  return AGENTS.find((agent) => agent.id === id) || null;
}

async function scanAll(agents = AGENTS) {
  const results = await Promise.all(
    agents.map(async (agent) => {
      try {
        return await agent.scan();
      } catch {
        return [];
      }
    })
  );

  return results.flat().sort((a, b) => b.mtime - a.mtime);
}

function resumeArgs(session) {
  const agent = byId(session.agent);
  if (!agent) throw new Error(`Agente desconhecido: ${session.agent}`);
  return agent.resumeArgs(session);
}

module.exports = { AGENTS, scanAll, byId, resumeArgs };
