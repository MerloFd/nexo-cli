const { setLang, currentLang, IDIOMAS, CONFIG_FILE } = require('../config');
const { t } = require('../i18n');

function run(alvo) {
  if (!alvo) {
    console.log(currentLang());
    return 0;
  }

  const escolhido = String(alvo).toLowerCase();

  if (!setLang(escolhido)) {
    console.error(t('cli.langInvalid', { lang: alvo, options: IDIOMAS.join(', ') }));
    return 1;
  }

  // A mensagem ja sai no idioma novo: confirma a mudanca mostrando o efeito.
  console.log(t('cli.langChanged', { lang: escolhido }, escolhido));
  console.log(CONFIG_FILE);
  return 0;
}

module.exports = { run };
