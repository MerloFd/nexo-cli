function available() {
  return true;
}

function open(session) {
  console.log('\nNenhum backend automatico disponivel. Rode manualmente:\n');
  console.log(`  cd "${session.dir}"`);
  console.log(`  claude -r ${session.sessionId}`);
}

module.exports = { name: 'fallback', available, open };
