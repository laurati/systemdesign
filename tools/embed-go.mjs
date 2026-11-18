#!/usr/bin/env node
// Copia o código Go (testado em go/) para dentro das páginas HTML.
//
// Em qualquer .html, um bloco assim:
//   <pre><code class="language-go" data-src="go/ratelimit/tokenbucket.go"></code></pre>
// (opcional: data-lines="10-42") tem seu conteúdo substituído pelo arquivo,
// com HTML escapado. Rode sempre que alterar o código Go:
//
//   node tools/embed-go.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [path.join(root, "index.html"), ...fs.readdirSync(path.join(root, "pages")).filter((f) => f.endsWith(".html")).map((f) => path.join(root, "pages", f))];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const re = /(<code class="language-go" data-src="([^"]+)"(?: data-lines="(\d+)-(\d+)")?>)([\s\S]*?)(<\/code>)/g;

let total = 0;
for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  const out = html.replace(re, (_m, open, src, a, b, _old, close) => {
    let code = fs.readFileSync(path.join(root, src), "utf8").replace(/\s+$/, "");
    if (a) code = code.split("\n").slice(Number(a) - 1, Number(b)).join("\n");
    total++;
    return open + esc(code) + close;
  });
  if (out !== html) fs.writeFileSync(f, out);
}
console.log(`embed-go: ${total} blocos atualizados`);
