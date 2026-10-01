const claude = require('./claude');
const codex = require('./codex');
const opencode = require('./opencode');

const AGENTS = [claude, codex, opencode];

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

// Chamar o CLI do agente sem nenhum argumento de resume ja inicia uma sessao
// nova - nao precisa de nada especifico de cada adapter.
function newSessionArgs(agentId) {
  if (!byId(agentId)) throw new Error(`Agente desconhecido: ${agentId}`);
  return [agentId];
}

module.exports = { AGENTS, scanAll, byId, resumeArgs, newSessionArgs };
