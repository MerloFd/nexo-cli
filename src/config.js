const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.nexo-config.json');
const IDIOMAS = ['en', 'pt'];
const PADRAO = { lang: 'en' };

function load(file = CONFIG_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...PADRAO, ...raw };
  } catch {
    return { ...PADRAO };
  }
}

function save(config, file = CONFIG_FILE) {
  try {
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function setLang(lang, file = CONFIG_FILE) {
  if (!IDIOMAS.includes(lang)) return false;
  return save({ ...load(file), lang }, file);
}

// Variavel de ambiente ganha do arquivo: permite testar e scriptar sem
// alterar a preferencia gravada do usuario.
function currentLang(file = CONFIG_FILE) {
  const doAmbiente = process.env.NEXO_LANG;
  if (IDIOMAS.includes(doAmbiente)) return doAmbiente;
  return load(file).lang;
}

function isFirstRun(file = CONFIG_FILE) {
  return !fs.existsSync(file);
}

module.exports = { load, save, setLang, currentLang, isFirstRun, IDIOMAS, CONFIG_FILE };
