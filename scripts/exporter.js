/* Exporter — generate the "atlas" single-file HTML from state.
   The exported HTML is the deliverable the user showcases: image
   at the center, hotspots overlaid, glass side-panel with rich
   Markdown content, Apple/Google-grade design system inlined. */

import { el, esc, copyText, downloadBlob, toast } from "./util.js";
import { ICONS } from "./icons.js";
import { walk } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";

export class Exporter {
  constructor({ store }) {
    this.store = store;
  }

  /** Direct download of the atlas HTML — no modal. */
  download() {
    const doc = this.store.state.document;
    const name = (doc.name || "atlas")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") + ".html";
    downloadBlob(name, "text/html", this.exportAtlas());
    toast(`Téléchargé : ${name}`);
  }

  open() {
    const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const modal = el("div", { class: "modal" });
    let tab = "atlas";

    const tabs = el("div", { class: "modal__tabs" }, [
      this._tabBtn("Atlas HTML", "atlas", (v) => (tab = v, render())),
      this._tabBtn("JSON",       "json",  (v) => (tab = v, render())),
    ]);

    const pane = el("div", { class: "modal__pane" });
    const foot = el("div", { class: "modal__foot" }, [
      el("button", { class: "btn btn--ghost", text: "Fermer", onclick: () => scrim.remove() }),
      el("button", {
        class: "btn btn--filled",
        html: `${ICONS.copy}<span>Copier</span>`,
        onclick: async () => {
          const c = pane.querySelector("pre")?.textContent || "";
          if (await copyText(c)) toast("Copié dans le presse-papier");
        },
      }),
      el("button", {
        class: "btn btn--accent",
        html: `${ICONS.download}<span>Télécharger</span>`,
        onclick: () => {
          if (tab === "atlas") {
            const doc = this.store.state.document;
            const name = (doc.name || "atlas").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") + ".html";
            downloadBlob(name, "text/html", this.exportAtlas());
          } else {
            downloadBlob("composition.json", "application/json", this.exportJson());
          }
        },
      }),
    ]);

    const render = () => {
      tabs.querySelectorAll(".modal__tab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
      pane.innerHTML = "";
      const label = el("div", {
        style: {
          fontSize: "12px", color: "var(--ink-tertiary)",
          padding: "0 0 10px", lineHeight: "1.55",
        },
        text: tab === "atlas"
          ? "Livrable prêt à partager : un fichier .html autonome (image + hotspots + panel + Markdown), sans dépendance. Ouvre-le tel quel dans un navigateur."
          : "Composition sérialisable — ré-importe-la plus tard pour continuer l'édition.",
      });
      pane.append(label);
      const content = tab === "atlas" ? this.exportAtlas() : this.exportJson();
      pane.append(el("pre", { class: "code-block" }, [el("code", { text: content })]));
    };

    modal.append(
      el("div", { class: "modal__head" }, [
        el("div", { class: "modal__title", text: "Exporter la composition" }),
        el("button", { class: "btn btn--icon", html: ICONS.x, onclick: () => scrim.remove() }),
      ]),
      tabs, pane, foot,
    );
    scrim.append(modal);
    document.body.append(scrim);
    render();

    const escHandler = (e) => { if (e.key === "Escape") { scrim.remove(); document.removeEventListener("keydown", escHandler); } };
    document.addEventListener("keydown", escHandler);
  }

  _tabBtn(label, id, cb) {
    return el("button", {
      class: `modal__tab${id === "atlas" ? " is-active" : ""}`,
      "data-tab": id, text: label, onclick: () => cb(id),
    });
  }

  /* ── JSON ──────────────────────────────────────────────── */

  exportJson() {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      document: this.store.state.document,
    }, null, 2);
  }

  /* ── Atlas HTML (single-file deliverable) ─────────────── */

  exportAtlas() {
    const doc = this.store.state.document;
    const IMG_W = doc.viewport.w;
    const IMG_H = doc.viewport.h;
    const paper = doc.viewport.paper || "#fdfaf3";
    const title = doc.name || "Architecture interactive";

    // Collect zones (groups) and hotspots (leaves) from state
    const zones = {};
    const hotspots = [];

    walk(doc.layers, (layer) => {
      if (!layer.visible) return;
      const zoneMeta = RAG_ZONES[layer.zone] || { label: layer.content?.label || layer.name, color: layer.style?.stroke || "#5e7bf9" };
      if (layer.type === "group") {
        // Register the zone if it has a `.zone` slug, otherwise use its id
        const key = layer.zone || layer.id;
        if (!zones[key]) {
          zones[key] = {
            label: zoneMeta.label || layer.name,
            color: zoneMeta.color,
            rect: [layer.transform.x, layer.transform.y, layer.transform.w, layer.transform.h],
            markdown: layer.content?.markdown || "",
          };
        }
      } else {
        // Every non-group visible layer is a hotspot.
        // Prefer the human-friendly content.label as title; fall back to layer.name.
        const key = layer.zone || null;
        const title = (layer.content?.label && layer.content.label.trim()) || layer.name;
        const sub = layer.content?.label && layer.content.label !== layer.name ? layer.name : "";
        hotspots.push({
          id: layer.id,
          name: title,
          zone: key,
          rect: [layer.transform.x, layer.transform.y, layer.transform.w, layer.transform.h],
          rot:  layer.transform.rot || 0,
          radius: layer.style?.radius || 14,
          color: (key && RAG_ZONES[key]?.color) || layer.style?.stroke || "#5e7bf9",
          sub,
          markdown: layer.content?.markdown || "",
        });
      }
    });

    // If there are no group-level zones but hotspots reference them, synthesize
    for (const h of hotspots) {
      if (h.zone && !zones[h.zone]) {
        const m = RAG_ZONES[h.zone];
        if (m) zones[h.zone] = { label: m.label, color: m.color, rect: null, markdown: "" };
      }
    }

    // Background image (must exist for the atlas to make sense)
    const imgSrc = doc.background?.src || "";
    const hasImage = !!imgSrc;

    // Assemble deterministic ids for both zones + hotspots
    const zonesJs = Object.entries(zones).map(([key, z]) => {
      const rect = z.rect ? `[${z.rect.map(n => Math.round(n)).join(", ")}]` : "null";
      return `  "${esc(key)}": { label: ${JSON.stringify(z.label)}, color: ${JSON.stringify(z.color)}, rect: ${rect}, markdown: ${JSON.stringify(z.markdown)} }`;
    }).join(",\n");

    const hotJs = hotspots.map(h => `  {
    id: ${JSON.stringify(h.id)},
    name: ${JSON.stringify(h.name)},
    zone: ${JSON.stringify(h.zone)},
    rect: [${h.rect.map(n => Math.round(n)).join(", ")}],
    rot:  ${h.rot},
    radius: ${h.radius},
    color: ${JSON.stringify(h.color)},
    sub: ${JSON.stringify(h.sub)},
    md: ${JSON.stringify(h.markdown)}
  }`).join(",\n");

    return atlasTemplate({
      title, IMG_W, IMG_H, paper, hasImage, imgSrc, zonesJs, hotJs,
    });
  }
}

/* ==============================================================
   TEMPLATE — the single-file atlas HTML (Apple/Google style).
   Design tokens, glass side-panel, hotspot hover/pulse, spotlight,
   markdown parser, keyboard navigation, theme toggle, no deps.
   ============================================================== */

function atlasTemplate({ title, IMG_W, IMG_H, paper, hasImage, imgSrc, zonesJs, hotJs }) {
  const stageBackground = hasImage
    ? `<img class="figure__img" id="figImg" alt="${esc(title)}" src="${imgSrc}">`
    : `<div class="figure__img" id="figImg" style="background:${esc(paper)};"></div>`;
  return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root {
  color-scheme: dark;
  --surface-0:#0a0a0d; --surface-1:#101014; --surface-2:#16161c;
  --surface-3:#1c1c24; --surface-4:#22222c;
  --glass: rgba(16,16,22,0.72); --glass-strong: rgba(12,12,18,0.86);
  --ink:#f5f5fa; --ink-2:#b8b8c4; --ink-3:#7c7c8a; --ink-4:#4a4a56;
  --line: rgba(255,255,255,0.09); --line-2: rgba(255,255,255,0.14);
  --accent:#6c8bff; --accent-h:#869dff; --accent-2:rgba(108,139,255,0.16);
  --paper:${paper};
  --font-sans:"Inter",-apple-system,"SF Pro Text",system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --ease: cubic-bezier(0.2,0,0,1);
  --ease-out: cubic-bezier(0,0,0,1);
  --ease-spring: cubic-bezier(0.34,1.56,0.64,1);
  --sp-panel: min(440px, 92vw);
  --topbar-h: 52px;
}
:root[data-theme="light"] {
  color-scheme: light;
  --surface-0:#f5f5f7; --surface-1:#fff; --surface-2:#ebebef;
  --surface-3:#dcdce2; --surface-4:#c8c8d0;
  --glass:rgba(255,255,255,0.75); --glass-strong:rgba(255,255,255,0.9);
  --ink:#0a0a10; --ink-2:#52525c; --ink-3:#85858f; --ink-4:#b0b0b8;
  --line:rgba(0,0,0,0.08); --line-2:rgba(0,0,0,0.14);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  font-family:var(--font-sans);font-size:14px;line-height:1.55;color:var(--ink);
  background:
    radial-gradient(ellipse at 20% 0%, rgba(108,139,255,0.08), transparent 55%),
    radial-gradient(ellipse at 100% 100%, rgba(156,54,181,0.05), transparent 55%),
    var(--surface-0);
  overflow:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  font-feature-settings:"cv11","ss01";
}
button{font:inherit;color:inherit;background:none;border:none;padding:0;cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
::selection{background:var(--accent-2);color:var(--ink)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-thumb{background:var(--ink-4);border-radius:999px}
*::-webkit-scrollbar-thumb:hover{background:var(--ink-3)}
*::-webkit-scrollbar-track{background:transparent}

.app{display:grid;grid-template-rows:var(--topbar-h) 1fr;height:100vh}

.topbar{
  display:flex;align-items:center;gap:16px;padding:0 20px;
  border-bottom:1px solid var(--line);background:var(--glass-strong);
  backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);
  position:relative;z-index:30;
}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand__mark{
  width:26px;height:26px;border-radius:7px;
  background:conic-gradient(from 30deg, var(--zone-color-0,#f2b705), var(--zone-color-1,#e03131), var(--zone-color-2,#f08c00), var(--zone-color-3,#1c7ed6), var(--zone-color-4,#2f9e44), var(--zone-color-5,#9c36b5), var(--zone-color-0,#f2b705));
  position:relative;box-shadow:0 4px 12px rgba(108,139,255,0.25);
}
.brand__mark::after{content:"";position:absolute;inset:4px;border-radius:4px;background:var(--surface-1);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)}
.brand__name{font-weight:600;font-size:14px;letter-spacing:-0.01em;white-space:nowrap}
.brand__name em{font-style:normal;color:var(--ink-3);font-weight:400;margin-left:6px}

.topbar__nav{
  display:flex;align-items:center;gap:4px;padding:3px;border-radius:999px;
  background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);
  overflow-x:auto;scrollbar-width:none;min-width:0;margin:0 auto;
}
.topbar__nav::-webkit-scrollbar{display:none}
.nav-chip{
  display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;
  border-radius:999px;font-size:12px;font-weight:500;color:var(--ink-3);
  letter-spacing:0.01em;white-space:nowrap;
  transition:color 140ms var(--ease),background 140ms var(--ease);
}
.nav-chip i{
  width:7px;height:7px;border-radius:50%;background:var(--zc,var(--accent));
  box-shadow:0 0 0 3px color-mix(in srgb,var(--zc,var(--accent)) 20%, transparent);
  transition:box-shadow 140ms var(--ease);
}
.nav-chip:hover{color:var(--ink-2)}
.nav-chip:hover i{box-shadow:0 0 0 4px color-mix(in srgb,var(--zc,var(--accent)) 28%,transparent)}
.nav-chip.is-on{
  color:var(--ink);
  background:color-mix(in srgb,var(--zc,var(--accent)) 18%, var(--surface-3));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--zc,var(--accent)) 30%,transparent);
}

.topbar__actions{display:flex;align-items:center;gap:4px}
.icon-btn{
  width:32px;height:32px;border-radius:8px;display:grid;place-items:center;
  color:var(--ink-2);
  transition:background 140ms var(--ease),color 140ms var(--ease);
}
.icon-btn:hover{background:var(--surface-2);color:var(--ink)}
.icon-btn svg{width:15px;height:15px}

.stage{position:relative;overflow:hidden;display:grid;place-items:center;padding:24px}

.figure{
  position:relative;max-width:min(100%,1400px);max-height:100%;
  aspect-ratio:${IMG_W} / ${IMG_H};width:100%;
  border-radius:14px;overflow:hidden;background:var(--paper);
  box-shadow:0 0 0 1px var(--line-2),0 30px 80px -30px rgba(0,0,0,0.6),0 12px 32px -12px rgba(0,0,0,0.35);
  transition:filter 400ms var(--ease);
}
.stage.has-focus .figure__img{filter:brightness(0.62) saturate(0.65) blur(0.3px)}
.figure__img{display:block;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none;transition:filter 380ms var(--ease)}
.overlay{position:absolute;inset:0;pointer-events:none}

.hotspot{
  position:absolute;pointer-events:auto;cursor:pointer;
  transition:background 260ms var(--ease),box-shadow 260ms var(--ease),transform 320ms var(--ease-spring),filter 260ms var(--ease);
  background:transparent;outline:none;-webkit-tap-highlight-color:transparent;
}
.hotspot::before{
  content:"";position:absolute;inset:0;border-radius:inherit;
  border:1.5px dashed color-mix(in srgb,var(--zc) 55%,transparent);
  opacity:0;transition:opacity 220ms var(--ease);
}
.hotspot::after{
  content:"";position:absolute;inset:-2px;border-radius:inherit;
  border:1.5px solid color-mix(in srgb,var(--zc) 45%,transparent);
  opacity:0;animation:pulse-out 2.6s var(--ease-out) infinite;
  animation-delay:var(--pulse-delay,0s);pointer-events:none;
}
@keyframes pulse-out{
  0%{opacity:0.55;transform:scale(0.98)}
  55%{opacity:0;transform:scale(1.04)}
  100%{opacity:0;transform:scale(1.04)}
}
.hotspot:hover,.hotspot:focus-visible{
  background:color-mix(in srgb,var(--zc) 14%,transparent);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--zc) 65%,transparent),0 0 40px -8px color-mix(in srgb,var(--zc) 45%,transparent);
  transform:translateY(-1px);
}
.hotspot:hover::before,.hotspot:focus-visible::before{opacity:1}
.hotspot:hover::after,.hotspot:focus-visible::after{animation:none;opacity:0}
.hotspot.is-active{
  background:color-mix(in srgb,var(--zc) 22%,transparent);
  box-shadow:0 0 0 2.5px var(--zc),0 0 0 6px color-mix(in srgb,var(--zc) 22%,transparent),0 30px 60px -20px color-mix(in srgb,var(--zc) 55%,rgba(0,0,0,0.35));
}
.hotspot.is-active::before{opacity:1}
.hotspot.is-active::after{animation:none;opacity:0}
.stage.has-focus .hotspot:not(.is-active){opacity:0.28;filter:saturate(0.5)}
.stage.has-focus .hotspot:not(.is-active):hover{opacity:0.9;filter:none}

.hotspot__tag{
  position:absolute;top:-30px;left:50%;transform:translateX(-50%) translateY(4px);
  padding:4px 10px;border-radius:999px;background:var(--glass-strong);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:0 0 0 1px var(--line-2),0 8px 16px -8px rgba(0,0,0,0.5);
  font-size:11px;font-weight:500;color:var(--ink);white-space:nowrap;pointer-events:none;
  opacity:0;transition:opacity 180ms var(--ease),transform 220ms var(--ease-spring);
  display:inline-flex;align-items:center;gap:6px;
}
.hotspot__tag i{width:6px;height:6px;border-radius:50%;background:var(--zc)}
.hotspot:hover .hotspot__tag,.hotspot.is-active .hotspot__tag{opacity:1;transform:translateX(-50%) translateY(0)}

.hint{
  position:absolute;bottom:24px;left:50%;transform:translateX(-50%);
  padding:8px 16px 8px 12px;border-radius:999px;background:var(--glass-strong);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:0 0 0 1px var(--line-2),0 10px 30px -10px rgba(0,0,0,0.5);
  font-size:12px;color:var(--ink-2);display:inline-flex;align-items:center;gap:10px;
  transition:opacity 400ms var(--ease),transform 400ms var(--ease);
  z-index:5;pointer-events:none;
}
.hint.is-hidden{opacity:0;transform:translateX(-50%) translateY(8px)}
.hint__dot{
  width:8px;height:8px;border-radius:50%;background:var(--accent);
  box-shadow:0 0 0 3px var(--accent-2);animation:hint-pulse 1.8s var(--ease-out) infinite;
}
@keyframes hint-pulse{0%,100%{box-shadow:0 0 0 3px var(--accent-2)}50%{box-shadow:0 0 0 7px transparent}}
.hint__kbd{
  font-family:var(--font-mono);font-size:10px;color:var(--ink-3);
  padding:2px 6px;border-radius:4px;background:var(--surface-2);
  box-shadow:inset 0 0 0 1px var(--line);
}

.panel{
  position:fixed;top:calc(var(--topbar-h) + 12px);right:12px;bottom:12px;
  width:var(--sp-panel);z-index:50;background:var(--glass-strong);
  backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
  border-radius:18px;
  box-shadow:0 0 0 1px var(--line-2),0 30px 80px -20px rgba(0,0,0,0.55),0 12px 32px -12px rgba(0,0,0,0.35);
  display:flex;flex-direction:column;overflow:hidden;
  transform:translateX(calc(100% + 24px));opacity:0;
  transition:transform 520ms var(--ease),opacity 340ms var(--ease);
}
.panel.is-open{transform:translateX(0);opacity:1}
.panel__head{padding:22px 24px 18px;position:relative;border-bottom:1px solid var(--line)}
.panel__head::before{
  content:"";position:absolute;top:0;left:24px;right:24px;height:2px;
  background:linear-gradient(to right,transparent,var(--zc,var(--accent)),transparent);opacity:0.7;
}
.panel__zone{
  display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:600;
  color:var(--zc,var(--accent));letter-spacing:0.08em;text-transform:uppercase;
}
.panel__zone i{
  width:8px;height:8px;border-radius:50%;background:var(--zc,var(--accent));
  box-shadow:0 0 0 3px color-mix(in srgb,var(--zc,var(--accent)) 22%,transparent);
}
.panel__title{margin:10px 0 4px;font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:var(--ink)}
.panel__sub{color:var(--ink-3);font-size:13px;margin:0}
.panel__close{
  position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;
  color:var(--ink-2);display:grid;place-items:center;
  transition:background 140ms var(--ease),color 140ms var(--ease),transform 200ms var(--ease-spring);
}
.panel__close:hover{background:var(--surface-3);color:var(--ink);transform:rotate(90deg)}
.panel__close svg{width:14px;height:14px}
.panel__body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 24px 24px}

.panel.is-open .panel__body>*{opacity:0;transform:translateX(24px);animation:slide-in 480ms var(--ease-out) both}
.panel.is-open .panel__body>*:nth-child(1){animation-delay:120ms}
.panel.is-open .panel__body>*:nth-child(2){animation-delay:180ms}
.panel.is-open .panel__body>*:nth-child(3){animation-delay:240ms}
.panel.is-open .panel__body>*:nth-child(4){animation-delay:300ms}
.panel.is-open .panel__body>*:nth-child(5){animation-delay:360ms}
.panel.is-open .panel__body>*:nth-child(6){animation-delay:420ms}
.panel.is-open .panel__body>*:nth-child(n+7){animation-delay:480ms}
@keyframes slide-in{to{opacity:1;transform:none}}

.panel__foot{padding:12px 16px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:8px}
.nav-btn{
  display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;
  border-radius:8px;color:var(--ink-2);font-size:12px;font-weight:500;
  transition:background 140ms var(--ease),color 140ms var(--ease);
}
.nav-btn:hover{background:var(--surface-3);color:var(--ink)}
.nav-btn svg{width:12px;height:12px}
.nav-btn:disabled{opacity:0.4;pointer-events:none}
.pos-indicator{font-family:var(--font-mono);font-size:11px;color:var(--ink-3);letter-spacing:0.05em}

.md{color:var(--ink);font-size:14px;line-height:1.65}
.md h1,.md h2,.md h3{margin:18px 0 8px;color:var(--ink);letter-spacing:-0.01em;line-height:1.25}
.md h1{font-size:20px;font-weight:600}
.md h2{font-size:17px;font-weight:600}
.md h3{font-size:14px;font-weight:600;color:var(--ink-2)}
.md>*:first-child{margin-top:0}
.md p{margin:8px 0;color:var(--ink-2)}
.md ul,.md ol{padding-left:22px;margin:8px 0;color:var(--ink-2)}
.md li{margin:4px 0}
.md li::marker{color:var(--ink-4)}
.md strong{color:var(--ink);font-weight:600}
.md em{font-style:italic;color:var(--ink)}
.md code{
  font-family:var(--font-mono);font-size:12.5px;padding:1.5px 6px;border-radius:5px;
  background:var(--surface-2);color:var(--accent-h);box-shadow:inset 0 0 0 1px var(--line);
}
.md pre{
  padding:12px 14px;border-radius:10px;background:var(--surface-2);overflow-x:auto;
  font-family:var(--font-mono);font-size:12.5px;line-height:1.6;margin:12px 0;
  box-shadow:inset 0 0 0 1px var(--line);
}
.md pre code{background:transparent;padding:0;color:var(--ink);box-shadow:none}
.md blockquote{
  margin:12px 0;padding:10px 14px;
  background:color-mix(in srgb,var(--zc,var(--accent)) 8%,var(--surface-2));
  border-left:3px solid var(--zc,var(--accent));
  border-radius:0 8px 8px 0;color:var(--ink-2);
}
.md blockquote p{margin:4px 0;color:var(--ink)}
.md hr{border:0;border-top:1px solid var(--line);margin:18px 0}
.md a{color:var(--accent-h);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent-h) 40%,transparent);transition:border-color 140ms var(--ease)}
.md a:hover{border-color:var(--accent-h)}

.zone-label{
  position:absolute;padding:4px 9px;border-radius:999px;background:var(--glass-strong);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:0 0 0 1px var(--line-2),0 4px 12px -4px rgba(0,0,0,0.4);
  font-family:var(--font-mono);font-size:10px;font-weight:600;color:var(--zc);
  letter-spacing:0.1em;text-transform:uppercase;
  display:inline-flex;align-items:center;gap:6px;pointer-events:none;
  transition:opacity 300ms var(--ease);z-index:2;
}
.zone-label i{width:6px;height:6px;border-radius:50%;background:var(--zc)}
.stage.has-focus .zone-label:not(.is-active){opacity:0.35}

@media (max-width:720px){
  :root{--sp-panel:100vw;--topbar-h:48px}
  .panel{top:0;right:0;bottom:0;border-radius:0}
  .brand__name em{display:none}
  .topbar__nav{max-width:44vw}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:0.01ms !important;transition-duration:0.01ms !important}
}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="brand">
      <div class="brand__mark"></div>
      <div class="brand__name">${esc(title)} <em>· anatomie interactive</em></div>
    </div>
    <nav class="topbar__nav" id="zoneNav" aria-label="Zones"></nav>
    <div class="topbar__actions">
      <button class="icon-btn" id="themeBtn" title="Basculer le thème" aria-label="Basculer le thème">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" id="themeIcon">
          <path d="M11.5 8.2A5 5 0 015.8 2.5a5 5 0 106 6z"/>
        </svg>
      </button>
    </div>
  </header>
  <main class="stage" id="stage">
    <figure class="figure" id="figure">
      ${stageBackground}
      <div class="overlay" id="overlay" aria-label="Zones interactives"></div>
    </figure>
    <div class="hint" id="hint">
      <span class="hint__dot"></span>
      <span>Survole une brique pour la mettre en évidence, clique pour ouvrir la fiche.</span>
      <span class="hint__kbd">Esc</span>
    </div>
  </main>
</div>
<aside class="panel" id="panel" role="dialog" aria-modal="false" aria-labelledby="panelTitle" tabindex="-1">
  <header class="panel__head">
    <div class="panel__zone" id="panelZone"><i></i><span></span></div>
    <h1 class="panel__title" id="panelTitle"></h1>
    <p class="panel__sub" id="panelSub"></p>
    <button class="panel__close" id="panelClose" aria-label="Fermer (Esc)" title="Fermer (Esc)">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>
      </svg>
    </button>
  </header>
  <div class="panel__body md" id="panelBody"></div>
  <footer class="panel__foot">
    <button class="nav-btn" id="prevBtn" aria-label="Précédent">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5L5 7l4 3.5"/></svg>
      Précédent
    </button>
    <span class="pos-indicator" id="posIndicator"></span>
    <button class="nav-btn" id="nextBtn" aria-label="Suivant">
      Suivant
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5L9 7l-4 3.5"/></svg>
    </button>
  </footer>
</aside>
<script>
const IMG_W = ${IMG_W}, IMG_H = ${IMG_H};

const ZONES = {
${zonesJs}
};

const HOTSPOTS = [
${hotJs}
];

/* Minimal Markdown parser — headings, bold, italic, code, code fences, lists, blockquotes, hr, links */
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function inline(s){
  return s
    .replace(/\`([^\`]+)\`/g,(_,c)=>'<code>'+esc(c)+'</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\\*([^*]+)\\*/g,'<em>$1</em>')
    .replace(/_([^_]+)_/g,'<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,(_,t,u)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>');
}
function md(src){
  if(!src||!src.trim())return '';
  const lines=src.replace(/\\r\\n/g,'\\n').split('\\n');const out=[];let i=0;
  const blank=s=>/^\\s*$/.test(s);
  while(i<lines.length){
    const L=lines[i];
    if(/^\`\`\`/.test(L)){const lang=L.slice(3).trim();const body=[];i++;while(i<lines.length&&!/^\`\`\`/.test(lines[i])){body.push(lines[i]);i++}i++;out.push('<pre><code'+(lang?' class="lang-'+esc(lang)+'"':'')+'>'+esc(body.join('\\n'))+'</code></pre>');continue}
    let m=/^(#{1,6})\\s+(.*)$/.exec(L);
    if(m){out.push('<h'+m[1].length+'>'+inline(esc(m[2]))+'</h'+m[1].length+'>');i++;continue}
    if(/^\\s*-{3,}\\s*$/.test(L)){out.push('<hr/>');i++;continue}
    if(/^>\\s?/.test(L)){const b=[];while(i<lines.length&&/^>\\s?/.test(lines[i])){b.push(lines[i].replace(/^>\\s?/,''));i++}out.push('<blockquote>'+md(b.join('\\n'))+'</blockquote>');continue}
    if(/^\\s*[-*]\\s+/.test(L)){const b=[];while(i<lines.length&&/^\\s*[-*]\\s+/.test(lines[i])){b.push('<li>'+inline(esc(lines[i].replace(/^\\s*[-*]\\s+/,'')))+'</li>');i++}out.push('<ul>'+b.join('')+'</ul>');continue}
    if(/^\\s*\\d+\\.\\s+/.test(L)){const b=[];while(i<lines.length&&/^\\s*\\d+\\.\\s+/.test(lines[i])){b.push('<li>'+inline(esc(lines[i].replace(/^\\s*\\d+\\.\\s+/,'')))+'</li>');i++}out.push('<ol>'+b.join('')+'</ol>');continue}
    if(!blank(L)){const b=[L];i++;while(i<lines.length&&!blank(lines[i])&&!/^(#{1,6}\\s|>\\s|\`\`\`|\\s*[-*]\\s|\\s*\\d+\\.\\s)/.test(lines[i])){b.push(lines[i]);i++}out.push('<p>'+inline(esc(b.join(' ')))+'</p>');continue}
    i++;
  }
  return out.join('\\n');
}

const stage=document.getElementById('stage');
const overlay=document.getElementById('overlay');
const panel=document.getElementById('panel');
const panelBody=document.getElementById('panelBody');
const panelTitle=document.getElementById('panelTitle');
const panelSub=document.getElementById('panelSub');
const panelZone=document.getElementById('panelZone');
const zoneNav=document.getElementById('zoneNav');
const hint=document.getElementById('hint');
const prevBtn=document.getElementById('prevBtn');
const nextBtn=document.getElementById('nextBtn');
const posInd=document.getElementById('posIndicator');
const brandMark=document.querySelector('.brand__mark');
let currentId=null;

const zoneKeys=Object.keys(ZONES);
zoneKeys.slice(0,6).forEach((k,i)=>{brandMark.style.setProperty('--zone-color-'+i, ZONES[k].color)});

function pct(n,total){return ((n/total)*100).toFixed(4)}

/* Zone chips */
Object.entries(ZONES).forEach(([key,z])=>{
  const chip=document.createElement('button');
  chip.className='nav-chip';chip.dataset.zone=key;
  chip.style.setProperty('--zc',z.color);
  chip.innerHTML='<i></i><span>'+esc(z.label)+'</span>';
  chip.onclick=()=>{const first=HOTSPOTS.find(h=>h.zone===key);if(first)openHotspot(first.id);};
  zoneNav.appendChild(chip);
});

/* Zone labels (only if zone has a rect) */
Object.entries(ZONES).forEach(([key,z])=>{
  if(!z.rect)return;
  const label=document.createElement('div');
  label.className='zone-label';label.dataset.zone=key;
  label.style.setProperty('--zc',z.color);
  label.style.left=pct(z.rect[0]+12,IMG_W)+'%';
  label.style.top =pct(z.rect[1]-14,IMG_H)+'%';
  label.innerHTML='<i></i><span>'+esc(z.label)+'</span>';
  overlay.appendChild(label);
});

/* Hotspots */
HOTSPOTS.forEach((h,idx)=>{
  const el=document.createElement('button');
  el.className='hotspot';el.dataset.id=h.id;el.dataset.zone=h.zone||'';
  el.style.setProperty('--zc',h.color);
  el.style.setProperty('--pulse-delay',(idx*0.13)+'s');
  el.style.left  =pct(h.rect[0],IMG_W)+'%';
  el.style.top   =pct(h.rect[1],IMG_H)+'%';
  el.style.width =pct(h.rect[2],IMG_W)+'%';
  el.style.height=pct(h.rect[3],IMG_H)+'%';
  el.style.borderRadius=h.radius+'px';
  if(h.rot)el.style.transform='rotate('+h.rot+'deg)';
  el.setAttribute('aria-label',h.name+(h.zone?' — '+ZONES[h.zone].label:''));
  el.innerHTML='<span class="hotspot__tag"><i></i>'+esc(h.name)+'</span>';
  el.addEventListener('click',()=>openHotspot(h.id));
  overlay.appendChild(el);
});

function openHotspot(id){
  const h=HOTSPOTS.find(x=>x.id===id);if(!h)return;
  currentId=id;
  const z=h.zone?ZONES[h.zone]:{label:'',color:h.color};
  panel.style.setProperty('--zc',h.color);
  panel.classList.add('is-open');panel.setAttribute('aria-hidden','false');
  stage.classList.add('has-focus');
  panelZone.querySelector('span').textContent=z.label||'';
  panelZone.style.setProperty('--zc',h.color);
  panelTitle.textContent=h.name;
  panelSub.textContent=h.sub||(z.label?z.label:'');
  panelBody.innerHTML=md(h.md)||'<p><em>Aucune documentation Markdown pour cette brique.</em></p>';
  panelBody.scrollTop=0;
  document.querySelectorAll('.hotspot').forEach(el=>el.classList.toggle('is-active',el.dataset.id===id));
  document.querySelectorAll('.nav-chip').forEach(el=>el.classList.toggle('is-on',el.dataset.zone===h.zone));
  document.querySelectorAll('.zone-label').forEach(el=>el.classList.toggle('is-active',el.dataset.zone===h.zone));
  hint.classList.add('is-hidden');
  const i=HOTSPOTS.findIndex(x=>x.id===id);
  posInd.textContent=String(i+1).padStart(2,'0')+' / '+String(HOTSPOTS.length).padStart(2,'0');
  prevBtn.disabled=i===0;nextBtn.disabled=i===HOTSPOTS.length-1;
  panel.focus({preventScroll:true});
}
function closePanel(){
  panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');
  stage.classList.remove('has-focus');currentId=null;
  document.querySelectorAll('.hotspot').forEach(el=>el.classList.remove('is-active'));
  document.querySelectorAll('.nav-chip').forEach(el=>el.classList.remove('is-on'));
  document.querySelectorAll('.zone-label').forEach(el=>el.classList.remove('is-active'));
}
document.getElementById('panelClose').onclick=closePanel;
prevBtn.onclick=()=>{const i=HOTSPOTS.findIndex(x=>x.id===currentId);if(i>0)openHotspot(HOTSPOTS[i-1].id);};
nextBtn.onclick=()=>{const i=HOTSPOTS.findIndex(x=>x.id===currentId);if(i<HOTSPOTS.length-1)openHotspot(HOTSPOTS[i+1].id);};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePanel();return}
  if(!currentId)return;
  const i=HOTSPOTS.findIndex(x=>x.id===currentId);
  if(e.key==='ArrowRight'&&i<HOTSPOTS.length-1){openHotspot(HOTSPOTS[i+1].id);e.preventDefault()}
  if(e.key==='ArrowLeft'&&i>0){openHotspot(HOTSPOTS[i-1].id);e.preventDefault()}
});
stage.addEventListener('click',e=>{
  if(e.target===stage||e.target.classList.contains('figure')||e.target.classList.contains('overlay')||e.target.tagName==='IMG'){closePanel()}
});
const themeBtn=document.getElementById('themeBtn');
const themeIcon=document.getElementById('themeIcon');
try{const t=localStorage.getItem('atlas-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch{}
function setThemeIcon(){
  const t=document.documentElement.getAttribute('data-theme')||'dark';
  themeIcon.innerHTML=t==='dark'
    ?'<circle cx="7" cy="7" r="2.5"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M2.6 11.4l1-1M10.4 3.6l1-1"/>'
    :'<path d="M11.5 8.2A5 5 0 015.8 2.5a5 5 0 106 6z"/>';
}
setThemeIcon();
themeBtn.onclick=()=>{
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('atlas-theme',next)}catch{}
  setThemeIcon();
};
['mousemove','keydown','click'].forEach(ev=>window.addEventListener(ev,()=>{setTimeout(()=>hint.classList.add('is-hidden'),4200)},{once:true}));
</script>
</body>
</html>`;
}
