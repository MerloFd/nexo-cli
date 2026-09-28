# nexo

Sessoes de agentes de IA de terminal, todas em um lugar so.

O `/resume` do Claude Code e o `codex resume` so enxergam o agente deles. Se
voce usa mais de um agente, em varios repositorios, nao existe um lugar que
mostre tudo junto - e depois de um fim de semana ninguem lembra onde parou.

O `nexo` le os arquivos locais de sessao de cada agente, lista tudo numa lista
so com busca, e abre a escolhida **em um terminal novo**, sem derrubar o que
voce ja tem aberto.

Suporta hoje **Claude Code** e **OpenAI Codex**.

## Instalar

```
git clone https://github.com/MerloFd/nexo-cli
cd nexo-cli
npm install -g .
```

Precisa de Node 18+. Nenhuma dependencia externa.

## Uso

```
nexo                lista as sessoes e abre a escolhida
nexo <termo>        ja abre a lista filtrada
nexo scan           procura credencial vazada nos logs
nexo usage          panorama de uso de tokens
nexo --help         ajuda
```

### A lista

```
  Sessoes (1 de 71)
  ┌────────────────────────────────────────────────────┐
  │ ⌕ Search…                                          │
  └────────────────────────────────────────────────────┘

> Ferramenta de switch entre sessoes
    claude · agora · HEAD · 3.5MB · 323k ctx
  FIX RECORRENCIAS
    codex · 2d atras · frete-refactor · 18.6MB · 3.7M usados
```

Digite qualquer coisa e a busca comeca - sem prefixo. Ela ignora acento e
caixa, trata varios termos como E, e procura em agente, branch, titulo,
diretorio e resumo. Setas (ou Ctrl+P / Ctrl+N) movem, Enter abre, Esc limpa a
busca e, com ela ja vazia, sai.

O rotulo e o nome real da sessao: o que voce deu no `/rename`, ou o gerado pelo
agente, ou a primeira mensagem sua, nessa ordem.

### Onde a sessao abre

Na ordem do mais capaz para o menos:

| Ambiente | Resultado |
| --- | --- |
| Herdr | tab nova |
| Windows Terminal | aba nova |
| tmux | janela nova |
| cmd / PowerShell classico | janela nova |
| qualquer outro | imprime o comando pronto |

Nenhum deles e obrigatorio, e se um falhar o proximo assume.

No terminal integrado do VS Code a sessao sai em um terminal externo: o VS Code
nao expoe API para criar aba por linha de comando
([vscode#238786](https://github.com/microsoft/vscode/issues/238786)).

## nexo scan

Varre os logs de sessao procurando credencial que passou pelo chat. Os achados
vem separados por confianca, e o valor sempre aparece mascarado.

```
26 achado(s) de alta confianca e 66 a conferir, em 21 sessao(oes).

ALTA CONFIANCA - formato so existe em credencial de verdade:

  Templates para EN
    claude · 4d atras · C:\DEV\Projeto
      AWS access key: AKI********GZ (56x)  linha 1292
```

Duas coisas que o relatorio deixa explicitas:

1. **Rotacione a credencial.** Ela ja foi enviada ao provedor junto com a
   conversa; apagar o arquivo local nao desfaz isso.
2. Depois limpe o log, que fica em texto puro no seu perfil e pode ser lido por
   qualquer processo rodando com o seu usuario.

`nexo scan --json` devolve apenas metadado - tipo, contagem e localizacao.
Nunca o valor do segredo.

## nexo usage

Panorama de tokens por dia (ou `--semana`), agente, modelo e projeto.

```
Total: 8.1B tokens em 22765 turnos

  entrada          2.6M    0%
  saida           19.4M    0%
  leitura cache    7.9B   97%
  escrita cache  201.0M    2%

Por modelo

  claude-sonnet-5    7.2B  ████████████████████████
  claude-opus-5    547.9M  █▉
  gpt-5.5           23.5M  ▏
```

Cada turno e contado com o modelo daquele turno, porque o modelo muda no meio
da sessao. Nao ha valores em dinheiro: em plano de assinatura o token nao e
cobrado por unidade, entao qualquer cifra seria inventada.

## Como funciona

| Agente | Origem | Retomada |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/*/*.jsonl` | `claude -r <id>` |
| Codex | `~/.codex/state*.sqlite`, com fallback nos rollouts JSONL | `codex resume <id>` |

O diretorio do projeto vem do campo `cwd` de dentro do arquivo, nunca do nome
da pasta: `C--DEV-SO5-SO5-Back-End` e ambiguo demais para decodificar.

Titulo, branch e uso sao reescritos ao longo do arquivo, entao valem os
ultimos - por isso so os 64KB finais sao lidos, em vez do arquivo inteiro. Um
cache chaveado por mtime e tamanho evita reler o que nao mudou: a listagem sai
em cerca de 100ms. `NEXO_NO_CACHE=1` desliga.

## Projetos parecidos

- [fast-resume](https://github.com/angristan/fast-resume) - mesma ideia, em
  Rust, com mais agentes. Nao publica binario para Windows e usa `exec()`,
  substituindo a sessao atual em vez de abrir outra.
- [ccusage](https://ccusage.com) - contagem de tokens e custo para ~18 agentes.
  Mais completo que o `nexo usage`, mas nao lista nem retoma sessao.

## Testes

```
npm test
```

## Licenca

MIT
