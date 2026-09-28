const test = require('node:test');
const assert = require('node:assert');

const SESSION = { dir: '/home/user/proj', sessionId: 'e05d7ab3-bf50-4d3c-b408-8c0f9164f268' };
const COMMAND = ['claude', '-r', SESSION.sessionId];

function withPlatform(value, fn) {
  const antes = process.platform;
  Object.defineProperty(process, 'platform', { value, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: antes, configurable: true });
  }
}

function withEnv(vars, fn) {
  const antes = {};
  for (const key of Object.keys(vars)) antes[key] = process.env[key];

  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (antes[key] === undefined) delete process.env[key];
      else process.env[key] = antes[key];
    }
  }
}

function freshBackend(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('wezterm so fica disponivel dentro de um pane do wezterm', () => {
  withEnv({ WEZTERM_PANE: undefined }, () => {
    const wezterm = freshBackend('../src/backends/wezterm');
    assert.strictEqual(wezterm.available(), false, 'sem WEZTERM_PANE nao ha como provar que e este terminal');
  });
});

test('wezterm chama cli spawn com --cwd e o comando direto, sem shell', (t) => {
  withEnv({ WEZTERM_PANE: '0' }, () => {
    const cp = require('child_process');
    t.mock.method(cp, 'execFileSync', () => '');
    const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

    const wezterm = freshBackend('../src/backends/wezterm');
    wezterm.open(SESSION, COMMAND);

    const [bin, args] = spawnMock.mock.calls[0].arguments;
    assert.strictEqual(bin, 'wezterm');
    assert.deepStrictEqual(args, ['cli', 'spawn', '--cwd', SESSION.dir, '--', ...COMMAND]);
  });
});

test('kitty so fica disponivel dentro de uma janela do kitty', () => {
  withEnv({ KITTY_WINDOW_ID: undefined }, () => {
    const kitty = freshBackend('../src/backends/kitty');
    assert.strictEqual(kitty.available(), false);
  });
});

test('kitty usa kitten @ launch --type=tab', (t) => {
  withEnv({ KITTY_WINDOW_ID: '1' }, () => {
    const cp = require('child_process');
    t.mock.method(cp, 'execFileSync', () => '');
    const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

    const kitty = freshBackend('../src/backends/kitty');
    kitty.open(SESSION, COMMAND);

    const [bin, args] = spawnMock.mock.calls[0].arguments;
    assert.strictEqual(bin, 'kitten');
    assert.ok(args.includes('--type=tab'));
    assert.ok(args.includes(SESSION.dir));
    COMMAND.forEach((part) => assert.ok(args.includes(part)));
  });
});

test('iTerm2 so fica disponivel no macOS dentro do proprio iTerm2', () => {
  withPlatform('darwin', () => {
    withEnv({ TERM_PROGRAM: 'iTerm.app' }, () => {
      const iterm2 = freshBackend('../src/backends/iterm2');
      assert.strictEqual(iterm2.available(), true);
    });
    withEnv({ TERM_PROGRAM: 'Apple_Terminal' }, () => {
      const iterm2 = freshBackend('../src/backends/iterm2');
      assert.strictEqual(iterm2.available(), false);
    });
  });

  withPlatform('linux', () => {
    withEnv({ TERM_PROGRAM: 'iTerm.app' }, () => {
      const iterm2 = freshBackend('../src/backends/iterm2');
      assert.strictEqual(iterm2.available(), false, 'nao existe fora do macOS');
    });
  });
});

test('iTerm2 escapa aspas duplas no comando para nao quebrar o AppleScript', (t) => {
  withPlatform('darwin', () => {
    withEnv({ TERM_PROGRAM: 'iTerm.app' }, () => {
      const cp = require('child_process');
      const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

      const iterm2 = freshBackend('../src/backends/iterm2');
      iterm2.open(SESSION, COMMAND);

      const [bin, args] = spawnMock.mock.calls[0].arguments;
      assert.strictEqual(bin, 'osascript');
      const script = args[args.indexOf('-e') + 1];
      assert.ok(script.includes('create tab with default profile'));
      assert.ok(script.includes(SESSION.dir));
    });
  });
});

test('Terminal.app so entra no macOS quando nao e o iTerm2', () => {
  withPlatform('darwin', () => {
    withEnv({ TERM_PROGRAM: 'Apple_Terminal' }, () => {
      const app = freshBackend('../src/backends/terminalApp');
      assert.strictEqual(app.available(), true);
    });
    withEnv({ TERM_PROGRAM: 'iTerm.app' }, () => {
      const app = freshBackend('../src/backends/terminalApp');
      assert.strictEqual(app.available(), false, 'iTerm2 tem backend proprio, com aba de verdade');
    });
  });

  withPlatform('win32', () => {
    const app = freshBackend('../src/backends/terminalApp');
    assert.strictEqual(app.available(), false);
  });
});

test('gnome-terminal, konsole e xfce4-terminal so entram no Linux', () => {
  for (const nome of ['gnomeTerminal', 'konsole', 'xfce4Terminal']) {
    withPlatform('darwin', () => {
      const backend = freshBackend(`../src/backends/${nome}`);
      assert.strictEqual(backend.available(), false, `${nome} nao deveria existir fora do Linux`);
    });
  }
});

test('gnome-terminal manda --tab e --working-directory=', (t) => {
  withPlatform('linux', () => {
    const cp = require('child_process');
    t.mock.method(cp, 'execFileSync', () => '');
    const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

    const gnomeTerminal = freshBackend('../src/backends/gnomeTerminal');
    gnomeTerminal.open(SESSION, COMMAND);

    const [bin, args] = spawnMock.mock.calls[0].arguments;
    assert.strictEqual(bin, 'gnome-terminal');
    assert.ok(args.includes('--tab'));
    assert.ok(args.includes(`--working-directory=${SESSION.dir}`));
  });
});

test('konsole manda --new-tab e --workdir', (t) => {
  withPlatform('linux', () => {
    const cp = require('child_process');
    t.mock.method(cp, 'execFileSync', () => '');
    const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

    const konsole = freshBackend('../src/backends/konsole');
    konsole.open(SESSION, COMMAND);

    const [bin, args] = spawnMock.mock.calls[0].arguments;
    assert.strictEqual(bin, 'konsole');
    assert.ok(args.includes('--new-tab'));
    assert.ok(args.includes('--workdir'));
    assert.ok(args.includes(SESSION.dir));
  });
});

test('xfce4-terminal manda --tab e --working-directory=', (t) => {
  withPlatform('linux', () => {
    const cp = require('child_process');
    t.mock.method(cp, 'execFileSync', () => '');
    const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

    const xfce4Terminal = freshBackend('../src/backends/xfce4Terminal');
    xfce4Terminal.open(SESSION, COMMAND);

    const [bin, args] = spawnMock.mock.calls[0].arguments;
    assert.strictEqual(bin, 'xfce4-terminal');
    assert.ok(args.includes('--tab'));
    assert.ok(args.includes(`--working-directory=${SESSION.dir}`));
  });
});

test('cadeia inteira tem um nome unico por backend, sem duplicata', () => {
  const { BACKENDS } = require('../src/backends');
  const nomes = BACKENDS.map((b) => b.name);
  assert.strictEqual(new Set(nomes).size, nomes.length, 'nome de backend repetido');
});

test('todo backend novo aceita ser chamado com so (session, command), sem quebrar', () => {
  const { BACKENDS } = require('../src/backends');
  for (const backend of BACKENDS) {
    assert.strictEqual(typeof backend.available, 'function', `${backend.name} sem available()`);
    assert.strictEqual(typeof backend.open, 'function', `${backend.name} sem open()`);
  }
});
