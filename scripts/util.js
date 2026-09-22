/* Small utilities: DOM, ids, clamp, markdown, storage */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k === "text") n.textContent = attrs[k];
    else if (k === "style" && typeof attrs[k] === "object") Object.assign(n.style, attrs[k]);
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
};

export const uid = (prefix = "id") =>
  prefix + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const round = (n, p = 1) => Math.round(n * (10 ** p)) / (10 ** p);

export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));

/* Debounce & throttle */
export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* Deep clone (structured clone with fallback) */
export const clone = obj => (typeof structuredClone === "function"
  ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));

/* Format helpers */
export const fmtPx  = n => `${Math.round(n)}px`;
export const fmtDeg = n => `${round(n, 1)}°`;
export const fmtPct = n => `${Math.round(n * 100)}%`;

/* ------------------------------------------------------------------
   Minimal Markdown parser — headings, bold, italic, code, lists,
   blockquotes, hr, links, code fences. Enough for docs.
------------------------------------------------------------------ */
export function md(src = "") {
  if (!src.trim()) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlank = s => /^\s*$/.test(s);
  const inline = s => s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]); i++;
      }
      i++; // closing fence
      out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    // Heading
    let m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) { out.push(`<h${m[1].length}>${inline(esc(m[2]))}</h${m[1].length}>`); i++; continue; }
    // HR
    if (/^\s*-{3,}\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${md(body.join("\n"))}</blockquote>`);
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        body.push(`<li>${inline(esc(lines[i].replace(/^\s*[-*]\s+/, "")))}</li>`); i++;
      }
      out.push(`<ul>${body.join("")}</ul>`);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        body.push(`<li>${inline(esc(lines[i].replace(/^\s*\d+\.\s+/, "")))}</li>`); i++;
      }
      out.push(`<ol>${body.join("")}</ol>`);
      continue;
    }
    // Paragraph
    if (!isBlank(line)) {
      const body = [line];
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6}\s|>\s|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
        body.push(lines[i]); i++;
      }
      out.push(`<p>${inline(esc(body.join(" ")))}</p>`);
      continue;
    }
    i++;
  }
  return out.join("\n");
}

/* Toast helper */
export function toast(msg, tone = "info") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = el("div", { class: "toast-wrap" });
    document.body.append(wrap);
  }
  const t = el("div", { class: `toast toast--${tone}`, text: msg });
  wrap.append(t);
  setTimeout(() => t.remove(), 2400);
}

/* Clipboard */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

/* File download */
export function downloadBlob(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
