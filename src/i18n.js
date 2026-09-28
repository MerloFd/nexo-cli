const { currentLang } = require('./config');

const MESSAGES = {
  en: {
    'ui.header.global': 'Sessions global ({shown} of {total})',
    'ui.header.scoped': 'Sessions {path} ({shown} of {total})',
    'ui.search.placeholder': 'Search…',
    'ui.footer.idle': 'type to search   arrows move   ctrl+a scope   enter open   esc quit',
    'ui.footer.searching': 'arrows move   ctrl+a scope   enter open   esc clears search',
    'ui.empty.search': 'no session matches this search',
    'ui.empty.scope': 'no session in this folder - ctrl+a shows every folder',
    'ui.scroll.up': '↑ {n} above',
    'ui.scroll.down': '↓ {n} below',

    'cli.noSessions': 'No agent session found.',
    'cli.noMatch': 'No session matches "{query}".',
    'cli.cancelled': 'Cancelled.',
    'cli.opening': 'Opening {dir} [{id}] via {backend}',
    'cli.warning': 'warning: {message}',
    'cli.vscodeNote':
      'Note: the VS Code terminal cannot open tabs from a command, so I opened an external terminal.',
    'cli.notFound': 'Session not found: {id}',
    'cli.invalidOption': 'Invalid option: {value}',
    'cli.choose': '\nPick a number (Enter cancels): ',
    'cli.langChanged': 'Language set to {lang}.',
    'cli.langInvalid': 'Unknown language: {lang}. Use: {options}',
    'cli.langHint': 'Tip: run "nexo lang pt" to switch to Portuguese.',

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
  },

  pt: {
    'ui.header.global': 'Sessoes global ({shown} de {total})',
    'ui.header.scoped': 'Sessoes {path} ({shown} de {total})',
    'ui.search.placeholder': 'Buscar…',
    'ui.footer.idle': 'digite para buscar   setas movem   ctrl+a escopo   enter abre   esc sai',
    'ui.footer.searching': 'setas movem   ctrl+a escopo   enter abre   esc limpa a busca',
    'ui.empty.search': 'nenhuma sessao corresponde a busca',
    'ui.empty.scope': 'nenhuma sessao nesta pasta - ctrl+a mostra todas as pastas',
    'ui.scroll.up': '↑ mais {n} acima',
    'ui.scroll.down': '↓ mais {n} abaixo',

    'cli.noSessions': 'Nenhuma sessao de agente encontrada.',
    'cli.noMatch': 'Nenhuma sessao corresponde a "{query}".',
    'cli.cancelled': 'Cancelado.',
    'cli.opening': 'Abrindo {dir} [{id}] via {backend}',
    'cli.warning': 'aviso: {message}',
    'cli.vscodeNote':
      'Nota: o terminal do VS Code nao permite abrir abas por comando; abri um terminal externo.',
    'cli.notFound': 'Sessao nao encontrada: {id}',
    'cli.invalidOption': 'Opcao invalida: {value}',
    'cli.choose': '\nEscolha o numero (Enter cancela): ',
    'cli.langChanged': 'Idioma alterado para {lang}.',
    'cli.langInvalid': 'Idioma desconhecido: {lang}. Use: {options}',
    'cli.langHint': 'Dica: rode "nexo lang pt" para mudar para portugues.',

    'scan.scanning': 'Varrendo {n} sessao(oes)...',
    'scan.clean': 'Nenhum segredo encontrado nos logs de sessao.',
    'scan.summary': '{high} achado(s) de alta confianca e {rest} a conferir, em {sessions} sessao(oes).\n',
    'scan.group.high': 'ALTA CONFIANCA - formato so existe em credencial de verdade:',
    'scan.group.medium': 'A CONFERIR - atribuicao com cara de segredo:',
    'scan.group.medium.note': '  Pode ser codigo citado ou exemplo. Olhe antes de agir.',
    'scan.group.low': 'RUIDO PROVAVEL - string aleatoria perto de palavra sensivel:',
    'scan.group.low.note': '  Costuma ser hash, id ou caminho. Listado para nao esconder nada.',
    'scan.advice.title': 'O que fazer, nesta ordem:',
    'scan.advice.1': '  1. ROTACIONE as credenciais de alta confianca. Elas ja foram enviadas ao',
    'scan.advice.2': '     provedor junto com a conversa - apagar o arquivo local nao desfaz isso.',
    'scan.advice.3': '  2. Depois limpe o log local, que fica em texto puro no seu perfil e pode',
    'scan.advice.4': '     ser lido por qualquer processo rodando com o seu usuario.',

    'usage.empty': 'Nenhum uso de token encontrado.',
    'usage.total': 'Total: {tokens} tokens em {turns} turnos',
    'usage.input': 'entrada',
    'usage.output': 'saida',
    'usage.cacheRead': 'leitura cache',
    'usage.cacheWrite': 'escrita cache',
    'usage.byDay': 'Por dia',
    'usage.byWeek': 'Por semana',
    'usage.byAgent': 'Por agente',
    'usage.byModel': 'Por modelo',
    'usage.byProject': 'Por projeto',
    'usage.more': '  ... e mais {n}',
    'usage.approximate.1': 'Nota: {n} sessao(oes) do Codex sem detalhe por turno entraram',
    'usage.approximate.2': 'apenas com o total da sessao, sem quebra por dia.',
    'usage.noMoney.1': 'Sem valores em dinheiro: em plano de assinatura o token nao e cobrado',
    'usage.noMoney.2': 'por unidade, entao qualquer cifra aqui seria inventada.',
  },
};

function t(key, params = {}, lang = currentLang()) {
  const tabela = MESSAGES[lang] || MESSAGES.en;
  const texto = tabela[key] || MESSAGES.en[key] || key;

  return texto.replace(/\{(\w+)\}/g, (match, nome) =>
    Object.prototype.hasOwnProperty.call(params, nome) ? String(params[nome]) : match
  );
}

module.exports = { t, MESSAGES };
