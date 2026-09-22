/* Exporter — generate clean HTML / CSS / JSON from state */

import { el, esc, copyText, downloadBlob, toast } from "./util.js";
import { ICONS } from "./icons.js";
import { walk } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";

export class Exporter {
  constructor({ store }) {
    this.store = store;
  }

  open() {
    const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const modal = el("div", { class: "modal" });
    let tab = "html";

    const tabs = el("div", { class: "modal__tabs" }, [
      this._tabBtn("HTML", "html", (v) => (tab = v, render())),
      this._tabBtn("CSS", "css", (v) => (tab = v, render())),
      this._tabBtn("JSON", "json", (v) => (tab = v, render())),
    ]);

    const pane = el("div", { class: "modal__pane" });
    const foot = el("div", { class: "modal__foot" }, [
      el("button", {
        class: "btn btn--ghost",
        text: "Fermer",
        onclick: () => scrim.remove(),
      }),
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
          if (tab === "html") downloadBlob("architecture.html", "text/html", this.exportHtml());
          else if (tab === "css") downloadBlob("architecture.css", "text/css", this.exportCss());
          else downloadBlob("architecture.json", "application/json", this.exportJson());
        },
      }),
    ]);

    const render = () => {
      tabs.querySelectorAll(".modal__tab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
      pane.innerHTML = "";
      let content;
      if (tab === "html") content = this.exportHtml();
      else if (tab === "css") content = this.exportCss();
      else content = this.exportJson();
      pane.append(el("pre", { class: "code-block" }, [el("code", { text: content })]));
    };

    modal.append(
      el("div", { class: "modal__head" }, [
        el("div", { class: "modal__title", text: "Exporter la composition" }),
        el("button", { class: "btn btn--icon", html: ICONS.x, onclick: () => scrim.remove() }),
      ]),
      tabs,
      pane,
      foot,
    );
    scrim.append(modal);
    document.body.append(scrim);
    render();

    const escHandler = (e) => { if (e.key === "Escape") { scrim.remove(); document.removeEventListener("keydown", escHandler); } };
    document.addEventListener("keydown", escHandler);
  }

  _tabBtn(label, id, cb) {
    return el("button", {
      class: `modal__tab${id === "html" ? " is-active" : ""}`,
      "data-tab": id, text: label, onclick: () => cb(id),
    });
  }

  /* ── HTML ──────────────────────────────────────────────── */

  exportHtml() {
    const doc = this.store.state.document;
    const layers = [];
    walk(doc.layers, (layer) => {
      if (!layer.visible) return;
      layers.push(layer);
    });
    const nodes = layers.map(l => this._layerHtml(l)).join("\n    ");
    const zoneVars = Object.entries(RAG_ZONES).map(([k, v]) => `      --zone-${k}: ${v.color};`).join("\n");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(doc.name || "Architecture")}</title>
  <style>
    :root {
${zoneVars}
      --paper: ${doc.viewport.paper || "#fdfaf3"};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0a0a0d;
      font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif;
    }
    .stage {
      position: relative;
      width: ${doc.viewport.w}px;
      height: ${doc.viewport.h}px;
      background: var(--paper);
      border-radius: 6px;
      box-shadow: 0 30px 80px -20px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .node {
      position: absolute;
      transform-origin: center;
      transition: transform 240ms cubic-bezier(0.2,0,0,1),
                  box-shadow 240ms cubic-bezier(0.2,0,0,1),
                  opacity 240ms cubic-bezier(0.2,0,0,1);
    }
    .node:hover.hover-lift { transform: translateY(-4px); box-shadow: 0 20px 40px -12px rgba(0,0,0,0.35); }
    .node:hover.hover-glow { box-shadow: 0 0 0 6px color-mix(in srgb, var(--zone-c, #5e7bf9) 25%, transparent); }
    .node:hover.hover-scale { transform: scale(1.03); }
    .node__label {
      position: absolute; top: 12px; left: 14px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .node__label i { width: 8px; height: 8px; border-radius: 50%; background: var(--zone-c); }
    @keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; } }
    @keyframes fade-scale { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  </style>
</head>
<body>
  <div class="stage">
    ${nodes}
  </div>
</body>
</html>`;
  }

  _layerHtml(layer) {
    const t = layer.transform;
    const s = layer.style;
    const zoneColor = RAG_ZONES[layer.zone]?.color || "#5e7bf9";
    const styles = [
      `left:${t.x}px`, `top:${t.y}px`,
      `width:${t.w}px`, `height:${t.h}px`,
      t.rot ? `transform:rotate(${t.rot}deg)` : null,
      s.fill ? `background:${s.fill}` : null,
      s.radius ? `border-radius:${s.radius}px` : null,
      s.stroke && s.strokeWidth ? `border:${s.strokeWidth}px ${s.strokeDash ? "dashed" : "solid"} ${s.stroke}` : null,
      s.opacity !== 1 ? `opacity:${s.opacity}` : null,
      s.shadow ? `box-shadow:${s.shadow}` : null,
      s.backdrop ? `backdrop-filter:${s.backdrop};-webkit-backdrop-filter:${s.backdrop}` : null,
      `--zone-c:${zoneColor}`,
      layer.motion?.entrance && layer.motion.entrance !== "none"
        ? `animation:${layer.motion.entrance} ${layer.motion.duration || 240}ms ${layer.motion.easing || "cubic-bezier(0.2,0,0,1)"} ${layer.motion.delay || 0}ms both`
        : null,
    ].filter(Boolean).join(";");

    const cls = [
      "node", `node--${layer.type}`,
      layer.motion?.hover && layer.motion.hover !== "none" ? `hover-${layer.motion.hover}` : "",
    ].filter(Boolean).join(" ");

    const label = (layer.type === "group" && layer.content?.label)
      ? `<span class="node__label" style="color:${zoneColor}"><i></i>${esc(layer.content.label)}</span>`
      : "";

    return `<div class="${cls}" style="${styles}" data-name="${esc(layer.name)}">${label}</div>`;
  }

  /* ── CSS ───────────────────────────────────────────────── */

  exportCss() {
    const doc = this.store.state.document;
    const rules = [];
    walk(doc.layers, (layer) => {
      const t = layer.transform, s = layer.style;
      const zoneColor = RAG_ZONES[layer.zone]?.color || "#5e7bf9";
      const parts = [
        `  position: absolute;`,
        `  left: ${t.x}px;`, `  top: ${t.y}px;`,
        `  width: ${t.w}px;`, `  height: ${t.h}px;`,
        t.rot ? `  transform: rotate(${t.rot}deg);` : null,
        s.fill ? `  background: ${s.fill};` : null,
        s.radius ? `  border-radius: ${s.radius}px;` : null,
        s.stroke && s.strokeWidth ? `  border: ${s.strokeWidth}px ${s.strokeDash ? "dashed" : "solid"} ${s.stroke};` : null,
        s.opacity !== 1 ? `  opacity: ${s.opacity};` : null,
        s.shadow ? `  box-shadow: ${s.shadow};` : null,
        s.backdrop ? `  backdrop-filter: ${s.backdrop};\n  -webkit-backdrop-filter: ${s.backdrop};` : null,
        layer.motion?.duration ? `  transition: all ${layer.motion.duration}ms ${layer.motion.easing || "cubic-bezier(0.2,0,0,1)"};` : null,
      ].filter(Boolean);
      rules.push(`.node[data-id="${layer.id}"] {\n${parts.join("\n")}\n}`);
    });
    return `/* Generated by Dyncv Studio */\n\n${rules.join("\n\n")}\n`;
  }

  /* ── JSON ──────────────────────────────────────────────── */

  exportJson() {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      document: this.store.state.document,
    }, null, 2);
  }
}
