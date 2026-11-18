# System Design na Prática

Site de estudos responsivo, em português, para aprender **System Design** de verdade e se preparar para entrevistas de emprego.

A sequência segue os temas do livro *System Design Interview – An Insider's Guide* (Alex Xu, Vol. 1), com muito material extra: um guia de **quando usar cada ferramenta**, conceitos de sistemas distribuídos, simulações de entrevista e exercícios. Os exemplos de implementação são em **Go**, com testes.

## O que tem aqui

| Seção | Conteúdo |
|---|---|
| **Fundamentos** | Escalar de zero a milhões de usuários · estimativas (com calculadora) · framework de 4 passos para a entrevista |
| **Blocos de construção** | *Qual ferramenta usar?* (SQL, NoSQL, Redis, Kafka × RabbitMQ × SQS, S3, Elasticsearch, OLAP, protocolos…) · sistemas distribuídos (CAP, PACELC, consistência, quórum, Raft, idempotência, sagas, outbox) |
| **12 estudos de caso** | Rate limiter · consistent hashing · key-value store · IDs únicos · encurtador de URL · web crawler · notificações · news feed · chat · autocomplete · YouTube · Google Drive |
| **Simulador** | 25 entrevistas (11 do livro + 14 frequentes em big techs: Uber, Ticketmaster, pagamentos, leaderboard, Yelp, top-K, métricas, Kafka, hotel, Google Docs, job scheduler, ad clicks, cache distribuído, Instagram) com cronômetro, respostas do entrevistador, resposta-modelo por fase, perguntas-surpresa e rubrica |
| **Exercícios** | 112 exercícios: estimativas, conceitos, "qual ferramenta?", trade-offs, mini-designs e código Go |
| **Referência** | Cola para o dia da entrevista · cursos, vídeos, livros, papers e blogs · glossário |

Cada estudo de caso traz requisitos, estimativas, API, diagramas (Mermaid), deep dives com trade-offs, código Go, um diálogo simulado de entrevista, perguntas de follow-up, quiz e links.

Progresso (tópicos estudados, quizzes, simulações, exercícios e anotações) fica salvo no `localStorage` do navegador.

## Como abrir

HTML/CSS/JS puro, sem build.

```bash
# servidor local (recomendado)
python3 -m http.server 8000
# acesse http://localhost:8000
```

Diagramas (Mermaid) e destaque de sintaxe (highlight.js) vêm de CDN; offline, o código-fonte dos diagramas continua visível.

## Código Go

```bash
cd go
go test ./... -v
```

| Pacote | O quê |
|---|---|
| `ratelimit` | Token bucket, leaking bucket, fixed window, sliding log, sliding counter + middleware HTTP |
| `consistenthash` | Anel com nós virtuais; os testes medem o remapeamento (~19% × ~80% com `hash % N`) |
| `snowflake` | Gerador de IDs de 64 bits, concorrente, detecta relógio voltando |
| `shortener` | Base62 + serviço de redirecionamento |
| `kvstore` | Vector clocks + coordenador de quórum (N, W, R) com versões em conflito |
| `bloom` | Bloom filter dimensionado por n e p |
| `crawler` | URL frontier com prioridade, politeness por host e dedup |
| `notification` | Worker com idempotência, retry exponencial + jitter e DLQ |
| `feed` | Fanout híbrido (push + pull para celebridades) |
| `chat` | Presença por heartbeat + sincronização multi-dispositivo |
| `autocomplete` | Trie com top-k por nó |
| `cache` | LRU genérico com TTL e cache-aside |
| `filesync` | Divisão em blocos, manifest e delta sync |

O código mostrado nas páginas é copiado destes arquivos. Depois de alterar o Go, rode:

```bash
node tools/embed-go.mjs
```

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e faça push da branch `main`.
2. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. O site fica em `https://<seu-usuario>.github.io/<repositorio>/`.

O arquivo `.nojekyll` desliga o Jekyll. O workflow em `.github/workflows/go.yml` roda `go vet` e `go test` a cada push.

## Estrutura

```
index.html                 página inicial e progresso
css/style.css              estilos (claro/escuro, responsivo, impressão)
js/site.js                 menu, navegação, tema, quiz, progresso, Mermaid, highlight
js/simulacoes-data.js      dados das 25 simulações
js/exercicios-data.js      banco de 112 exercícios
pages/                     guia, capítulos 01–15, ferramentas, distribuídos,
                           simulador, exercícios, cola, recursos, glossário
go/                        implementações em Go com testes
tools/embed-go.mjs         copia o código Go para as páginas
```

Para adicionar uma página, copie o cabeçalho de uma existente em `pages/` e registre-a em `SITE_PAGES` (`js/site.js`). Os `<h2 id="...">` aparecem automaticamente no menu lateral.

## Aviso

Os textos, diagramas, código e exercícios foram escritos para este site; nenhum trecho do livro é reproduzido. Recomendo comprar o livro para apoiar o autor.
