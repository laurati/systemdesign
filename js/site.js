/* ==========================================================
   System Design na Prática — navegação, tema, quiz, progresso,
   diagramas (Mermaid) e destaque de código (highlight.js).
   Sem build: basta abrir os .html no navegador.
   ========================================================== */

const SITE_PAGES = [
  { file: "index.html", title: "Início", group: "Comece aqui" },
  { file: "pages/guia.html", title: "Guia e plano de estudos", group: "Comece aqui" },
  { file: "pages/01-escala.html", title: "01 · De zero a milhões de usuários", group: "Fundamentos", track: true },
  { file: "pages/02-estimativas.html", title: "02 · Estimativas (back-of-the-envelope)", group: "Fundamentos", track: true },
  { file: "pages/03-framework.html", title: "03 · Framework da entrevista", group: "Fundamentos", track: true },
  { file: "pages/ferramentas.html", title: "Qual ferramenta usar?", group: "Blocos de construção", track: true },
  { file: "pages/distribuidos.html", title: "Conceitos de sistemas distribuídos", group: "Blocos de construção", track: true },
  { file: "pages/04-rate-limiter.html", title: "04 · Rate limiter", group: "Estudos de caso", track: true },
  { file: "pages/05-consistent-hashing.html", title: "05 · Consistent hashing", group: "Estudos de caso", track: true },
  { file: "pages/06-key-value-store.html", title: "06 · Key-value store", group: "Estudos de caso", track: true },
  { file: "pages/07-unique-id.html", title: "07 · Gerador de IDs únicos", group: "Estudos de caso", track: true },
  { file: "pages/08-url-shortener.html", title: "08 · Encurtador de URL", group: "Estudos de caso", track: true },
  { file: "pages/09-web-crawler.html", title: "09 · Web crawler", group: "Estudos de caso", track: true },
  { file: "pages/10-notificacoes.html", title: "10 · Sistema de notificações", group: "Estudos de caso", track: true },
  { file: "pages/11-news-feed.html", title: "11 · News feed", group: "Estudos de caso", track: true },
  { file: "pages/12-chat.html", title: "12 · Sistema de chat", group: "Estudos de caso", track: true },
  { file: "pages/13-autocomplete.html", title: "13 · Autocomplete de busca", group: "Estudos de caso", track: true },
  { file: "pages/14-youtube.html", title: "14 · YouTube", group: "Estudos de caso", track: true },
  { file: "pages/15-google-drive.html", title: "15 · Google Drive", group: "Estudos de caso", track: true },
  { file: "pages/simulacoes.html", title: "Simulador de entrevistas", group: "Prática" },
  { file: "pages/exercicios.html", title: "Exercícios", group: "Prática" },
  { file: "pages/cola.html", title: "Cola para o dia da entrevista", group: "Prática" },
  { file: "pages/recursos.html", title: "Cursos, vídeos e leituras", group: "Referência" },
  { file: "pages/glossario.html", title: "Glossário", group: "Referência" },
];

const STORE_KEY = "sdprep:done";
const store = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
function getDone() { return store.get(STORE_KEY, {}); }
function setDone(file, value) {
  const d = getDone();
  if (value) d[file] = true; else delete d[file];
  store.set(STORE_KEY, d);
}

const ROOT = document.body.dataset.root || ".";
const url = (f) => (ROOT === "." ? f : `${ROOT}/${f}`);

(function init() {
  const path = location.pathname.replace(/\\/g, "/");
  const here = SITE_PAGES.findIndex((p) =>
    p.file === "index.html"
      ? ROOT === "." && (path.endsWith("/index.html") || path.endsWith("/"))
      : path.endsWith("/" + p.file)
  );

  // ---- tema ----
  const saved = localStorage.getItem("sdprep:theme");
  if (saved) document.documentElement.dataset.theme = saved;
  else if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";

  // ---- topbar ----
  const top = document.createElement("header");
  top.className = "topbar";
  top.innerHTML = `
    <button class="icon-btn menu-toggle" aria-label="Abrir menu">☰</button>
    <a class="logo" href="${url("index.html")}">System Design <span>na Prática</span></a>
    <nav>
      <a href="${url("pages/guia.html")}">Guia</a>
      <a href="${url("pages/ferramentas.html")}">Ferramentas</a>
      <a href="${url("index.html")}#casos">Estudos de caso</a>
      <a href="${url("pages/simulacoes.html")}">Simulador</a>
      <a href="${url("pages/exercicios.html")}">Exercícios</a>
      <a href="${url("pages/recursos.html")}">Recursos</a>
    </nav>
    <div class="spacer"></div>
    <input type="search" placeholder="Filtrar menu…" aria-label="Filtrar tópicos">
    <button class="icon-btn theme-toggle" title="Tema claro/escuro" aria-label="Alternar tema">◐</button>`;
  document.body.prepend(top);

  // ---- sidebar ----
  const side = document.createElement("aside");
  side.className = "sidebar";
  const done = getDone();
  let html = "", group = "";
  SITE_PAGES.forEach((p, i) => {
    if (p.group !== group) { group = p.group; html += `<h3>${group}</h3>`; }
    const mark = p.track && done[p.file] ? `<span class="done" title="Concluída">✓</span>` : "";
    html += `<a href="${url(p.file)}" class="${i === here ? "current" : ""}" data-title="${p.title.toLowerCase()}">${p.title}${mark}</a>`;
    if (i === here) html += `<div class="subnav" id="subnav"></div>`;
  });
  side.innerHTML = html;
  top.after(side);
  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  side.after(backdrop);

  const subnav = document.getElementById("subnav");
  if (subnav) {
    subnav.innerHTML = [...document.querySelectorAll(".content h2[id]")]
      .map((h) => `<a href="#${h.id}" data-title="${h.textContent.toLowerCase()}">${h.textContent}</a>`).join("");
  }
  const cur = side.querySelector(".current");
  if (cur) cur.scrollIntoView({ block: "center" });

  top.querySelector(".menu-toggle").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  backdrop.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  side.addEventListener("click", (e) => { if (e.target.closest("a")) document.body.classList.remove("sidebar-open"); });
  top.querySelector(".theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("sdprep:theme", next);
    renderMermaid(true);
  });
  top.querySelector("input[type=search]").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    side.querySelectorAll("a").forEach((a) => a.classList.toggle("hidden", !!q && !a.dataset.title.includes(q)));
  });

  // ---- pager + marcar concluída ----
  const article = document.querySelector(".content");
  if (article && here > 0) {
    const page = SITE_PAGES[here];
    if (page.track) {
      const box = document.createElement("div");
      box.className = "mark-done";
      const render = () => {
        const isDone = !!getDone()[page.file];
        box.innerHTML = `<span>${isDone ? "✅ Você marcou este tópico como estudado." : "Terminou de estudar este tópico (e fez o quiz)?"}</span>
          <button class="btn ${isDone ? "ghost" : ""}">${isDone ? "Desmarcar" : "Marcar como estudado"}</button>`;
        box.querySelector("button").onclick = () => { setDone(page.file, !isDone); render(); };
      };
      render();
      article.append(box);
    }
    const prev = SITE_PAGES[here - 1], next = SITE_PAGES[here + 1];
    const pager = document.createElement("div");
    pager.className = "pager";
    pager.innerHTML =
      (prev ? `<a class="prev" href="${url(prev.file)}"><small>← Anterior</small>${prev.title}</a>` : "<span></span>") +
      (next ? `<a class="next" href="${url(next.file)}"><small>Próximo →</small>${next.title}</a>` : "<span></span>");
    article.append(pager);
  }

  // ---- footer ----
  const foot = document.createElement("footer");
  foot.className = "site-footer";
  foot.innerHTML = `Material de estudo com textos próprios, organizado a partir dos temas de <em>System Design Interview – An Insider's Guide</em> (Alex Xu). Compre o livro para apoiar o autor.`;
  document.body.append(foot);

  initQuizzes();
  initCopyButtons();
  initProgressWidgets();
  loadHighlight();
  renderMermaid(false);
})();

// ---------------- Quiz ----------------
// <div class="quiz" data-answer="1"><div class="q">…</div><button class="opt">…</button>…<div class="why">…</div></div>
function initQuizzes(scope = document) {
  scope.querySelectorAll(".quiz:not([data-ready])").forEach((q) => {
    q.dataset.ready = "1";
    const answer = Number(q.dataset.answer);
    const opts = [...q.querySelectorAll("button.opt")];
    opts.forEach((b, i) => b.addEventListener("click", () => {
      if (q.classList.contains("answered")) return;
      q.classList.add("answered");
      b.classList.add(i === answer ? "right" : "wrong");
      opts[answer].classList.add("right");
      const s = store.get("sdprep:quiz", { right: 0, total: 0 });
      s.total++; if (i === answer) s.right++;
      store.set("sdprep:quiz", s);
    }));
  });
}

// ---------------- Copiar código ----------------
function initCopyButtons(scope = document) {
  scope.querySelectorAll("pre:not(.mermaid):not([data-copy])").forEach((pre) => {
    pre.dataset.copy = "1";
    const b = document.createElement("button");
    b.className = "copy-btn"; b.textContent = "Copiar";
    b.onclick = () => {
      navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText);
      b.textContent = "Copiado!"; setTimeout(() => (b.textContent = "Copiar"), 1300);
    };
    pre.append(b);
  });
}

// ---------------- Progresso (index) ----------------
function initProgressWidgets() {
  const el = document.getElementById("progress");
  if (!el) return;
  const tracked = SITE_PAGES.filter((p) => p.track);
  const done = getDone();
  const n = tracked.filter((p) => done[p.file]).length;
  const q = store.get("sdprep:quiz", { right: 0, total: 0 });
  const sims = Object.keys(store.get("sdprep:sims", {})).length;
  const ex = Object.keys(store.get("sdprep:ex", {})).length;
  el.innerHTML = `
    <p><strong>${n}/${tracked.length}</strong> tópicos estudados</p>
    <div class="progress"><div style="width:${(n / tracked.length) * 100}%"></div></div>
    <p style="font-size:15px;color:var(--muted)">Quizzes: ${q.right}/${q.total} acertos · Simulações feitas: ${sims} · Exercícios resolvidos: ${ex}</p>`;
}

// ---------------- highlight.js (CDN) ----------------
function loadHighlight() {
  if (!document.querySelector("pre code[class*=language-]")) return;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/styles/github-dark.min.css";
  document.head.append(css);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/highlight.min.js";
  s.onload = () => window.hljs && hljs.highlightAll();
  document.head.append(s);
}

// ---------------- Mermaid (CDN) ----------------
let mermaidMod = null;
async function renderMermaid(rerender, scope = document) {
  const nodes = [...scope.querySelectorAll("pre.mermaid")];
  if (!nodes.length) return;
  nodes.forEach((n) => {
    if (!n.dataset.src) n.dataset.src = n.textContent;
    if (rerender) { n.removeAttribute("data-processed"); n.innerHTML = ""; n.textContent = n.dataset.src; }
  });
  try {
    if (!mermaidMod) mermaidMod = (await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")).default;
    const dark = document.documentElement.dataset.theme === "dark";
    mermaidMod.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "loose", flowchart: { useMaxWidth: true, htmlLabels: true } });
    await mermaidMod.run({ nodes: nodes.filter((n) => !n.dataset.processed) });
  } catch (e) {
    console.warn("Mermaid indisponível (offline?) — mostrando o código do diagrama.", e);
  }
}
window.SD = { initQuizzes, initCopyButtons, renderMermaid, store };
