/* Rich Markdown editor — toolbar + textarea + optional split preview */

import { el } from "./util.js";
import { ICONS } from "./icons.js";
import { md } from "./util.js";

export function mountMarkdownEditor({ container, value = "", onChange, onCommit }) {
  container.innerHTML = "";

  const editor  = el("div", { class: "md-editor is-split" });
  const toolbar = el("div", { class: "md-toolbar" });
  const pane    = el("div", { class: "md-editor__pane" });
  const area    = el("textarea", { class: "md-editor__textarea", spellcheck: "false", placeholder: "# Titre\n\nDécris cette brique…" });
  const preview = el("div", { class: "md-editor__preview" }, [ el("div", { class: "markdown-body" }) ]);

  const btn = (icon, title, handler) => el("button", {
    title, "aria-label": title, html: icon, onclick: handler,
  });

  const wrapSel = (before, after = before) => {
    const start = area.selectionStart, end = area.selectionEnd;
    const s = area.value;
    area.value = s.slice(0, start) + before + s.slice(start, end) + after + s.slice(end);
    area.focus();
    area.selectionStart = start + before.length;
    area.selectionEnd   = end   + before.length;
    change(true);
  };
  const prefixLines = (prefix) => {
    const start = area.selectionStart, end = area.selectionEnd;
    const s = area.value;
    const before = s.slice(0, start);
    const sel = s.slice(start, end) || "texte";
    const after = s.slice(end);
    const lines = sel.split("\n").map(l => prefix + l).join("\n");
    area.value = before + lines + after;
    change(true);
  };
  const insert = (text) => {
    const start = area.selectionStart;
    const s = area.value;
    area.value = s.slice(0, start) + text + s.slice(start);
    area.focus();
    area.selectionStart = area.selectionEnd = start + text.length;
    change(true);
  };

  toolbar.append(
    btn(ICONS.h1, "Titre 1 (H1)",       () => prefixLines("# ")),
    btn(ICONS.h2, "Titre 2 (H2)",       () => prefixLines("## ")),
    btn(ICONS.h3, "Titre 3 (H3)",       () => prefixLines("### ")),
    el("span", { class: "divider-v" }),
    btn(ICONS.bold,   "Gras (Ctrl+B)",  () => wrapSel("**")),
    btn(ICONS.italic, "Italique (Ctrl+I)", () => wrapSel("*")),
    btn(ICONS.code,   "Code inline",    () => wrapSel("`")),
    el("span", { class: "divider-v" }),
    btn(ICONS.ul,     "Liste à puces",  () => prefixLines("- ")),
    btn(ICONS.ol,     "Liste numérotée", () => prefixLines("1. ")),
    btn(ICONS.quote,  "Citation",       () => prefixLines("> ")),
    btn(ICONS.divider, "Séparateur",    () => insert("\n\n---\n\n")),
    btn(ICONS.link,   "Lien",           () => wrapSel("[", "](https://)")),
    el("span", { style: { flex: 1 } }),
    el("button", {
      class: "is-mono",
      text: "Aperçu",
      title: "Basculer aperçu",
      onclick: () => editor.classList.toggle("is-split"),
    }),
  );

  area.value = value;

  let raf;
  const change = (immediate = false) => {
    onChange?.(area.value);
    if (raf) cancelAnimationFrame(raf);
    const run = () => { preview.querySelector(".markdown-body").innerHTML = md(area.value); };
    if (immediate) run();
    else raf = requestAnimationFrame(run);
  };

  area.addEventListener("input", () => change(false));
  area.addEventListener("blur",  () => onCommit?.(area.value));
  area.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); wrapSel("**"); }
    if ((e.ctrlKey || e.metaKey) && e.key === "i") { e.preventDefault(); wrapSel("*"); }
    if (e.key === "Tab") { e.preventDefault(); insert("  "); }
  });

  preview.querySelector(".markdown-body").innerHTML = md(value);

  pane.append(area, preview);
  editor.append(toolbar, pane);
  container.append(editor);
}
