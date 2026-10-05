// Sequencias de tela alternativa compartilhadas por pick.js, usage/interactive.js
// e scan/interactive.js - um lugar so evita que uma correcao saia aplicada
// em dois arquivos e esquecida no terceiro (ja aconteceu).
const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

const HOME = '\x1b[H';
const CLEAR_LINE = '\x1b[K'; // apaga da posicao do cursor ate o FIM da linha atual
const CLEAR_TO_END = '\x1b[0J'; // apaga da posicao do cursor ate o fim da TELA

// Apagar a tela inteira antes de redesenhar ("\x1b[H\x1b[2J") pisca em
// console de verdade - fica um instante em branco entre apagar e reescrever
// (confirmado no PowerShell classico; o Herdr nao mostra porque le o stream
// direto, sem repintar uma tela fisica de verdade).
//
// A correcao obvia - so voltar o cursor pro topo e escrever por cima, sem
// apagar antes - sozinha deixa lixo a DIREITA de qualquer linha que no frame
// novo ficou mais curta que no frame anterior (confirmado ao vivo: bordas
// de caixas se misturando). Por isso cada linha fecha com "\x1b[K" antes da
// quebra, apagando so o resto daquela linha especifica. "\x1b[0J" no final
// cobre o caso do frame novo ter menos LINHAS no total que o anterior.
function frame(text) {
  return HOME + text.split('\n').join(`${CLEAR_LINE}\n`) + CLEAR_LINE + CLEAR_TO_END;
}

module.exports = { ALT_SCREEN_ON, ALT_SCREEN_OFF, CURSOR_HIDE, CURSOR_SHOW, frame };
