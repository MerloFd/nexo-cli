function available() {
  return true;
}

function open(session, command) {
  console.log('\nNenhum backend automatico disponivel. Rode manualmente:\n');
  console.log(`  cd "${session.dir}"`);
  console.log(`  ${command.join(' ')}`);
}

module.exports = { name: 'fallback', available, open };
