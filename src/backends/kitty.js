const { execFileSync, spawn } = require('child_process');

// KITTY_WINDOW_ID so existe dentro de uma janela do kitty de verdade. Ainda
// assim depende de allow_remote_control estar ligado no kitty.conf do
// usuario - sem isso o comando falha e o proximo backend da cadeia assume.
function available() {
  if (!process.env.KITTY_WINDOW_ID) return false;
  try {
    execFileSync('kitten', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn(
    'kitten',
    ['@', 'launch', '--type=tab', '--cwd', session.dir, ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'kitty', available, open };
