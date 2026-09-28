# nexo

Lista as sessoes de agentes de IA de terminal (Claude Code, Codex) de qualquer
pasta do sistema e abre a escolhida em um terminal novo, ja retomada.

Nao precisa estar dentro de uma sessao do Claude para usar.

## Instalar

```
git clone <repo> nexo
cd nexo
npm install -g .
```

(ou rode `install.ps1` no Windows / `install.sh` no Linux-Mac)

## Uso

De qualquer terminal, qualquer pasta:

```
nexo               lista as sessoes e abre a escolhida
nexo spec-kit      ja abre a lista filtrada por "spec-kit"
nexo --list        apenas imprime as sessoes
nexo --help        ajuda
```

### Navegacao

| Tecla                  | Acao                  |
| ---------------------- | --------------------- |
| `W` / `S`              | mover para cima/baixo |
| setas cima/baixo       | mover                 |
| `K` / `J`              | mover (estilo vim)    |
| Ctrl+P / Ctrl+N        | mover                 |
| PageUp / PageDown      | pular uma pagina      |
| Home / End             | primeira / ultima     |
| `/`                    | abrir o filtro        |
| Enter                  | abrir a sessao        |
| Esc / `Q` / Ctrl+C     | sair                  |

A lista circula nas pontas e rola sozinha quando passa da altura da tela.
Sem TTY (pipe, CI) cai numa lista numerada.

### Filtro

`/` abre o filtro. A partir dai as letras viram texto de busca (por isso o
filtro precisa do `/`: fora dele, `W` e `S` navegam).

- busca em diretorio, id e resumo ao mesmo tempo
- ignora acento e caixa: `acao` acha `Ação`, `grafico` acha `gráfico`
- varios termos funcionam como E: `grafico so4` exige os dois
- Backspace apaga, Ctrl+U limpa tudo
- setas continuam navegando o resultado
- Esc limpa o filtro; com o filtro ja limpo, Esc sai

## Backends de abertura (prioridade)

1. **Herdr** - com `HERDR_ENV=1` e `HERDR_WORKSPACE_ID`: cria uma tab nova e
   inicia o agente Claude ja resumindo a sessao.
2. **Windows Terminal** - com `wt.exe` no PATH: abre uma aba nova.
3. **tmux** - dentro de uma sessao tmux: abre uma janela nova.
4. **Fallback** - imprime o comando pronto (`cd` + `claude -r`) para colar.

Nenhum backend e obrigatorio. Se o primeiro disponivel falhar, o proximo
assume e o erro do anterior aparece como aviso.

## Plugin do Claude Code (opcional)

O CLI e a interface principal e funciona sem o Claude aberto. Para quem ja esta
dentro de uma sessao, o repositorio tambem e um plugin com a skill `/switch`:

```
/plugin marketplace add <usuario>/nexo
/plugin install nexo
```

Com isso o Claude responde a coisas como "em que eu estava trabalhando sexta?"
ou "abre aquela sessao do grafico do SO4", usando `nexo --json` para procurar e
`nexo --open <id>` para abrir.

A skill abre a sessao em um terminal **novo** - nenhuma skill consegue
substituir a sessao do Claude que esta rodando.

## Como funciona

Le os arquivos `~/.claude/projects/*/*.jsonl` (formato do Claude Code) e extrai
`cwd`, `sessionId` e um rotulo para a sessao.

O rotulo, em ordem de prioridade:

1. `custom-title` - o nome dado no `/rename`
2. `ai-title` - o nome gerado automaticamente pelo Claude
3. a primeira mensagem real do usuario, pulando as automaticas
   (`<ide_opened_file>`, caveats, continuacao de contexto)

O caminho do projeto vem do campo `cwd` de dentro do arquivo, e nao do nome da
pasta: `C--DEV-SO5-SO5-Back-End` e ambiguo demais para decodificar de volta.

Os titulos sao reescritos ao longo de todo o arquivo, entao o atual e o ultimo.
Para nao reler 150MB a cada chamada, so os ultimos 64KB de cada arquivo sao
lidos - custo medido de ~50ms para a base inteira.

Ids de sessao passam por validacao (`[A-Za-z0-9_-]{4,64}`) antes de chegar em
qualquer comando de shell.

## Testes

```
npm test
```
