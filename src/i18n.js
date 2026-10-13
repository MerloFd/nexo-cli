const MESSAGES = {
  'ui.header.global': 'Sessions global ({shown} of {total})',
  'ui.header.scoped': 'Sessions {path} ({shown} of {total})',
  'ui.search.placeholder': 'Search…',
  'ui.footer.idle': 'type to search   arrows move   ctrl+a scope   ctrl+←→ agent   {previewHint}   tab mark   enter open   esc quit',
  'ui.footer.searching': 'arrows move   ctrl+a scope   ctrl+←→ agent   {previewHint}   tab mark   enter open   esc clears search',
  'ui.empty.search': 'no session matches this search',
  'ui.empty.scope': 'no session in this folder - ctrl+a shows every folder',
  'ui.scroll.up': '↑ {n} above',
  'meta.turns': '{n} turns',
  'ui.footer.previewOn': 'ctrl+t hide preview',
  'ui.footer.previewOff': 'ctrl+t preview',
  'preview.loading': 'Loading preview…',
  'preview.unavailable': 'No preview for this agent yet.',
  'preview.empty': 'No messages in this session.',
  'ui.scroll.down': '↓ {n} below',

  'cli.noSessions': 'No agent session found.',
  'cli.noMatch': 'No session matches "{query}".',
  'cli.cancelled': 'Cancelled.',
  'cli.opening': 'Opening {dir} [{id}] via {backend}',
  'cli.warning': 'warning: {message}',
  'cli.vscodeNote':
    'Note: the VS Code terminal cannot open tabs from a command, so I opened an external terminal.',
  'cli.sendUnsupported': 'Note: --send is not supported by {backend} yet, nothing was sent.',
  'cli.notFound': 'Session not found: {id}',
  'cli.invalidOption': 'Invalid option: {value}',
  'cli.choose': '\nPick a number (Enter cancels): ',

  'scan.scanning': 'Scanning {n} session(s)...',
  'scan.clean': 'No secrets found in the session logs.',
  'scan.summary': '{high} high-confidence finding(s) and {rest} to review, across {sessions} session(s).\n',
  'scan.group.high': 'HIGH CONFIDENCE - this shape only exists in real credentials:',
  'scan.group.medium': 'TO REVIEW - assignment that looks like a secret:',
  'scan.group.medium.note': '  May be quoted code or an example. Look before acting.',
  'scan.group.low': 'LIKELY NOISE - random string near a sensitive word:',
  'scan.group.low.note': '  Usually a hash, id or path. Listed so nothing is hidden.',
  'scan.advice.title': 'What to do, in this order:',
  'scan.advice.1': '  1. ROTATE the high-confidence credentials. They were already sent to the',
  'scan.advice.2': '     provider with the conversation - deleting the local file undoes nothing.',
  'scan.advice.3': '  2. Then clean the local log, which sits in plain text in your profile and',
  'scan.advice.4': '     can be read by any process running as you.',

  'scan.redact.title': 'REDACTING (high-confidence findings only, Claude sessions only):',
  'scan.redact.count': '{n} occurrence(s) removed',
  'scan.redact.nothing': 'Nothing to redact: no high-confidence finding in a Claude session.',
  'scan.redact.skippedActive': '{n} session(s) skipped - changed in the last few minutes, might be in use by a running agent:',
  'scan.redact.note1': 'This only covers Claude Code sessions for now, and only removes the local',
  'scan.redact.note2': 'copy of the secret - rotate the credential, this does not undo the leak.',

  'usage.empty': 'No token usage found.',
  'usage.total': 'Total: {tokens} tokens across {turns} turns',
  'usage.input': 'input',
  'usage.output': 'output',
  'usage.cacheRead': 'cache read',
  'usage.cacheWrite': 'cache write',
  'usage.byDay': 'By day',
  'usage.byWeek': 'By week',
  'usage.byAgent': 'By agent',
  'usage.byModel': 'By model',
  'usage.byProject': 'By project',
  'usage.more': '  ... and {n} more',
  'usage.approximate.1': 'Note: {n} Codex session(s) without per-turn detail were counted',
  'usage.approximate.2': 'with the session total only, so they have no daily breakdown.',
  'usage.noMoney.1': 'No money figures: on a subscription plan tokens are not billed per unit,',
  'usage.noMoney.2': 'so any amount shown here would be made up.',
  'usage.ofTotal': 'of total',
  'usage.dashboard.backToRange': '[Esc] back to the full range',
  'usage.dashboard.footer': '[↑↓] move   [Enter] drill into a day   [Tab] day/week   [Esc] quit',

  'ui.confirm.options': '[Enter] No (default)    [S] Yes    [Esc] cancel',
  'send.target.singular': 'this session about to open',
  'send.target.plural': 'these {n} sessions about to open',
  'send.confirm.question': 'Send this message to {alvo}?',

  'scan.tag.alta': 'HIGH',
  'scan.tag.media': 'MED',
  'scan.tag.baixa': 'LOW',
  'scan.lineLabel': 'line {n}',
  'scan.interactive.header': 'nexo scan ({n} selected)',
  'scan.interactive.footer': '↑↓ move   tab mark (high-confidence only)   enter redact   esc quit',
  'scan.interactive.confirmQuestion': 'Redact {n} credential(s)? This rewrites the session file in place.',
};

// Uma tabela so, inglesa. Centralizar as strings continua valendo (um lugar
// unico pra revisar texto de usuario), mas manter dois idiomas custava cada
// string em dobro e ja tinha rendido um bug de traducao dessincronizada.
function t(key, params = {}) {
  const texto = MESSAGES[key] || key;

  return texto.replace(/\{(\w+)\}/g, (match, nome) =>
    Object.prototype.hasOwnProperty.call(params, nome) ? String(params[nome]) : match
  );
}

module.exports = { t, MESSAGES };
