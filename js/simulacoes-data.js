/* ==========================================================
   Dados do simulador de entrevistas.
   Cada simulação: enunciado, respostas do entrevistador às
   perguntas de clarificação, resposta-modelo por fase,
   perguntas de deep dive, perguntas-surpresa e rubrica.
   ========================================================== */

const COMMON_RUBRIC = [
  "Fiz perguntas de clarificação antes de desenhar",
  "Escrevi requisitos funcionais E não funcionais explícitos",
  "Fiz estimativas e usei os números para tomar decisões",
  "Defini as APIs principais",
  "Defini o modelo de dados e justifiquei o banco escolhido",
  "Desenhei um alto nível completo que cobre todos os requisitos funcionais",
  "Aprofundei pelo menos 2 componentes críticos",
  "Discuti trade-offs (o que ganhei e o que perdi em cada escolha)",
  "Tratei falhas (o que acontece se X cair?)",
  "Fechei com gargalos, monitoramento e evolução",
];

const SIMULATIONS = [
// ---------------------------------------------------------------- LIVRO
{
  id: "rate-limiter", title: "Rate limiter de API", level: "medium", source: "livro", chapter: "04-rate-limiter.html",
  prompt: "Projete um rate limiter para a API pública da nossa empresa.",
  clarify: [
    ["Lado do cliente ou do servidor?", "Servidor."],
    ["Limitar por quê: IP, usuário, API key?", "Flexível: regras diferentes por API key e por endpoint."],
    ["Escala?", "Milhões de usuários; ~50 mil req/s no total."],
    ["Ambiente distribuído?", "Sim, dezenas de servidores de API."],
    ["Avisar o cliente?", "Sim."],
    ["Se o rate limiter falhar?", "A API não pode parar."],
  ],
  req: `<ul><li><b>Funcionais:</b> limitar requisições por chave e regra; responder 429 com headers informativos; regras configuráveis.</li><li><b>Não funcionais:</b> latência adicional &lt; 1–2 ms; limite global entre todos os servidores; alta disponibilidade (fail-open); pouca memória.</li></ul>`,
  est: `<p>50 mil req/s com ~3 operações de Redis cada = 150 mil ops/s, distribuídas num Redis Cluster com 3–6 shards. Memória: 10 M chaves × ~100 B = 1 GB.</p>`,
  api: `<p>Não há API pública nova: é um middleware. Interface interna <code>Allow(key, rule) → (bool, remaining, resetAt)</code>. Resposta: <code>429</code> + <code>X-RateLimit-Limit/Remaining/Reset</code> ou <code>Retry-After</code>.</p><p>Regras em YAML/config (domínio, descritor, unidade, limite), cacheadas em memória em cada middleware.</p>`,
  hld: `<p>Middleware no API gateway → consulta regras (cache local) → script Lua no Redis Cluster (token bucket) → permite ou 429. Workers recarregam as regras.</p>`,
  diagram: `flowchart LR
  C[Cliente] --> GW[API gateway + middleware]
  GW --> RC[(Regras: cache local)]
  GW -->|Lua atômico| R[(Redis Cluster)]
  GW -->|ok| API[Serviços]
  GW -->|429| C`,
  deep: [
    ["Qual algoritmo e por quê?", "Token bucket: permite rajadas legítimas e mantém a taxa média; O(1) de memória. Sliding window counter se a precisão na borda importar; sliding log para limites baixos e críticos (login)."],
    ["Como evitar race conditions entre servidores?", "A operação inteira (ler tokens, repor, decrementar, gravar) num script Lua, que o Redis executa atomicamente. INCR sozinho serve para fixed window."],
    ["E se o Redis cair?", "Fail-open com um limite local conservador em memória + alerta. Para login/antifraude, talvez fail-closed. Redis com réplicas e failover automático."],
    ["Multi-região?", "Limite por região (limite/N) ou contadores locais com sync assíncrono. Store global síncrono adicionaria ~100 ms."],
  ],
  curve: [
    ["Um cliente enterprise gera 30% do tráfego: hot key no Redis.", "Dividir em sub-chaves (key#0..k, cada uma com limite/k) ou pré-filtro local no gateway com sincronização periódica."],
    ["Agora precisamos limitar requisições concorrentes (não por segundo) para um endpoint caro.", "Semáforo distribuído: INCR na entrada, DECR na saída, com TTL para não vazar se o processo morrer."],
    ["Black Friday: clientes legítimos estão recebendo 429.", "Aumentar a capacidade do balde (rajadas), limites dinâmicos por plano, monitorar a taxa de 429 por regra; diferenciar rate limiting de load shedding."],
  ],
  rubric: ["Comparei pelo menos 3 algoritmos", "Resolvi a race condition (Lua/atomicidade)", "Defini o comportamento em falha (fail-open/closed)", "Defini a resposta HTTP 429 e os headers"],
},
{
  id: "kv-store", title: "Key-value store distribuído", level: "hard", source: "livro", chapter: "06-key-value-store.html",
  prompt: "Projete um key-value store distribuído como o DynamoDB.",
  clarify: [
    ["Tamanho dos pares?", "Pequenos, menos de 10 KB."],
    ["Volume?", "Centenas de TB, crescendo."],
    ["Consistência ou disponibilidade?", "Alta disponibilidade, consistência ajustável."],
    ["Operações?", "get(key), put(key, value). Sem range scans."],
    ["Multi-datacenter?", "Sim."],
  ],
  req: `<ul><li><b>Funcionais:</b> get/put.</li><li><b>Não funcionais:</b> AP com consistência ajustável; escala horizontal automática; baixa latência (p99 &lt; 10 ms); tolerância a falhas de nós e de DC; sem SPOF.</li></ul>`,
  est: `<p>500 TB × 3 réplicas = 1,5 PB. Com nós de 10 TB úteis: ~150 nós. 1 M ops/s ÷ 150 = ~7 mil ops/s por nó: confortável para uma LSM tree.</p>`,
  api: `<p><code>get(key) → [(value, context)]</code> (pode haver várias versões em conflito); <code>put(key, value, context)</code>, em que o context carrega o vector clock lido.</p>`,
  hld: `<p>Anel de consistent hashing com vnodes; N=3 réplicas por chave; qualquer nó é coordenador; quórum W/R; gossip para membership; storage engine LSM em cada nó.</p>`,
  diagram: `flowchart LR
  C[Cliente] --> CO[Coordenador: qualquer nó]
  CO --> A((n1))
  CO --> B((n2))
  CO --> D((n3))
  A <-. gossip .-> B
  B <-. gossip .-> D`,
  deep: [
    ["Como particionar?", "Consistent hashing com ~256 vnodes por nó; nós maiores recebem mais vnodes; adicionar um nó move ~1/N das chaves."],
    ["Como garantir a leitura da última escrita?", "Quórum com W + R > N (por exemplo, N=3, W=2, R=2), configurável por requisição."],
    ["Escritas concorrentes?", "Vector clocks detectam conflitos; o get devolve as versões irmãs e o cliente reconcilia. Alternativa: LWW quando sobrescrever é aceitável."],
    ["Falhas temporárias e permanentes?", "Sloppy quorum + hinted handoff para as temporárias; anti-entropy com Merkle trees para as permanentes; gossip para detectar."],
    ["Caminho de escrita e leitura no nó?", "Commit log → memtable → SSTable (flush) + compaction. Leitura: memtable → Bloom filters → SSTables."],
  ],
  curve: [
    ["Agora precisamos de consistência forte em algumas chaves.", "Ler e escrever com quórum estrito (sem sloppy), ou um grupo Raft por partição para essas chaves (ao custo de latência e disponibilidade)."],
    ["Um nó está lento (não morto) e puxa o p99 para cima.", "Requisições paralelas ao quórum e responder com as R primeiras; hedged requests; tirar o nó lento do pool por métricas de latência."],
    ["Precisamos de range scans por prefixo.", "Particionamento por faixa (range) em vez de hash, com divisão automática de faixas quentes, como no Bigtable/HBase."],
  ],
  rubric: ["Justifiquei AP × CP com o caso de uso", "Expliquei quórum com números", "Expliquei a detecção e a resolução de conflitos", "Cobri falhas temporárias e permanentes"],
},
{
  id: "unique-id", title: "Gerador de IDs únicos", level: "easy", source: "livro", chapter: "07-unique-id.html",
  prompt: "Projete um gerador de IDs únicos para um sistema distribuído.",
  clarify: [
    ["Características?", "Únicos e ordenáveis por tempo."],
    ["Numéricos? Tamanho?", "Numéricos, 64 bits."],
    ["Volume?", "10 mil IDs/s."],
    ["Precisam ser estritamente sequenciais?", "Não, só crescentes com o tempo."],
  ],
  req: `<ul><li>IDs únicos, numéricos, de 64 bits, ordenáveis por tempo.</li><li>10 mil/s, sem SPOF, baixa latência.</li></ul>`,
  est: `<p>10 mil/s é pouco: o Snowflake gera 4096/ms <em>por máquina</em>. O desafio não é vazão, é a ausência de coordenação.</p>`,
  api: `<p>Biblioteca embutida <code>NextID() int64</code> ou serviço <code>GET /id</code> (ou <code>/ids?n=100</code> em lote).</p>`,
  hld: `<p>Snowflake: 1 bit de sinal + 41 de timestamp (ms) + 5 de datacenter + 5 de máquina + 12 de sequência. Machine ID via lease no etcd/ZooKeeper.</p>`,
  diagram: `flowchart LR
  S1[Serviço A + lib Snowflake m=1] --> ID1[IDs]
  S2[Serviço B + lib Snowflake m=2] --> ID2[IDs]
  S1 & S2 -.->|lease do machine ID| ETCD[(etcd)]`,
  deep: [
    ["Compare com UUID, ticket server e multi-master.", "UUID: 128 bits e não ordenável (v4). Ticket server: SPOF. Multi-master: difícil escalar e não ordenado no tempo. Snowflake atende a tudo."],
    ["Relógio voltando no tempo?", "Detectar (agora < último ts): esperar se for pouco, erro e alerta se for muito; NTP em modo slew."],
    ["Sequência esgotou no mesmo ms?", "Esperar o próximo milissegundo."],
  ],
  curve: [
    ["Os IDs aparecem em URLs públicas e não queremos revelar volume.", "Snowflake já não é sequencial; para mais opacidade, uma permutação reversível com chave secreta."],
    ["Precisamos de 69 anos? E se quisermos mais máquinas?", "Ajustar a distribuição de bits: menos bits de DC/máquina, mais de sequência, unidade de tempo diferente, epoch customizada."],
  ],
  rubric: ["Comparei as 4 abordagens", "Expliquei o layout de bits com os cálculos", "Tratei clock skew", "Expliquei a atribuição de machine IDs"],
},
{
  id: "url-shortener", title: "Encurtador de URL (bit.ly)", level: "easy", source: "livro", chapter: "08-url-shortener.html",
  prompt: "Projete um encurtador de URL como o bit.ly.",
  clarify: [
    ["Volume de criação?", "100 milhões de URLs por dia."],
    ["Tamanho do código?", "O mais curto possível; [0-9a-zA-Z]."],
    ["Atualizar ou apagar?", "Não."],
    ["Analytics de cliques?", "Seria ótimo."],
    ["Códigos personalizados? Expiração?", "Opcional, se der tempo."],
  ],
  req: `<ul><li><b>Funcionais:</b> encurtar; redirecionar; (opcional) alias customizado, expiração, analytics.</li><li><b>Não funcionais:</b> redirect com baixa latência (&lt; 50 ms), alta disponibilidade, códigos não adivinháveis.</li></ul>`,
  est: `<p>Escrita ~1.200/s; leitura 10:1, ~12 mil/s. 10 anos: 365 bi de URLs × 100 B = 36,5 TB. 62<sup>7</sup> ≈ 3,5 tri, então 7 caracteres.</p>`,
  api: `<p><code>POST /api/v1/shorten {longUrl, alias?, expiresAt?} → {shortUrl}</code><br><code>GET /{code} → 302 Location</code></p><p>Tabela: <code>urls(code PK, long_url, user_id, created_at, expires_at)</code> num KV (DynamoDB/Cassandra) particionado por code.</p>`,
  hld: `<p>Web servers stateless → cache Redis (code → long) → banco. Criação: ID único (faixas pré-alocadas ou Snowflake) → base62. Cliques → Kafka → analytics.</p>`,
  diagram: `flowchart LR
  U[Usuário] --> LB[LB] --> W[Web servers]
  W --> C[(Redis)]
  W --> DB[(KV store)]
  W --> IDG[Gerador de IDs]
  W -.->|cliques| K[[Kafka]] -.-> A[(Analytics)]`,
  deep: [
    ["Hash ou base62?", "Hash (MD5 → 7 chars) colide e exige checagem a cada escrita. ID único + base62 não colide; embaralhar o ID evita enumeração."],
    ["301 ou 302?", "301 reduz carga (o browser cacheia), mas perde analytics; 302 conta todos os cliques."],
    ["Como escalar as leituras?", "Cache com hit rate alto (dados imutáveis, tráfego enviesado), réplicas, redirect servers multi-região, cache local para URLs virais."],
  ],
  curve: [
    ["Uma URL foi postada por uma celebridade: 200 mil req/s nela.", "Cache in-process nos web servers com TTL curto, CDN respondendo o redirect, réplicas da chave quente."],
    ["Usuários estão encurtando links de phishing.", "Verificação com Safe Browsing na criação e assíncrona; página de aviso; rate limit por usuário/IP."],
    ["O mesmo long URL deve devolver o mesmo código?", "Índice por hash(long_url) por usuário; trade-off: mais uma leitura na escrita e impossibilidade de estatísticas separadas por campanha."],
  ],
  rubric: ["Calculei o tamanho do código", "Comparei hash × ID + base62", "Discuti 301 × 302", "Projetei o cache para leitura"],
},
{
  id: "web-crawler", title: "Web crawler", level: "medium", source: "livro", chapter: "09-web-crawler.html",
  prompt: "Projete um web crawler para um buscador.",
  clarify: [
    ["Escala?", "1 bilhão de páginas por mês."],
    ["Conteúdo?", "Só HTML."],
    ["Páginas novas e editadas?", "Sim."],
    ["Guardar as páginas?", "Sim, por 5 anos."],
    ["Duplicatas?", "Ignorar."],
  ],
  req: `<ul><li>Baixar, extrair links e armazenar páginas; recrawl de páginas alteradas.</li><li>Escalável, robusto (HTML ruim, sites lentos, armadilhas), polido (respeitar robots.txt e não sobrecarregar), extensível.</li></ul>`,
  est: `<p>~400 páginas/s (pico 800). 500 KB/página = 500 TB/mês, 30 PB em 5 anos.</p>`,
  api: `<p>Sistema interno. Dados: URL storage (url, last_crawled, hash, priority), content store (S3: hash → HTML comprimido).</p>`,
  hld: `<p>Seeds → URL frontier → downloader (DNS cache, robots.txt) → parser → "conteúdo visto?" → content store → link extractor → URL filter → "URL vista?" → frontier.</p>`,
  diagram: `flowchart LR
  S[Seeds] --> F[Frontier] --> D[Downloader] --> P[Parser] --> CS{Conteúdo visto?}
  CS -->|não| ST[(S3)]
  CS -->|não| LE[Link extractor] --> UF[Filtro] --> US{URL vista?} -->|não| F`,
  deep: [
    ["Como garantir politeness?", "Uma back queue por host, um worker por fila, delay entre requisições (Crawl-delay), heap pelo próximo horário livre do host."],
    ["Como priorizar?", "Prioritizer (PageRank, tráfego, frequência de mudança) → front queues por prioridade → seletor com viés."],
    ["Dedup em escala?", "URL: normalização + Bloom filter. Conteúdo: hash (exato), SimHash (quase duplicatas)."],
    ["Distribuir entre máquinas?", "Particionar por hash(host) com consistent hashing; URLs de outros hosts vão para o dono via fila particionada."],
  ],
  curve: [
    ["Sites com JavaScript (SPA) não mostram links no HTML.", "Fila separada com headless browser (caro) para domínios que precisam; detectar pelo HTML vazio."],
    ["Um site gera URLs infinitas (calendário).", "Limites de profundidade e de URLs por host, tamanho máximo de URL, detecção de padrões repetidos, blocklist."],
    ["Como decidir quando recrawlear?", "Taxa de mudança histórica de cada página (hash diferente a cada visita) + importância; páginas de notícias com mais frequência."],
  ],
  rubric: ["Desenhei o frontier com prioridade e politeness", "Tratei a dedup de URL e de conteúdo", "Falei de robots.txt e spider traps", "Distribuí o crawl entre máquinas"],
},
{
  id: "notifications", title: "Sistema de notificações", level: "medium", source: "livro", chapter: "10-notificacoes.html",
  prompt: "Projete um sistema que envie push, SMS e e-mail.",
  clarify: [
    ["Volume?", "10 M push, 1 M SMS e 5 M e-mails por dia."],
    ["Tempo real?", "Soft real-time."],
    ["Quem dispara?", "Serviços internos e jobs agendados (marketing)."],
    ["Opt-out?", "Sim, por canal."],
    ["Pode duplicar?", "Evite ao máximo; pode atrasar um pouco, nunca perder."],
  ],
  req: `<ul><li><b>Funcionais:</b> enviar por canal; templates; preferências; agendamento; tracking.</li><li><b>Não funcionais:</b> não perder (at-least-once), dedup, prioridade (transacional antes de marketing), escalável, isolamento de falhas entre provedores.</li></ul>`,
  est: `<p>16 M/dia ≈ 185/s em média, mas campanhas geram picos de dezenas de milhares por segundo, por isso as filas.</p>`,
  api: `<p><code>POST /v1/notifications {notification_id, user_id, channels[], template, params, priority, send_at?}</code></p><p>Tabelas: devices, notification_settings, notification_log(id UNIQUE, status).</p>`,
  hld: `<p>API → validação, preferências e template → fila por canal e prioridade → workers → APNs/FCM/Twilio/SendGrid → log de status; retries e DLQ.</p>`,
  diagram: `flowchart LR
  S[Serviços] --> NS[Notification service]
  NS --> Q1[[push alta]] & Q2[[push bulk]] & Q3[[sms]] & Q4[[email]]
  Q1 & Q2 --> WP[Workers push] --> P[APNs/FCM]
  Q3 --> WS[Workers SMS] --> T[Twilio]
  Q4 --> WE[Workers email] --> E[SendGrid]`,
  deep: [
    ["Como não perder?", "Persistir antes do ack; fila durável; o worker só faz ack depois de enviar; retries com backoff + jitter; DLQ."],
    ["Como não duplicar?", "notification_id como chave de idempotência; SETNX/unique key antes de enviar."],
    ["Prioridade?", "Filas e pools separados para transacional × bulk; throttling do bulk para preservar a cota dos provedores."],
  ],
  curve: [
    ["O provedor de SMS está fora há 20 minutos.", "Circuit breaker → provedor secundário; mensagens acumulam na fila; alertas pela idade da fila."],
    ["Usuários reclamam de excesso de notificações.", "Rate limit por usuário e categoria, agrupamento (digest), horário silencioso por fuso."],
  ],
  rubric: ["Filas por canal/prioridade", "Idempotência com ID", "Retry com backoff + DLQ", "Preferências e templates"],
},
{
  id: "news-feed", title: "News feed (Facebook/Twitter)", level: "medium", source: "livro", chapter: "11-news-feed.html",
  prompt: "Projete o news feed de uma rede social.",
  clarify: [
    ["Funcionalidades?", "Publicar post e ver o feed de quem você segue."],
    ["Ordenação?", "Cronológica reversa."],
    ["Seguidores?", "Normal até 5 mil amigos; mas existem celebridades com milhões de seguidores."],
    ["Escala?", "10 M DAU (depois pergunte para 500 M)."],
    ["Mídia?", "Imagens e vídeos."],
  ],
  req: `<ul><li><b>Funcionais:</b> publicar; ler o feed paginado.</li><li><b>Não funcionais:</b> feed &lt; 200 ms; post aparece em segundos (eventual ok); alta disponibilidade.</li></ul>`,
  est: `<p>Posts: 10 M × 1/dia ≈ 120/s. Leituras: 10 M × 10 ≈ 1.200 feeds/s (pico ~3 mil). Fanout médio: 300 seguidores × 120 = 36 mil escritas no cache por segundo.</p>`,
  api: `<p><code>POST /v1/posts</code>, <code>GET /v1/feed?cursor=&amp;limit=20</code> (paginação por cursor).</p><p>posts(post_id Snowflake, author_id, content, media), follows(follower_id, followee_id), feed cache: user_id → lista de post_ids.</p>`,
  hld: `<p>Post service + fanout service (fila + workers) → feed cache (Redis lists). Leitura: feed cache + posts das celebridades (pull) → hidratação via post/user cache → mídia na CDN.</p>`,
  diagram: `flowchart LR
  U[Usuário] --> API[API]
  API --> PS[Post service] --> PDB[(Posts)]
  API --> FO[Fanout service] --> Q[[Fila]] --> W[Workers] --> FC[(Feed cache)]
  API --> FR[Feed service] --> FC
  FR --> PC[(Post cache)]`,
  deep: [
    ["Push ou pull?", "Híbrido: push para usuários comuns, pull para celebridades; pular o fanout para seguidores inativos."],
    ["O que o cache guarda?", "Só post_ids (LPUSH + LTRIM em ~500); conteúdo num post cache separado; hidratação em lote."],
    ["Hot key de celebridade?", "Replicar a chave, cache local com TTL curto, contadores agregados."],
  ],
  curve: [
    ["Agora o feed deve ser ranqueado por relevância.", "Gerar candidatos (push + pull, ~500), extrair features e pontuar com um modelo; o ranking acontece na leitura e pode ser cacheado por alguns minutos."],
    ["Um post foi apagado: ele some dos feeds?", "O cache guarda IDs; na hidratação, filtra posts apagados (tombstone). Opcionalmente, um fanout de remoção assíncrono."],
    ["Um usuário segue alguém novo: o feed precisa mostrar os posts antigos dessa pessoa?", "Backfill assíncrono dos N posts recentes no feed cache, ou merge por pull até o próximo refresh."],
  ],
  rubric: ["Comparei fanout on write × on read", "Resolvi as celebridades (híbrido)", "Feed cache guarda só IDs + hidratação", "Paginação por cursor"],
},
{
  id: "chat", title: "Chat (WhatsApp/Messenger)", level: "hard", source: "livro", chapter: "12-chat.html",
  prompt: "Projete um aplicativo de chat como o WhatsApp.",
  clarify: [
    ["1:1 e grupo?", "Os dois; grupos de até 100 (depois: 100 mil)."],
    ["Escala?", "50 M DAU (pode pensar em 500 M)."],
    ["Funcionalidades?", "Texto, online/offline, multi-dispositivo, push para offline. Status de leitura se der tempo."],
    ["Histórico?", "Para sempre."],
    ["E2E?", "Não agora."],
  ],
  req: `<ul><li><b>Funcionais:</b> enviar e receber 1:1 e grupo; histórico; presença; multi-dispositivo; push.</li><li><b>Não funcionais:</b> entrega em tempo real (&lt; 500 ms), sem perder mensagens, ordem por conversa, alta disponibilidade.</li></ul>`,
  est: `<p>50 M DAU × 40 msgs = 2 bi/dia ≈ 23 mil/s (pico ~50 mil). 2 bi × 100 B = 200 GB/dia. Conexões simultâneas: ~20 M; a ~100 mil por servidor, ~200 chat servers.</p>`,
  api: `<p>WebSocket: <code>send {client_msg_id, channel_id, text}</code>, <code>ack {message_id}</code>, <code>deliver {...}</code>, <code>sync {channel_id, after_id}</code>. HTTP para login, perfil, grupos.</p><p>messages: <code>PRIMARY KEY ((channel_id), message_id)</code> em Cassandra/ScyllaDB.</p>`,
  hld: `<p>Service discovery → chat servers (WebSocket, stateful) → ID generator → persistência no KV → registro de sessões (user → servidores) → entrega ao servidor do destinatário via message bus; push se offline; presence servers com heartbeat.</p>`,
  diagram: `flowchart LR
  A[Cliente A] <-->|WS| CS1[Chat server 1]
  B[Cliente B] <-->|WS| CS2[Chat server 2]
  CS1 --> KV[(Cassandra)]
  CS1 --> SR[(Sessões: Redis)]
  CS1 --> BUS[[Message bus]] --> CS2
  BUS --> PN[Push]
  CS1 & CS2 --> PR[Presença]`,
  deep: [
    ["Por que WebSocket?", "O servidor precisa iniciar o envio; polling desperdiça e long polling complica o roteamento. WebSocket é bidirecional e persistente."],
    ["Como rotear entre servidores?", "Registro user_id → [servidores] no Redis, atualizado na conexão; pub/sub ou fila por servidor."],
    ["Ordem e IDs?", "message_id por canal (sequência ou Snowflake); processar cada canal numa partição (Kafka key = channel_id); o cliente ordena por id."],
    ["Multi-dispositivo?", "Cada dispositivo mantém cur_max_message_id e sincroniza ao reconectar."],
    ["Presença?", "Heartbeat a cada 5 s, offline após 30 s; fanout só para amigos online; sob demanda em grupos grandes."],
  ],
  curve: [
    ["Grupos de 100 mil membros.", "Não copiar por membro: guardar uma vez por canal e entregar via fanout para membros online (pub/sub por canal); os offline fazem pull ao abrir."],
    ["Um chat server morre com 100 mil conexões.", "Clientes reconectam com backoff + jitter a outro servidor; sincronizam pelo cursor; nada se perde porque a persistência veio antes da entrega."],
    ["Adicionar status de leitura (✓✓).", "Eventos delivered/read enviados pelo mesmo canal; guardar o último lido por (usuário, canal), não por mensagem."],
  ],
  rubric: ["Justifiquei o WebSocket", "Separei stateless × stateful", "Escolhi o storage de mensagens com chave de partição", "Resolvi o roteamento entre servidores", "Multi-dispositivo e presença"],
},
{
  id: "autocomplete", title: "Autocomplete de busca", level: "medium", source: "livro", chapter: "13-autocomplete.html",
  prompt: "Projete o autocomplete da caixa de busca.",
  clarify: [
    ["Casamento?", "Só prefixo."],
    ["Quantas sugestões?", "5, por popularidade."],
    ["Escala?", "10 M DAU."],
    ["Atualização?", "Pode ser semanal (depois pergunte sobre tendências)."],
  ],
  req: `<ul><li>Top 5 por prefixo, ordenadas por frequência.</li><li>&lt; 100 ms, alta disponibilidade, escalável.</li></ul>`,
  est: `<p>10 M × 10 buscas × 20 teclas = 2 bi req/dia ≈ 24 mil QPS (pico ~48 mil).</p>`,
  api: `<p><code>GET /v1/suggest?q=be → ["best","bet","bee",...]</code> com <code>Cache-Control: private, max-age=3600</code>.</p>`,
  hld: `<p>Consulta: API → trie cache (memória) → trie DB. Coleta: logs → agregação (batch semanal) → workers constroem a trie → trie DB → recarga do cache.</p>`,
  diagram: `flowchart LR
  C[Cliente: debounce + cache] --> API[Query service] --> TC[(Trie cache)] --> TDB[(Trie DB)]
  L[Logs] --> AG[Agregação] --> W[Workers] --> TDB`,
  deep: [
    ["Como tornar a consulta rápida?", "Trie com top-k em cada nó e prefixo limitado: O(1)."],
    ["Como atualizar?", "Reconstruir periodicamente a partir dos dados agregados e trocar (blue/green); filtro para remoções urgentes."],
    ["Como escalar?", "Shard por prefixo com shard map baseado na distribuição real; réplicas de leitura."],
  ],
  curve: [
    ["Tendências em tempo real.", "Stream (Kafka + Flink), janelas curtas, Count-Min Sketch + heap, mescla com a trie histórica."],
    ["Personalização.", "Mesclar o top global com o histórico do usuário no cliente ou num serviço separado."],
  ],
  rubric: ["Trie com top-k por nó", "Pipeline de dados separado da consulta", "Cache no navegador e debounce", "Sharding com distribuição real"],
},
{
  id: "youtube", title: "YouTube / Netflix", level: "hard", source: "livro", chapter: "14-youtube.html",
  prompt: "Projete o YouTube.",
  clarify: [
    ["Funcionalidades?", "Upload e assistir. Busca e recomendação fora do escopo."],
    ["Escala?", "5 M DAU, 5 vídeos/dia; 10% fazem upload diário."],
    ["Tamanho máximo?", "1 GB."],
    ["Cloud?", "Pode usar CDN e blob storage."],
    ["Dispositivos?", "Mobile, web, TV."],
  ],
  req: `<ul><li><b>Funcionais:</b> upload, transcodificação, streaming com troca de qualidade.</li><li><b>Não funcionais:</b> upload rápido e retomável, playback suave, baixo custo, alta disponibilidade.</li></ul>`,
  est: `<p>Upload: 500 mil vídeos/dia × 300 MB = 150 TB/dia. CDN: 25 M views × 0,3 GB × US$ 0,02 = US$ 150 mil/dia. Custo é o tema!</p>`,
  api: `<p><code>POST /videos → {video_id, presigned_urls[]}</code>; upload multipart direto ao S3; <code>POST /videos/{id}/complete</code>; <code>GET /videos/{id} → {manifest_url}</code>.</p>`,
  hld: `<p>Upload → original storage → transcoding (DAG) → transcoded storage → CDN; completion queue atualiza os metadados (MySQL/Vitess + cache). Playback: manifest HLS/DASH → segmentos via CDN.</p>`,
  diagram: `flowchart LR
  C[Cliente] -->|presigned| OS[(S3 original)] --> TR[Transcoding DAG] --> TS[(S3 transcoded)] --> CDN[CDN]
  C --> API[API] --> MDB[(Metadados)]
  TR --> Q[[Completion queue]] --> API
  C -->|HLS/DASH| CDN`,
  deep: [
    ["Pipeline de transcodificação?", "Dividir em GOPs, DAG de tarefas (vídeo em N resoluções, áudio, thumbnails, watermark) em paralelo, workers escaláveis, orquestração com retries."],
    ["Streaming?", "Adaptive bitrate: segmentos de 2–6 s em várias qualidades, manifest; o player escolhe conforme a banda."],
    ["Custo?", "CDN só para os populares, cauda longa da origem; menos resoluções para pouco vistos; encode sob demanda; codecs eficientes nos populares; caches nos ISPs."],
  ],
  curve: [
    ["Live streaming.", "Ingest RTMP/SRT → transcodificação em tempo real → segmentos curtos (LL-HLS) → CDN; latência × estabilidade."],
    ["Contagem de views em tempo real com 1 M views/s num vídeo viral.", "Agregar em memória/stream e gravar em lote; contadores sharded; números aproximados."],
  ],
  rubric: ["Upload direto ao storage (presigned/multipart)", "DAG de transcodificação", "Adaptive bitrate", "Otimização de custo da CDN"],
},
{
  id: "google-drive", title: "Google Drive / Dropbox", level: "hard", source: "livro", chapter: "15-google-drive.html",
  prompt: "Projete o Google Drive.",
  clarify: [
    ["Funcionalidades?", "Upload, download, sync entre dispositivos, histórico de versões, compartilhamento, notificações."],
    ["Tamanho máximo?", "10 GB."],
    ["Escala?", "50 M usuários, 10 M DAU, 10 GB grátis."],
    ["Edição colaborativa?", "Fora do escopo."],
  ],
  req: `<ul><li><b>Funcionais:</b> upload/download, sync, versões, compartilhamento.</li><li><b>Não funcionais:</b> nunca perder dados, sync rápido, economia de banda, consistência forte nos metadados.</li></ul>`,
  est: `<p>500 PB alocados; ~240 uploads/s (pico 480).</p>`,
  api: `<p><code>POST /files/upload?uploadType=resumable</code>, <code>GET /files/download?path=</code>, <code>GET /files/list_revisions</code>. Metadados: file, file_version, block(hash, order).</p>`,
  hld: `<p>Cliente divide em blocos → block servers (compressão, criptografia) → S3; API servers + metadata DB (SQL) + cache; notification service com long polling; fila offline.</p>`,
  diagram: `flowchart LR
  C[Cliente] --> BS[Block servers] --> S3[(S3)]
  C --> API[API] --> MDB[(Metadata SQL)]
  API --> N[Notificação long polling] --> C`,
  deep: [
    ["Como economizar banda?", "Blocos com hash, delta sync, compressão, dedup; content-defined chunking para inserções."],
    ["Consistência?", "Metadados em SQL com ACID; blocos imutáveis endereçados por hash."],
    ["Conflitos?", "Versão base + lock otimista; quem chega primeiro vence; o outro gera cópia em conflito."],
    ["Notificação?", "Long polling (unidirecional, pouco frequente)."],
  ],
  curve: [
    ["Compartilhar uma pasta com 10 mil pessoas.", "ACL na pasta (herança), notificar via fila assíncrona, não copiar dados: só metadados de acesso."],
    ["Armazenamento cresce demais.", "Dedup global, limite de versões, cold storage, compressão."],
  ],
  rubric: ["Blocos + delta sync + dedup", "Metadados fortemente consistentes", "Resolução de conflitos", "Long polling justificado"],
},
// ---------------------------------------------------------------- EXTRAS
{
  id: "uber", title: "Uber / ride sharing", level: "hard", source: "extra",
  prompt: "Projete o Uber: passageiros pedem corrida e são pareados com motoristas próximos.",
  clarify: [
    ["Escopo?", "Pedir corrida, estimar preço, parear com motorista, acompanhar em tempo real. Pagamento fora."],
    ["Escala?", "10 M corridas/dia; 1 M motoristas ativos simultâneos."],
    ["Frequência de localização?", "Motoristas enviam a cada 4 s."],
    ["Um motorista pode receber duas corridas ao mesmo tempo?", "Não."],
  ],
  req: `<ul><li><b>Funcionais:</b> estimativa; pedir; matching com o motorista mais próximo disponível; aceitar/recusar; tracking ao vivo.</li><li><b>Não funcionais:</b> matching em &lt; 1 min; consistência no matching (1 motorista = 1 corrida); alta vazão de localização; baixa latência.</li></ul>`,
  est: `<p>Localização: 1 M / 4 s = <b>250 mil atualizações/s</b>, que não cabem num banco relacional comum e pedem um store em memória. Corridas: 10 M/dia ≈ 120/s (pico ~1 mil).</p>`,
  api: `<p><code>POST /fare → {fare_id, price, eta}</code>; <code>POST /rides {fare_id} → ride</code>; <code>POST /drivers/location {lat, lng}</code>; <code>PATCH /rides/{id} {accept|decline}</code>; WebSocket/push para atualizações.</p>`,
  hld: `<p>Location service: motoristas → Redis GEO (ou índice geohash/quadtree em memória). Ride service (Postgres) + matching service: busca motoristas próximos, oferece a um por vez com timeout (10 s), lock distribuído no motorista. Notificação via push/WebSocket.</p>`,
  diagram: `flowchart LR
  D[App motorista] -->|loc a cada 4s| LS[Location service] --> RG[(Redis GEO)]
  P[App passageiro] --> RS[Ride service] --> DB[(Postgres)]
  RS --> MS[Matching service] --> RG
  MS -->|lock motorista| LK[(Redis lock TTL)]
  MS -->|oferta| N[Push/WebSocket] --> D`,
  deep: [
    ["Como indexar 250 mil updates/s e buscar por proximidade?", "Redis GEOADD/GEOSEARCH (geohash em sorted set), particionado por região/cidade; ou índice em memória por célula geohash/H3. Não persistir cada ponto no banco principal; o histórico vai para Kafka/analytics."],
    ["Como garantir que um motorista não receba duas corridas?", "Lock com TTL (SET driver:123 ride NX PX 10000) enquanto a oferta está pendente; o matching ignora motoristas bloqueados; confirmar com update condicional no banco."],
    ["E se o motorista não responder?", "Timeout de 10 s → próxima oferta. Orquestração durável (Temporal ou fila com delay) para sobreviver a crashes do matching."],
    ["Picos (show acabou, 50 mil pedidos na mesma área)?", "Fila de pedidos por região; surge pricing; escalar matching por região (sharding geográfico)."],
  ],
  curve: [
    ["Como reduzir a frequência de localização sem perder precisão?", "Envio adaptativo: menos frequente parado ou em corrida em linha reta; mais frequente perto do embarque; dead reckoning no cliente."],
    ["O matching service caiu no meio de uma oferta.", "Estado da oferta persistido (workflow durável); locks com TTL expiram; outra instância retoma."],
  ],
  rubric: ["Calculei a vazão de localização e escolhi um store em memória", "Índice geoespacial (geohash/quadtree/H3)", "Consistência no matching (lock/condicional)", "Timeout e retentativa de ofertas"],
},
{
  id: "ticketmaster", title: "Ticketmaster (venda de ingressos)", level: "hard", source: "extra",
  prompt: "Projete um sistema de venda de ingressos para shows, como o Ticketmaster.",
  clarify: [
    ["Funcionalidades?", "Ver eventos, buscar, ver o mapa de assentos, reservar e comprar."],
    ["Escala?", "100 M DAU de navegação; shows populares com 10 M pessoas querendo 50 mil ingressos ao mesmo tempo."],
    ["Assento marcado?", "Sim."],
    ["Quanto tempo segurar um assento?", "10 minutos para pagar."],
  ],
  req: `<ul><li><b>Funcionais:</b> ver evento, reservar assento temporariamente, comprar.</li><li><b>Não funcionais:</b> <b>sem venda dupla</b> (consistência forte na reserva); alta disponibilidade na navegação; sobreviver a picos extremos; justiça.</li></ul>`,
  est: `<p>Leitura: navegação massiva, que pede cache e CDN. Escrita: 50 mil ingressos — o problema não é volume, é contenção: 10 M pessoas disputando os mesmos registros.</p>`,
  api: `<p><code>GET /events/{id}</code>, <code>GET /events/{id}/seats</code>, <code>POST /bookings {event_id, seat_ids} → reserved (expires_at)</code>, <code>POST /bookings/{id}/confirm {payment}</code>.</p><p>tickets(id, event_id, seat, status AVAILABLE|RESERVED|SOLD, reserved_until, booking_id) no Postgres.</p>`,
  hld: `<p>Event service (leitura, cache + CDN), Search (Elasticsearch), Booking service (Postgres, transações), lock de reserva (Redis TTL ou coluna reserved_until), pagamento (Stripe com idempotency key), <b>fila virtual</b> (waiting room) para eventos quentes.</p>`,
  diagram: `flowchart LR
  U[Usuários] --> CDN[CDN] --> WR[Waiting room / fila virtual]
  WR --> BS[Booking service] --> DB[(Postgres)]
  BS --> RL[(Redis: reservas TTL)]
  BS --> PAY[Pagamento]
  U --> ES[Event + search service] --> C[(Cache)]`,
  deep: [
    ["Como impedir que dois usuários reservem o mesmo assento?", "UPDATE tickets SET status='RESERVED', booking_id=? , reserved_until=now()+10min WHERE id=? AND (status='AVAILABLE' OR reserved_until < now()) — atômico; quem afetar 0 linhas perdeu. Ou lock distribuído com TTL no Redis + confirmação no banco."],
    ["Como expirar reservas?", "reserved_until no próprio registro (expiração lazy na consulta) + job de limpeza; ou TTL no Redis. Evitar depender só de cron."],
    ["Como sobreviver a 10 M usuários no mesmo segundo?", "Fila virtual: admitir usuários ao booking em lotes controlados (token assinado de admissão), o resto vê a posição via SSE/WebSocket; páginas estáticas na CDN."],
    ["Mapa de assentos em tempo real?", "Cache do estado com atualização por SSE para quem está admitido; aceitar leve atraso e falhar com elegância na reserva."],
  ],
  curve: [
    ["O pagamento confirmou, mas a reserva expirou um segundo antes.", "Verificação condicional no confirm (booking_id ainda dono do assento); se perdeu, estorno automático via idempotency key; ou estender a reserva enquanto o pagamento estiver em andamento."],
    ["Bots compram tudo.", "CAPTCHA na entrada da fila, rate limit por conta/cartão/dispositivo, verificação de identidade em eventos de alta demanda, limite de ingressos por pessoa."],
  ],
  rubric: ["Consistência forte na reserva (sem venda dupla)", "Reserva temporária com expiração", "Fila virtual para o pico", "Separação leitura (cache) × escrita (transacional)"],
},
{
  id: "payments", title: "Sistema de pagamentos", level: "hard", source: "extra",
  prompt: "Projete o backend de pagamentos de um e-commerce (integra com Stripe/Adyen).",
  clarify: [
    ["Escopo?", "Pay-in (cliente paga), pay-out para vendedores e reconciliação."],
    ["Volume?", "1 M transações/dia."],
    ["Processamos cartão diretamente?", "Não, via PSP (Stripe). Não guardamos dados de cartão."],
    ["Requisitos?", "Nunca cobrar duas vezes, nunca perder um pagamento, auditável."],
  ],
  req: `<ul><li><b>Funcionais:</b> criar pagamento, cobrar via PSP, registrar no ledger, pagar vendedores, reconciliar.</li><li><b>Não funcionais:</b> exatidão &gt; latência; idempotência ponta a ponta; auditabilidade (ledger imutável); PCI (dados de cartão só no PSP).</li></ul>`,
  est: `<p>1 M/dia ≈ 12 TPS: volume baixo. O desafio é a correção, não a escala.</p>`,
  api: `<p><code>POST /v1/payments</code> com header <code>Idempotency-Key</code>; <code>GET /v1/payments/{id}</code>; webhook <code>POST /psp/webhook</code>.</p><p>payment_order(id, idempotency_key UNIQUE, status), ledger_entries(id, account, debit, credit, payment_id) — double-entry, append-only.</p>`,
  hld: `<p>Payment service (Postgres) → PSP (página hospedada/tokenização) → webhook de confirmação → ledger (double-entry) → wallet do vendedor; outbox → Kafka para outros serviços; job diário de reconciliação com o arquivo de liquidação do PSP.</p>`,
  diagram: `flowchart LR
  C[Checkout] -->|Idempotency-Key| PS[Payment service] --> DB[(Postgres: payment + outbox)]
  PS --> PSP[Stripe]
  PSP -->|webhook| PS
  PS --> LG[(Ledger double-entry)]
  DB -->|outbox/CDC| K[[Kafka]] --> W[Wallet/notificações]
  REC[Reconciliação diária] --> LG
  REC --> PSP`,
  deep: [
    ["Como evitar cobrança dupla?", "Idempotency key do cliente → UNIQUE no payment_order; a mesma chave devolve o mesmo resultado; repassar idempotency key ao PSP."],
    ["Timeout ao chamar o PSP: cobrou ou não?", "Estado UNKNOWN; consultar o PSP pelo ID/idempotency; o webhook é a fonte de verdade; retry com a mesma chave é seguro."],
    ["Por que ledger double-entry?", "Cada movimento tem débito e crédito que somam zero; imutável (correções são novos lançamentos); auditável e detecta inconsistências."],
    ["Reconciliação?", "Comparar diariamente o ledger com os relatórios de liquidação do PSP; discrepâncias vão para uma fila de correção manual/automática."],
  ],
  curve: [
    ["O webhook chegou duas vezes e fora de ordem.", "Processamento idempotente pelo event_id; máquina de estados que só aceita transições válidas."],
    ["Precisamos dividir o pagamento entre 3 vendedores e uma taxa.", "Lançamentos múltiplos no ledger numa única transação; pay-out assíncrono por vendedor."],
  ],
  rubric: ["Idempotência ponta a ponta", "Tratamento de estado desconhecido/timeouts", "Ledger double-entry imutável", "Reconciliação", "Outbox para eventos"],
},
{
  id: "leaderboard", title: "Leaderboard de jogo em tempo real", level: "medium", source: "extra",
  prompt: "Projete o ranking em tempo real de um jogo mobile.",
  clarify: [
    ["Escala?", "5 M DAU, 25 M MAU."],
    ["Como pontua?", "Cada partida vencida soma pontos; ranking mensal."],
    ["O que mostrar?", "Top 10 e a posição do usuário (com vizinhos)."],
    ["Tempo real?", "Sim."],
  ],
  req: `<ul><li>Atualizar score; top 10; rank do usuário ± 4 posições.</li><li>Tempo real, alta disponibilidade, reset mensal.</li></ul>`,
  est: `<p>5 M × 10 partidas/dia ≈ 500 updates/s (pico ~2,5 mil). 25 M membros × ~50 B ≈ 1,2 GB por mês num sorted set.</p>`,
  api: `<p><code>POST /v1/scores {user_id, points}</code> (servidor de jogo, nunca o cliente); <code>GET /v1/leaderboard/top?n=10</code>; <code>GET /v1/leaderboard/{user}</code>.</p>`,
  hld: `<p>Game service valida a vitória → leaderboard service → Redis sorted set <code>lb:2026-11</code> (ZINCRBY, ZREVRANGE, ZREVRANK) + persistência em banco (MySQL/DynamoDB) para recuperação e histórico.</p>`,
  diagram: `flowchart LR
  G[Game service] --> LS[Leaderboard service] --> R[(Redis ZSET por mês)]
  LS --> DB[(DB: histórico de pontos)]
  APP[App] --> LS`,
  deep: [
    ["Por que não SQL com ORDER BY?", "Rank de um usuário exige contar quantos têm score maior: varredura O(N) a cada leitura. O sorted set (skip list) faz isso em O(log N)."],
    ["Durabilidade?", "Redis com AOF + réplica; banco como fonte da verdade dos eventos; dá para reconstruir o ZSET."],
    ["Empates?", "Score composto: pontos e timestamp (quem chegou antes vence), ex.: pontos × 10^10 + (MAX_TS − ts)."],
  ],
  curve: [
    ["500 M usuários: não cabe num nó.", "Sharding por faixa de score (cada shard com uma faixa; o rank = soma dos tamanhos dos shards acima + rank local) ou por hash com scatter-gather para o top 10; rank aproximado para usuários de baixa posição."],
    ["Ranking por país e por amigos.", "ZSETs por país; ranking de amigos calculado sob demanda (ZSCORE dos amigos) por ser pequeno."],
  ],
  rubric: ["Escolhi o sorted set e expliquei a complexidade", "Score atualizado só pelo servidor", "Persistência e recuperação", "Estratégia para escalar além de 1 nó"],
},
{
  id: "proximity", title: "Serviço de proximidade (Yelp)", level: "medium", source: "extra",
  prompt: "Projete o \"lugares perto de mim\" do Yelp/Google Maps.",
  clarify: [
    ["Funcionalidades?", "Buscar negócios num raio; ver detalhes; donos cadastram e editam."],
    ["Escala?", "100 M DAU, 200 M negócios."],
    ["Edições aparecem na hora?", "Podem levar até o dia seguinte."],
    ["Raio?", "0,5 a 20 km."],
  ],
  req: `<ul><li>Busca por raio com filtros; detalhes do negócio; CRUD de negócios.</li><li>Baixa latência, alta disponibilidade, read-heavy (5 buscas/usuário/dia ≈ 5 mil QPS).</li></ul>`,
  est: `<p>5 mil QPS de busca (pico 15 mil); 200 M negócios × 1 KB = 200 GB de dados; o índice geoespacial (id, lat, lng) cabe em memória (~200 M × 24 B ≈ 5 GB).</p>`,
  api: `<p><code>GET /v1/search/nearby?lat=&amp;lng=&amp;radius=&amp;category=</code>, <code>GET /v1/businesses/{id}</code>, <code>POST/PUT/DELETE /v1/businesses</code>.</p>`,
  hld: `<p>LBS (location-based service, stateless, read-only) com índice geoespacial em memória/Redis + business service (CRUD) com Postgres primário e réplicas; o índice é reconstruído ou atualizado em lote diariamente; cache dos detalhes.</p>`,
  diagram: `flowchart LR
  U[Usuário] --> LB[LB]
  LB -->|/search/nearby| LBS[LBS: índice geo em memória]
  LB -->|/businesses| BS[Business service] --> DB[(Postgres + réplicas)]
  DB -->|job diário| LBS
  BS --> C[(Cache)]`,
  deep: [
    ["Como indexar por localização?", "Geohash (prefixo = célula; buscar a célula e as 8 vizinhas; precisão escolhida pelo raio), quadtree (divisão adaptativa por densidade, em memória) ou Google S2/H3. Também PostGIS ou Redis GEO."],
    ["Geohash: problema de borda?", "Pontos próximos em células diferentes; por isso consultar as 8 vizinhas. Prefixos comuns longos não garantem proximidade perto do meridiano/equador."],
    ["Poucos resultados no raio?", "Aumentar o raio progressivamente (reduzir a precisão do geohash)."],
  ],
  curve: [
    ["Agora os objetos se movem (motoristas, amigos).", "Atualização frequente: Redis GEO particionado por região, ou células H3 com pub/sub por célula."],
    ["Ordenar por relevância e avaliação, não só distância.", "Buscar candidatos geoespaciais e reordenar com score (distância, nota, popularidade); ou Elasticsearch com geo_distance + function_score."],
  ],
  rubric: ["Comparei geohash × quadtree (× S2/H3)", "Tratei as células vizinhas", "Separei a busca (read-heavy) do CRUD", "Estimei o índice em memória"],
},
{
  id: "top-k", title: "Top-K / trending (heavy hitters)", level: "hard", source: "extra",
  prompt: "Projete um serviço que mostre as 100 músicas mais tocadas na última hora, no dia e na semana.",
  clarify: [
    ["Volume?", "10 bilhões de plays por dia."],
    ["Exatidão?", "Aproximado é aceitável na última hora; exato no relatório diário."],
    ["Latência para refletir?", "Em até 1 minuto."],
  ],
  req: `<ul><li>Top K por janela (1 h, 1 d, 1 sem), por região.</li><li>Atualização em ~1 min; leitura rápida; escala de 10 bi eventos/dia.</li></ul>`,
  est: `<p>10 bi/dia ≈ 115 mil eventos/s (pico ~300 mil). Contar exato por música e por minuto com dezenas de milhões de músicas é caro: daí a aproximação.</p>`,
  api: `<p><code>GET /v1/top?window=1h&amp;k=100&amp;region=BR</code>.</p>`,
  hld: `<p>Eventos → Kafka (particionado) → stream processors (Flink) com Count-Min Sketch + heap por partição e janela → merge dos top-k parciais → store de resultados (Redis) → API. Caminho batch (Spark) para o resultado exato diário (arquitetura lambda).</p>`,
  diagram: `flowchart LR
  P[Players] --> K[[Kafka]] --> F[Flink: CMS + heap por janela] --> M[Merge top-k] --> R[(Redis: resultados)] --> API[API]
  K --> S3[(Data lake)] --> SP[Spark batch exato] --> R`,
  deep: [
    ["Como contar com memória fixa?", "Count-Min Sketch (d × w contadores, superestima, erro controlado) + min-heap de tamanho K com os candidatos."],
    ["Como mesclar resultados de várias partições?", "Particionar por song_id permite somar sem duplicar; o merge de top-k parciais é exato se cada música está numa única partição."],
    ["Janelas deslizantes?", "Buckets de 1 min; a janela de 1 h soma 60 buckets (e subtrai o que sai); janelas maiores usam buckets maiores."],
  ],
  curve: [
    ["Uma música recebe 30% dos eventos (hot partition).", "Pré-agregação local (combiner) antes do Kafka; sub-chaves com sufixo e merge posterior."],
    ["Precisamos de exatidão por hora também.", "Contagem exata em batch micro (a cada 5 min) num OLAP (ClickHouse/Druid) com rollups."],
  ],
  rubric: ["Streaming com janelas", "Estrutura probabilística (CMS) + heap", "Particionamento e merge correto", "Caminho exato × aproximado (lambda/kappa)"],
},
{
  id: "metrics", title: "Monitoramento e métricas (Datadog)", level: "hard", source: "extra",
  prompt: "Projete um sistema de coleta de métricas e alertas para 100 mil servidores.",
  clarify: [
    ["Que métricas?", "Operacionais: CPU, memória, latência, QPS. Não logs."],
    ["Escala?", "100 mil servidores × 100 métricas a cada 10 s."],
    ["Retenção?", "Bruto 7 dias, 1 min por 30 dias, 1 h por 1 ano."],
    ["Alertas?", "Sim: e-mail, PagerDuty, webhooks."],
  ],
  req: `<ul><li>Coletar, armazenar séries temporais, consultar para dashboards, alertar.</li><li>Ingestão massiva, consultas rápidas em dados recentes, downsampling, alta disponibilidade.</li></ul>`,
  est: `<p>100 mil × 100 / 10 s = <b>1 M pontos/s</b>. Ponto comprimido (Gorilla) ≈ 1,4 B; ~1,4 MB/s, ~120 GB/dia bruto.</p>`,
  api: `<p>Ingestão: agentes enviam lotes (push) ou o sistema faz scrape (pull, Prometheus). Consulta: PromQL-like <code>avg(cpu{service="api"}) by (host)[5m]</code>.</p>`,
  hld: `<p>Agentes → Kafka (buffer) → consumidores gravam numa TSDB (sharding por série) → query service + cache → dashboards (Grafana); alert manager avalia regras periodicamente e notifica com dedup.</p>`,
  diagram: `flowchart LR
  A[Agentes] --> K[[Kafka]] --> W[Writers] --> TS[(TSDB: sharded por série)]
  TS --> Q[Query service] --> G[Dashboards]
  AM[Alert manager] --> Q
  AM --> N[PagerDuty/e-mail]
  TS --> DS[Downsampling jobs] --> TS`,
  deep: [
    ["Push ou pull?", "Pull (Prometheus): controle central, detecta alvos mortos; difícil atrás de firewalls e com jobs efêmeros. Push: bom para serverless e grandes escalas, precisa de autenticação e controle de carga."],
    ["Por que TSDB e não SQL?", "Escrita append-only, compressão delta-of-delta e XOR (Gorilla), consultas por série e janela, downsampling nativo."],
    ["Cardinalidade?", "Cada combinação de labels é uma série: labels com user_id explodem o índice; limitar e alertar."],
    ["Alertas confiáveis?", "Avaliação periódica, estado por alerta (pending → firing), dedup e agrupamento, silenciamento, alta disponibilidade do avaliador."],
  ],
  curve: [
    ["O sistema de monitoramento cai junto com o incidente.", "Isolamento: infraestrutura separada, multi-região; meta-monitoramento (alguém vigia o vigia)."],
    ["Consultas de 1 ano estão lentas.", "Usar rollups pré-agregados; armazenamento frio em object storage (Thanos/Cortex/Mimir)."],
  ],
  rubric: ["Estimei 1 M pontos/s", "TSDB + compressão + downsampling", "Push × pull", "Pipeline de alertas e cardinalidade"],
},
{
  id: "message-queue", title: "Fila de mensagens distribuída (Kafka)", level: "hard", source: "extra",
  prompt: "Projete uma fila de mensagens distribuída como o Kafka.",
  clarify: [
    ["Modelo?", "Pub/sub com tópicos; consumidores em grupos; mensagens retidas por dias (replay)."],
    ["Ordem?", "Por chave."],
    ["Garantias?", "Configuráveis: at-most-once, at-least-once."],
    ["Escala?", "Milhões de mensagens/s, mensagens de ~1 KB."],
  ],
  req: `<ul><li>Produzir e consumir, tópicos particionados, consumer groups, retenção, replay.</li><li>Alta vazão, durabilidade (replicação), ordem por partição, escala horizontal.</li></ul>`,
  est: `<p>1 M msg/s × 1 KB = 1 GB/s; × 3 réplicas = 3 GB/s de escrita no cluster; 7 dias = ~600 TB (× 3).</p>`,
  api: `<p><code>produce(topic, key, value) → offset</code>; <code>poll(group, topic) → batch</code>; <code>commit(group, partition, offset)</code>.</p>`,
  hld: `<p>Tópico → partições → cada partição é um log append-only segmentado em disco, replicado (líder + seguidores, ISR). Produtores escolhem a partição por hash(key). Consumer groups atribuem partições aos consumidores e guardam offsets. Metadados e eleição via controlador (Raft/KRaft).</p>`,
  diagram: `flowchart LR
  P[Produtores] -->|hash key| B1[Broker 1: P0 líder, P1 réplica]
  P --> B2[Broker 2: P1 líder, P0 réplica]
  B1 <--> B2
  B1 & B2 --> CG[Consumer group: offsets]
  CTL[Controlador KRaft] -.-> B1 & B2`,
  deep: [
    ["Por que é tão rápido?", "Escrita sequencial em log, page cache do SO, zero-copy (sendfile), batching e compressão em lote."],
    ["Durabilidade?", "Replicação para ISR; acks=all + min.insync.replicas=2; o líder só confirma quando as réplicas sincronizadas têm a mensagem."],
    ["Consumer groups?", "Cada partição pertence a um consumidor do grupo; rebalance quando entram ou saem; o paralelismo máximo é o número de partições."],
    ["Exactly-once?", "Produtor idempotente (PID + sequência) + transações; para efeitos externos, consumidor idempotente."],
  ],
  curve: [
    ["Precisamos de mensagens com atraso (delay de 30 min).", "Tópicos por faixa de atraso + scheduler, ou um store de timers (por exemplo, timing wheel) que publica na hora certa."],
    ["Um consumidor lento atrasa a partição inteira.", "Mais partições/consumidores; processamento paralelo por chave dentro do consumidor; DLQ para mensagens problemáticas."],
  ],
  rubric: ["Log particionado e replicado", "Ordem por partição e escolha de chave", "Consumer groups e offsets", "Garantias de entrega"],
},
{
  id: "hotel", title: "Reserva de hotéis (Booking)", level: "medium", source: "extra",
  prompt: "Projete o sistema de reservas de uma rede de hotéis.",
  clarify: [
    ["Escala?", "5 mil hotéis, 1 M quartos."],
    ["Reserva por quarto específico ou por tipo?", "Por tipo de quarto."],
    ["Overbooking?", "Permitido até 10%."],
    ["Pagamento?", "Na reserva."],
  ],
  req: `<ul><li>Ver hotéis e quartos, consultar disponibilidade por data, reservar, cancelar.</li><li>Sem reserva dupla além do overbooking permitido, consistência forte no inventário, latência moderada.</li></ul>`,
  est: `<p>1 M quartos × 70% ocupação / 3 dias de estadia ≈ 240 mil reservas/dia ≈ 3 TPS. Baixo volume, mas a correção é crítica.</p>`,
  api: `<p><code>GET /hotels/{id}/availability?from=&amp;to=</code>, <code>POST /reservations {hotel, room_type, from, to, reservation_id}</code> (idempotente), <code>DELETE /reservations/{id}</code>.</p><p>room_type_inventory(hotel_id, room_type_id, date, total, reserved) — PK (hotel, type, date).</p>`,
  hld: `<p>Hotel service (cache), rate service, reservation service com Postgres; inventário por dia; transação que verifica e incrementa todas as datas; pagamento; microsserviços com saga se separados.</p>`,
  diagram: `flowchart LR
  U[Usuário] --> GW[API gateway]
  GW --> HS[Hotel service] --> C[(Cache)]
  GW --> RS[Reservation service] --> DB[(Postgres: inventário por data)]
  RS --> PAY[Pagamento]`,
  deep: [
    ["Como evitar reserva dupla?", "Numa transação: para cada data, UPDATE inventory SET reserved = reserved + 1 WHERE ... AND reserved + 1 <= total * 1.1; se alguma afetar 0 linhas, rollback. Ou lock otimista com versão."],
    ["Clique duplo no botão reservar?", "reservation_id gerado no cliente como chave de idempotência (UNIQUE)."],
    ["Escalar o inventário?", "Shard por hotel_id (as transações ficam num shard); cache de disponibilidade apenas para exibição, sempre validando no banco."],
  ],
  curve: [
    ["Reserva e pagamento em serviços diferentes.", "Saga: reservar (pendente) → cobrar → confirmar; compensar liberando o inventário se a cobrança falhar."],
    ["Agências parceiras consultam disponibilidade 1000×/s.", "Cache de disponibilidade com TTL curto e CDC; rate limit por parceiro."],
  ],
  rubric: ["Modelo de inventário por data", "Concorrência resolvida no banco", "Idempotência", "Saga se houver vários serviços"],
},
{
  id: "google-docs", title: "Edição colaborativa (Google Docs)", level: "hard", source: "extra",
  prompt: "Projete um editor de documentos colaborativo em tempo real.",
  clarify: [
    ["Quantos editores simultâneos por documento?", "Até ~100."],
    ["Funcionalidades?", "Edição de texto concorrente, cursores dos outros, histórico de versões."],
    ["Offline?", "Desejável."],
    ["Escala?", "Milhões de documentos, a maioria inativa."],
  ],
  req: `<ul><li>Edições concorrentes que convergem, presença/cursores, persistência e histórico.</li><li>Latência &lt; 100 ms para ver edições dos outros, sem perder edições.</li></ul>`,
  est: `<p>Edições são pequenas (poucos bytes) mas frequentes: 100 editores × 5 ops/s = 500 ops/s num documento quente.</p>`,
  api: `<p>WebSocket por documento: <code>op {doc_id, base_version, operation}</code> → <code>ack {version}</code> / broadcast. HTTP para abrir, listar, compartilhar.</p>`,
  hld: `<p>Cada documento ativo é "dono" de um servidor de colaboração (roteamento por consistent hashing de doc_id). O servidor ordena as operações (OT) ou mescla (CRDT), faz broadcast via WebSocket, grava as operações num log (append) e snapshots periódicos.</p>`,
  diagram: `flowchart LR
  E1[Editor 1] <-->|WS| CS[Collab server do doc]
  E2[Editor 2] <-->|WS| CS
  CS --> OL[(Log de operações)]
  CS --> SN[(Snapshots: S3/DB)]
  R[Roteador: hash doc_id] --> CS`,
  deep: [
    ["OT ou CRDT?", "OT (Google Docs): servidor central transforma operações concorrentes; simples de raciocinar com servidor único por doc. CRDT (Figma usa ideias, Yjs/Automerge): converge sem coordenação, ótimo offline/P2P, com overhead de metadados."],
    ["Por que um servidor por documento?", "Serializa as operações sem locks distribuídos; o estado quente fica em memória. Precisa de failover: o novo dono reconstrói a partir de snapshot + log."],
    ["Persistência e histórico?", "Log de operações append-only + snapshots a cada N ops; versão = posição no log."],
  ],
  curve: [
    ["Usuário editou offline por 2 horas.", "Ao reconectar envia as ops com a base version; OT transforma contra as ops ocorridas; com CRDT, merge automático."],
    ["Documento com 10 mil leitores simultâneos (apresentação).", "Separar leitores (broadcast via pub/sub/fanout servers) de editores (servidor dono)."],
  ],
  rubric: ["Expliquei OT × CRDT", "Roteamento de um documento para um servidor", "Log de operações + snapshots", "Presença/cursores e offline"],
},
{
  id: "job-scheduler", title: "Job scheduler distribuído", level: "medium", source: "extra",
  prompt: "Projete um serviço que execute jobs agendados (cron) e jobs sob demanda em escala.",
  clarify: [
    ["Volume?", "10 M jobs/dia; alguns recorrentes (cron), outros únicos com horário."],
    ["Duração?", "Segundos a horas."],
    ["Garantias?", "Cada execução deve rodar pelo menos uma vez; idealmente uma vez."],
    ["Precisão do horário?", "Até alguns segundos de atraso."],
  ],
  req: `<ul><li>Criar job (cron ou horário), executar, retentar, ver status e logs, cancelar.</li><li>Escalável, tolerante a falhas, sem execuções perdidas, sem duplicação desnecessária.</li></ul>`,
  est: `<p>10 M/dia ≈ 115 execuções/s em média, com picos no início de cada hora (todo mundo agenda "0 * * * *").</p>`,
  api: `<p><code>POST /jobs {schedule|run_at, payload, retries, timeout}</code>, <code>GET /jobs/{id}/executions</code>, <code>DELETE /jobs/{id}</code>.</p><p>jobs(id, schedule, next_run_at, ...) com índice em next_run_at; executions(id, job_id, status, attempt).</p>`,
  hld: `<p>Scheduler (particionado) busca jobs com next_run_at ≤ agora + Δ, cria execuções e publica na fila; workers executam com lease/heartbeat; recalcula next_run_at. Eleição/partição via etcd.</p>`,
  diagram: `flowchart LR
  API[API] --> DB[(Jobs DB: índice next_run_at)]
  SC[Schedulers particionados] --> DB
  SC --> Q[[Fila]] --> W[Workers]
  W -->|heartbeat/status| DB
  SC -.->|leases| ETCD[(etcd)]`,
  deep: [
    ["Como evitar que dois schedulers disparem o mesmo job?", "Particionar jobs entre schedulers (hash do id, lease no etcd), ou SELECT ... FOR UPDATE SKIP LOCKED; execução com chave única (job_id, scheduled_time)."],
    ["Worker morreu no meio?", "Lease com heartbeat; expirou → execução volta para a fila (attempt + 1); jobs precisam ser idempotentes."],
    ["Pico no início da hora?", "Pré-carregar jobs um pouco antes (janela), jitter opcional, fila com escala automática de workers."],
  ],
  curve: [
    ["Jobs com dependências (DAG).", "Orquestrador de workflow (estilo Airflow/Temporal): estado por nó, dispara os filhos quando os pais concluem."],
    ["Um tenant agenda 1 M jobs no mesmo minuto.", "Quotas e filas por tenant (fairness), rate limit na criação."],
  ],
  rubric: ["Índice por próximo horário", "Evitar disparo duplicado", "Lease/heartbeat e retry", "Picos e fairness"],
},
{
  id: "ad-click", title: "Agregação de cliques em anúncios", level: "hard", source: "extra",
  prompt: "Projete o sistema que agrega cliques em anúncios para faturamento e dashboards.",
  clarify: [
    ["Volume?", "1 bilhão de cliques/dia."],
    ["Consultas?", "Cliques por anúncio no último minuto; top 100 anúncios por minuto; filtros por país e dispositivo."],
    ["Atraso aceitável?", "Poucos minutos para dashboards."],
    ["Exatidão?", "Precisa ser exato: é faturamento."],
  ],
  req: `<ul><li>Agregar por anúncio e minuto, com filtros; top N.</li><li>Exatidão (sem perder nem duplicar), tolerância a eventos atrasados, reprocessamento.</li></ul>`,
  est: `<p>1 bi/dia ≈ 10 mil/s (pico 50 mil). 0,1 KB por evento = 100 GB/dia bruto.</p>`,
  api: `<p><code>GET /v1/ads/{id}/aggregated_count?from=&amp;to=&amp;filter=</code>, <code>GET /v1/ads/popular?window=1m&amp;n=100</code>.</p>`,
  hld: `<p>Log servers → Kafka (bruto) → stream aggregation (Flink, janelas de 1 min por ad_id, watermark) → Kafka (agregado) → OLAP (ClickHouse/Druid) → query service. Bruto também no data lake para reconciliação e reprocessamento.</p>`,
  diagram: `flowchart LR
  L[Log servers] --> K1[[Kafka: bruto]] --> F[Flink: janelas 1 min]
  F --> K2[[Kafka: agregado]] --> DB[(ClickHouse)] --> Q[Query service]
  K1 --> LAKE[(Data lake)] --> REC[Reconciliação batch]`,
  deep: [
    ["Eventos atrasados?", "Event time + watermark (aceitar atraso de X min); eventos após o watermark corrigem via reprocessamento batch."],
    ["Exactly-once?", "Kafka transacional + checkpoints do Flink (offsets e estado salvos atomicamente); sink idempotente por (ad_id, minuto)."],
    ["Hot ad (um anúncio com muitos cliques)?", "Pré-agregação local, sub-chaves e merge."],
    ["Fraude/cliques duplicados?", "Dedup por click_id numa janela; filtros de bots antes da agregação."],
  ],
  curve: [
    ["Encontramos um bug na agregação de ontem.", "Reprocessar a partir do bruto no Kafka (retenção) ou no data lake (kappa/lambda) e sobrescrever as tabelas agregadas do período."],
  ],
  rubric: ["Stream processing com janelas e watermark", "Exactly-once / idempotência no sink", "Armazenamento bruto para reconciliação", "OLAP para consultas"],
},
{
  id: "distributed-cache", title: "Cache distribuído (como Redis/Memcached)", level: "medium", source: "extra",
  prompt: "Projete um cache distribuído em memória usado por centenas de serviços.",
  clarify: [
    ["Operações?", "get, set com TTL, delete."],
    ["Tamanho?", "10 TB de dados quentes."],
    ["Latência?", "p99 < 1 ms dentro do DC."],
    ["Durabilidade?", "Não é necessária (é cache), mas evitar perder tudo de uma vez."],
  ],
  req: `<ul><li>get/set/delete com TTL e evicção.</li><li>Latência sub-ms, alta vazão (milhões de ops/s), escala horizontal, alta disponibilidade.</li></ul>`,
  est: `<p>10 TB ÷ 64 GB úteis por nó ≈ 160 nós (+ réplicas). 5 M ops/s ÷ 160 = ~30 mil ops/s por nó: tranquilo.</p>`,
  api: `<p>Protocolo binário/texto sobre TCP: <code>GET k</code>, <code>SET k v EX ttl</code>, <code>DEL k</code>; cliente com conexão persistente e pipelining.</p>`,
  hld: `<p>Nós com hash table + lista LRU em memória; particionamento por consistent hashing (no cliente ou num proxy, como twemproxy/mcrouter); réplicas assíncronas para failover; configuração de cluster no etcd/ZooKeeper.</p>`,
  diagram: `flowchart LR
  S[Serviços + client lib: anel de hash] --> N1[(Nó 1 + réplica)]
  S --> N2[(Nó 2 + réplica)]
  S --> N3[(Nó N + réplica)]
  CFG[(etcd: membros)] -.-> S`,
  deep: [
    ["Estrutura de dados do nó?", "Hash map + lista duplamente ligada (LRU) para O(1); expiração preguiçosa + varredura amostral (como o Redis)."],
    ["Como distribuir?", "Consistent hashing com vnodes ou hash slots fixos (16384) com mapa explícito."],
    ["Nó caiu?", "Réplica promovida; sem réplica, as chaves daquele trecho viram misses (o banco precisa aguentar ~1/N extra)."],
    ["Hot keys?", "Cache local no cliente (L1) com TTL curto; replicar a chave em vários nós."],
  ],
  curve: [
    ["Cache stampede após um deploy que limpou o cache.", "Aquecer gradualmente; request coalescing (single-flight); TTL com jitter."],
    ["Consistência com o banco.", "Cache-aside com delete na escrita; para corrida de leitura antiga sobrescrevendo, usar versões ou lease (técnica do memcache do Facebook)."],
  ],
  rubric: ["LRU com O(1)", "Particionamento e failover", "Hot keys e stampede", "Consistência cache × banco"],
},
{
  id: "instagram", title: "Instagram (fotos + feed)", level: "medium", source: "extra",
  prompt: "Projete o Instagram: upload de fotos, seguir pessoas, feed e curtidas.",
  clarify: [
    ["Escopo?", "Postar foto com legenda, seguir, feed, curtir. Stories e DMs fora."],
    ["Escala?", "500 M DAU."],
    ["Feed?", "Cronológico."],
    ["Consistência?", "Eventual ok para o feed; upload não pode se perder."],
  ],
  req: `<ul><li>Upload de foto, follow, feed, curtir.</li><li>Feed &lt; 200 ms, alta disponibilidade, mídia durável.</li></ul>`,
  est: `<p>50 M posts/dia × 2 MB = 100 TB/dia de mídia (várias resoluções multiplicam). Feed: 500 M × 10 = 5 bi leituras/dia ≈ 60 mil/s.</p>`,
  api: `<p><code>POST /media/upload-url → presigned</code>, <code>POST /posts {media_id, caption}</code>, <code>GET /feed?cursor=</code>, <code>POST /posts/{id}/likes</code>.</p>`,
  hld: `<p>Upload direto ao S3 → processamento assíncrono (resize, filtros) → CDN. Posts em Cassandra/Postgres sharded; follows; feed híbrido (push/pull) em Redis; likes com contadores agregados.</p>`,
  diagram: `flowchart LR
  C[App] -->|presigned| S3[(S3)] --> IMG[Image workers] --> CDN[CDN]
  C --> API[API] --> PS[(Posts)]
  API --> FO[Fanout] --> FC[(Feed cache)]
  API --> LK[Likes: contadores]`,
  deep: [
    ["Mídia?", "Presigned URL + processamento assíncrono para múltiplas resoluções; CDN; metadados no banco."],
    ["Feed?", "Fanout híbrido, como no News feed."],
    ["Contador de likes em posts virais?", "Contadores sharded/em memória com flush periódico; números aproximados; a tabela de likes (user, post) para 'eu curti?'."],
  ],
  curve: [
    ["Um post de celebridade recebe 1 M likes/min.", "Buffer de incrementos (Redis/Kafka) e gravação em lote; mostrar contador aproximado; likes individuais gravados de forma assíncrona."],
  ],
  rubric: ["Upload via presigned + processamento assíncrono", "Feed híbrido", "Contadores em escala", "CDN e custo de mídia"],
},
];
