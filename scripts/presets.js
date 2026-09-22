/* Reusable object library — save any object (with its style, motion,
   sync, animations) as a named preset that persists across projects and
   images (localStorage), and drop it onto any canvas later. */

import { el, uid, toast, clone } from "./util.js";
import { ICONS } from "./icons.js";
import { findLayer } from "./store.js";

const LS_KEY = "dyncv:presets";

export class PresetLibrary {
  constructor({ store, canvas }) {
    this.store = store;
    this.canvas = canvas;
    this.presets = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_PRESETS();
  }
  _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.presets)); } catch {}
  }

  /** Save the currently-selected layer as a reusable preset. */
  saveSelection(name) {
    const id = this.store.state.selection[0];
    const layer = id && findLayer(this.store.state.document.layers, id);
    if (!layer) { toast("Sélectionne un objet à sauvegarder", "danger"); return; }
    const snap = clone(layer);
    stripIds(snap);
    // Normalize position to origin so it drops cleanly anywhere
    const ox = snap.transform.x, oy = snap.transform.y;
    snap.transform.x = 0; snap.transform.y = 0;
    if (snap.type === "connector") {
      if (snap.from) { snap.from.x -= ox; snap.from.y -= oy; }
      if (snap.to)   { snap.to.x -= ox;   snap.to.y -= oy; }
    }
    const preset = {
      id: uid("preset"),
      name: name || layer.name || layer.type,
      kind: layer.type,
      layer: snap,
      createdAt: Date.now(),
    };
    this.presets.unshift(preset);
    this._save();
    toast(`Enregistré : « ${preset.name} »`);
    return preset;
  }

  remove(presetId) {
    this.presets = this.presets.filter(p => p.id !== presetId);
    this._save();
  }

  /** Instantiate a preset onto the canvas at the viewport center. */
  insert(presetId) {
    const p = this.presets.find(x => x.id === presetId);
    if (!p) return;
    const doc = this.store.state.document;
    const cx = Math.round(doc.viewport.w / 2);
    const cy = Math.round(doc.viewport.h / 2);
    this.store.transaction(s => {
      const fresh = clone(p.layer);
      reIds(fresh);
      const w = fresh.transform.w, h = fresh.transform.h;
      const dx = cx - w / 2, dy = cy - h / 2;
      fresh.transform.x = Math.round(dx);
      fresh.transform.y = Math.round(dy);
      if (fresh.type === "connector") {
        if (fresh.from) { fresh.from.x += dx; fresh.from.y += dy; }
        if (fresh.to)   { fresh.to.x += dx;   fresh.to.y += dy; }
      }
      fresh.linkedTo = []; fresh.sync = fresh.sync ? { ...fresh.sync, source: null } : null;
      s.document.layers.push(fresh);
      s.selection = [fresh.id];
    }, "update");
    toast(`Inséré : « ${p.name} »`);
  }

  /* ── UI ──────────────────────────────────────────────────── */

  openLibrary() {
    const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) close(); } });
    const modal = el("div", { class: "modal", style: { width: "min(680px, 94vw)" } });
    const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };

    const grid = el("div", { class: "preset-grid" });
    const render = () => {
      grid.innerHTML = "";
      if (!this.presets.length) {
        grid.append(el("div", { class: "empty", style: { gridColumn: "1 / -1" } }, [
          el("div", { class: "empty__mark", html: ICONS.layers }),
          el("div", { class: "empty__title", text: "Bibliothèque vide" }),
          el("div", { class: "empty__hint", text: "Sélectionne un objet et clique « Sauver comme preset » pour le réutiliser sur d'autres projets." }),
        ]));
        return;
      }
      for (const p of this.presets) {
        const card = el("div", { class: "preset-card" }, [
          el("div", { class: "preset-card__thumb", html: thumbFor(p) }),
          el("div", { class: "preset-card__meta" }, [
            el("div", { class: "preset-card__name", text: p.name, title: p.name }),
            el("div", { class: "preset-card__kind", text: p.kind }),
          ]),
          el("div", { class: "preset-card__actions" }, [
            el("button", { class: "btn btn--accent btn--sm", text: "Insérer", onclick: () => { this.insert(p.id); } }),
            el("button", { class: "btn btn--ghost btn--icon-sm", html: ICONS.trash, title: "Supprimer",
              onclick: () => { this.remove(p.id); render(); } }),
          ]),
        ]);
        grid.append(card);
      }
    };

    modal.append(
      el("div", { class: "modal__head" }, [
        el("div", {}, [
          el("div", { class: "modal__title", text: "Bibliothèque d'objets" }),
          el("div", { style: { fontSize: "12px", color: "var(--ink-tertiary)", marginTop: "2px" }, text: "Tes objets réutilisables — persistés dans ton navigateur, disponibles sur tous tes projets." }),
        ]),
        el("button", { class: "btn btn--icon", html: ICONS.x, onclick: close }),
      ]),
      el("div", { class: "modal__pane" }, [
        el("div", { style: { display: "flex", gap: "6px", marginBottom: "12px" } }, [
          el("button", {
            class: "btn btn--filled btn--sm",
            html: `${ICONS.plus}<span>Sauver la sélection</span>`,
            onclick: () => {
              const id = this.store.state.selection[0];
              const layer = id && findLayer(this.store.state.document.layers, id);
              if (!layer) { toast("Sélectionne d'abord un objet", "danger"); return; }
              const name = prompt("Nom du preset :", layer.name || layer.type);
              if (name !== null) { this.saveSelection(name.trim() || layer.name); render(); }
            },
          }),
        ]),
        grid,
      ]),
    );
    scrim.append(modal);
    document.body.append(scrim);
    document.addEventListener("keydown", onKey);
    render();
  }
}

/* Strip ids so a snapshot has no stale references */
function stripIds(node) {
  node.linkedTo = [];
  node.sync = node.sync ? { ...node.sync, source: null } : null;
  (node.children || []).forEach(stripIds);
}
/* Assign fresh ids to a subtree */
function reIds(node) {
  node.id = uid(node.type ? node.type.slice(0, 1) : "l");
  (node.children || []).forEach(reIds);
}

/* Tiny inline thumbnail per kind */
function thumbFor(p) {
  const c = p.layer?.style?.stroke || p.layer?.style?.fill || "#6c8bff";
  const col = /^#|rgb|hsl|var/.test(c) ? c : "#6c8bff";
  if (p.kind === "dot")       return `<span style="width:14px;height:14px;border-radius:50%;background:${col};box-shadow:0 0 0 6px color-mix(in srgb,${col} 22%,transparent)"></span>`;
  if (p.kind === "connector") return `<svg width="42" height="24" viewBox="0 0 42 24" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="5 4"><path d="M3 18 Q21 2 39 10"/></svg>`;
  if (p.kind === "text")      return `<span style="font-weight:600;color:${col};font-size:16px">Aa</span>`;
  if (p.kind === "image")     return p.layer?.style?.src ? `<img src="${p.layer.style.src}" style="max-width:100%;max-height:100%;object-fit:contain"/>` : `<span style="color:${col}">${ICONS.image}</span>`;
  if (p.kind === "circle")    return `<span style="width:22px;height:22px;border-radius:50%;border:2px solid ${col};background:color-mix(in srgb,${col} 12%,transparent)"></span>`;
  return `<span style="width:30px;height:20px;border-radius:5px;border:2px ${p.layer?.style?.strokeDash ? "dashed" : "solid"} ${col};background:color-mix(in srgb,${col} 12%,transparent)"></span>`;
}

/* A couple of ready-to-use starter presets */
function DEFAULT_PRESETS() {
  const base = (over) => ({
    id: uid("preset"), createdAt: Date.now(), ...over,
  });
  return [
    base({
      name: "Nœud actif (pulse)", kind: "dot",
      layer: {
        name: "Nœud actif", type: "dot", visible: true, locked: false,
        transform: { x: 0, y: 0, w: 20, h: 20, rot: 0 },
        style: { fill: "#34c759", stroke: "#34c759", strokeWidth: 0, strokeDash: "", radius: 999, opacity: 1, shadow: "", backdrop: "", pulseRings: 3, pulseSpeed: 1.8, pulseScale: 5 },
        motion: { duration: 200, easing: "cubic-bezier(0.34,1.56,0.64,1)", delay: 0, hover: "glow", entrance: "fade-scale" },
        content: { label: "", markdown: "" }, linkedTo: [], sync: null, zone: null, children: [],
      },
    }),
    base({
      name: "Flux de données", kind: "connector",
      layer: {
        name: "Flux", type: "connector", visible: true, locked: false,
        transform: { x: 0, y: 0, w: 200, h: 60, rot: 0 },
        style: { fill: "transparent", stroke: "#6c8bff", strokeWidth: 2, strokeDash: "6 6", radius: 0, opacity: 1, shadow: "", backdrop: "", animateDash: true, dashSpeed: 0.8, arrowEnd: true, curve: 0.4 },
        motion: { duration: 240, easing: "cubic-bezier(0.2,0,0,1)", delay: 0, hover: "none", entrance: "fade" },
        from: { x: 0, y: 0 }, to: { x: 200, y: 40 },
        content: { label: "", markdown: "" }, linkedTo: [], sync: null, zone: null, children: [],
      },
    }),
    base({
      name: "Zone en tirets animés", kind: "rect",
      layer: {
        name: "Zone active", type: "rect", visible: true, locked: false,
        transform: { x: 0, y: 0, w: 220, h: 140, rot: 0 },
        style: { fill: "rgba(108,139,255,0.08)", stroke: "#6c8bff", strokeWidth: 1.5, strokeDash: "6 4", radius: 14, opacity: 1, shadow: "", backdrop: "", animateDash: true, dashSpeed: 1.2 },
        motion: { duration: 240, easing: "cubic-bezier(0.2,0,0,1)", delay: 0, hover: "lift", entrance: "fade-up" },
        content: { label: "", markdown: "" }, linkedTo: [], sync: null, zone: null, children: [],
      },
    }),
  ];
}
