---
name: switch
description: >
  Lista as sessoes de agentes de IA de terminal (Claude Code, Codex, opencode)
  de todos os repositorios da maquina e abre a escolhida em um terminal novo,
  ja resumida. Tambem procura credencial vazada nos logs e mostra uso de
  tokens. Use quando o usuario perguntar "em que eu estava trabalhando",
  "quais minhas sessoes", "o que eu estava fazendo na sexta", "abre aquela
  sessao do X", "trocar de sessao", "estou vazando alguma credencial?",
  "quanto eu gastei de token essa semana", ou invocar /switch. Tambem serve
  para procurar uma sessao antiga por assunto, mesmo que ela seja de outro
  diretorio ou de outro agente.
---

# Switch de sessoes de agentes de IA

Usa o CLI `nexo` para enxergar as sessoes de **todos os agentes e todos os
repositorios**, nao so a do diretorio e do agente atual (que e a limitacao do
`/resume` nativo de cada um).

## Antes de tudo: o CLI esta instalado?

```bash
nexo --help
```

Se falhar, avise o usuario que precisa instalar (`npm install -g .` na pasta do
repositorio `nexo`) e pare por aqui.

## Listar as sessoes

Sempre use `--json`, que e estavel para leitura:

```bash
nexo --json
```

Com termo de busca, quando o usuario descreveu o assunto:

```bash
nexo --json "grafico so4"
```

O filtro ignora acento e caixa, casa em agente, diretorio, branch, titulo, id
e resumo, e trata varios termos como E. Cada item traz `agent`, `sessionId`,
`dir`, `title`, `age`, `mtime` e `summary`.

## Apresentar o resultado

Mostre no maximo ~10 candidatas, ordenadas da mais recente para a mais antiga,
sempre com: **agente**, **diretorio**, **quanto tempo faz** e o **titulo** (ou
o resumo, se nao tiver titulo). O id completo so polui; use os 8 primeiros
caracteres. Diga o agente sempre que houver mais de um na lista - "essa e uma
sessao do Codex" evita confusao quando o usuario tem varios agentes.

Se o usuario descreveu um assunto, leia os resumos e diga qual voce acha que e
a sessao que ele procura, em vez de despejar a lista crua.

Se nada casar, diga isso e sugira um termo mais curto - nao invente sessao.

## Abrir a sessao escolhida

Confirme a escolha com o usuario antes de abrir (abre terminal de verdade):

```bash
nexo --open <sessionId>
```

Aceita o id completo ou um prefixo, de qualquer agente. O `nexo` escolhe
sozinho como abrir: Herdr (tab nova), Windows Terminal (aba nova), tmux
(janela nova), console classico do Windows (janela nova) ou, sem nada disso,
imprime o comando para o usuario colar.

## Verificar credencial vazada

Quando o usuario perguntar sobre segredo vazado, credencial exposta, ou pedir
uma auditoria de seguranca dos logs:

```bash
nexo scan --json
```

Devolve so metadado - tipo do achado, quantas vezes apareceu, linha, agente e
sessao. **Nunca** o valor do segredo em si. Separe por confianca ao responder:
achados de `confidence: "alta"` sao credencial de verdade (formato de chave de
AWS, GitHub, etc); `media` e `baixa` podem ser codigo citado ou ruido, avise
que merecem conferencia antes de qualquer acao.

Se houver achado de alta confianca, a orientacao e sempre a mesma, nessa
ordem: **1)** rotacionar a credencial (ela ja foi enviada ao provedor junto
com a conversa, apagar o log local nao desfaz isso); **2)** so depois, se
quiser, `nexo scan --redact` remove a copia local (so sessoes do Claude, so
achados de alta confianca). Explique que isso nao desfaz o vazamento, so
reduz a exposicao local, e confirme com o usuario antes de rodar - reescreve
o arquivo original de outro programa.

## Mostrar uso de tokens

Quando o usuario perguntar quanto gastou, quantos tokens usou, ou quiser um
panorama de uso:

```bash
nexo usage --json
```

Devolve uma lista de turnos com `agent`, `model`, `dir`, `at` (timestamp) e os
componentes de token (`input`, `output`, `cacheRead`, `cacheWrite`,
`reasoning`). Agregue conforme o que o usuario pediu (por dia, por projeto,
por modelo). Nao converta em dinheiro: em plano de assinatura o token nao e
cobrado por unidade, e qualquer cifra seria inventada.

## Limite importante

`nexo --open` abre a sessao em um terminal **novo**. Nenhum comando substitui
a sessao de onde voce esta rodando agora - isso e impossivel de dentro dela.
Se o usuario quiser trocar sem abrir outra janela, diga para ele sair desta
sessao e rodar `nexo` direto no terminal.
