// O Windows Terminal (via ConPTY) manda Ctrl+Enter como sequencia de escape,
// nao como tecla comum. Confirmado ao vivo: chega como ESC[27;5;13~ e o
// decodificador nativo do readline nao reconhece esse padrao - fragmenta em
// keypress sem sentido, dois dos quais ("1", "3") vazariam como texto digitado
// na busca se ninguem interceptasse antes.
const SEQUENCES = [
  '\x1b[27;5;13~', // xterm modifyOtherKeys
  '\x1b[13;5u', // CSI u (kitty keyboard protocol e afins)
];

const MAX_PREFIX = Math.max(...SEQUENCES.map((s) => s.length)) - 1;

function isPrefixOfAny(text) {
  return SEQUENCES.some((seq) => seq.startsWith(text));
}

// Recebe os bytes crus (como string latin1: 1 caractere = 1 byte, sem risco
// de embaralhar UTF-8 multibyte) e devolve o que sobra para o decodificador
// normal, quantas vezes o Ctrl+Enter apareceu, e o que precisa esperar o
// proximo pedaço (a sequencia pode chegar cortada ao meio entre dois chunks).
function extractCtrlEnter(raw, carry = '') {
  let text = carry + raw;
  let hits = 0;

  for (const seq of SEQUENCES) {
    while (text.includes(seq)) {
      text = text.replace(seq, '');
      hits++;
    }
  }

  let nextCarry = '';
  for (let len = Math.min(MAX_PREFIX, text.length); len > 0; len--) {
    const tail = text.slice(-len);
    if (isPrefixOfAny(tail)) {
      nextCarry = tail;
      text = text.slice(0, -len);
      break;
    }
  }

  return { remainder: text, hits, carry: nextCarry };
}

module.exports = { extractCtrlEnter, SEQUENCES };
