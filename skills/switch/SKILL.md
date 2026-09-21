---
name: switch
description: >
  Lista as sessoes do Claude Code de todos os repositorios da maquina e abre a
  escolhida em um terminal novo, ja resumida. Use quando o usuario perguntar
  "em que eu estava trabalhando", "quais minhas sessoes", "o que eu estava
  fazendo na sexta", "abre aquela sessao do X", "trocar de sessao", ou invocar
  /switch. Tambem serve para procurar uma sessao antiga por assunto, mesmo que
  ela seja de outro diretorio.
---

# Switch de sessoes do Claude Code

Usa o CLI `ccsw` para enxergar as sessoes de **todos** os repositorios, nao so
a do diretorio atual (que e a limitacao do `/resume` nativo).

## Antes de tudo: o CLI esta instalado?

```bash
ccsw --help
```

Se falhar, avise o usuario que precisa instalar (`npm install -g .` na pasta do
repositorio `claude-switch`) e pare por aqui.

## Listar as sessoes

Sempre use `--json`, que e estavel para leitura:

```bash
ccsw --json
```

Com termo de busca, quando o usuario descreveu o assunto:

```bash
ccsw --json "grafico so4"
```

O filtro ignora acento e caixa, casa em diretorio, id e resumo, e trata varios
termos como E. Cada item traz `sessionId`, `dir`, `age`, `mtime` e `summary`.

## Apresentar o resultado

Mostre no maximo ~10 candidatas, ordenadas da mais recente para a mais antiga,
sempre com: **diretorio**, **quanto tempo faz** e **resumo**. O id completo so
polui; use os 8 primeiros caracteres.

Se o usuario descreveu um assunto, leia os resumos e diga qual voce acha que e
a sessao que ele procura, em vez de despejar a lista crua.

Se nada casar, diga isso e sugira um termo mais curto - nao invente sessao.

## Abrir a sessao escolhida

Confirme a escolha com o usuario antes de abrir (abre terminal de verdade):

```bash
ccsw --open <sessionId>
```

Aceita o id completo ou um prefixo. O `ccsw` escolhe sozinho como abrir:
Herdr (tab nova), Windows Terminal (aba nova), tmux (janela nova) ou, sem nada
disso, imprime o comando para o usuario colar.

## Limite importante

`ccsw --open` abre a sessao em um terminal **novo**. Ele nao substitui a sessao
do Claude onde voce esta rodando agora - isso e impossivel de dentro dela. Se o
usuario quiser trocar sem abrir outra janela, diga para ele sair desta sessao e
rodar `ccsw` direto no terminal.
