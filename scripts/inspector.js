/* Inspector — three tabs (Properties, Style, Motion) with two-way bindings */

import { el, esc, round, debounce } from "./util.js";
import { ICONS } from "./icons.js";
import { findLayer } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";
import { mountMarkdownEditor } from "./markdown-editor.js";
import { EFFECTS, TRIGGERS } from "./motion-engine.js";
import { walk } from "./store.js";

const EASINGS = [
  ["cubic-bezier(0.2,0,0,1)",        "Standard (Material 3)"],
  ["cubic-bezier(0.4,0,0.2,1)",      "Standard (M2)"],
  ["cubic-bezier(0.34,1.56,0.64,1)", "Spring"],
  ["cubic-bezier(0.16,1,0.3,1)",     "Ease-out expo"],
  ["cubic-bezier(0.87,0,0.13,1)",    "Ease-in-out expo"],
  ["cubic-bezier(0,0,0,1)",          "Ease-out (Apple)"],
  ["linear",                          "Linear"],
];

const HOVER_STATES = [
  ["none",  "Aucun"],
  ["lift",  "Élévation"],
  ["glow",  "Halo"],
  ["scale", "Zoom"],
  ["dim",   "Estompé"],
];

const ENTRANCES = [
  ["fade",       "Fondu"],
  ["fade-up",    "Fondu ↑"],
  ["fade-scale", "Fondu + zoom"],
  ["none",       "Aucun"],
];

export class Inspector {
  constructor({ store, root, onFocus }) {
    this.store = store;
    this.root = root;
    this.tab = "props";
    this.onFocus = onFocus;

    this._build();
    this.store.on("selection", () => this.render());
    this.store.on("replace",   () => this.render());
    this.store.on("update",    () => this.render());
    this.store.on("layer:transform", () => this._refreshTransform());
  }

  _build() {
    this.root.innerHTML = "";
    this.root.append(
      el("div", { class: "panel-head" }, [
        el("span", { class: "panel-head__title", text: "Inspector" }),
      ]),
      el("div", { class: "tabs" }, [
        this._tabBtn("props",  "Propriétés"),
        this._tabBtn("style",  "Style"),
        this._tabBtn("motion", "Motion"),
        this._tabBtn("docs",   "Docs"),
      ]),
    );
    this.body = el("div", { class: "panel-body" });
    this.root.append(this.body);
    this.render();
  }

  _tabBtn(id, label) {
    return el("button", {
      class: `tab${id === this.tab ? " is-active" : ""}`,
      "data-tab": id,
      text: label,
      onclick: () => {
        this.tab = id;
        this.root.querySelectorAll(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === id));
        this.render();
      },
    });
  }

  render() {
    const sel = this.store.state.selection;
    this.body.innerHTML = "";
    if (!sel.length) {
      this._renderEmpty();
      return;
    }
    if (sel.length > 1) {
      this._renderMulti(sel);
      return;
    }
    const layer = findLayer(this.store.state.document.layers, sel[0]);
    if (!layer) return;
    if      (this.tab === "props")  this._renderProps(layer);
    else if (this.tab === "style")  this._renderStyle(layer);
    else if (this.tab === "motion") this._renderMotion(layer);
    else if (this.tab === "docs")   this._renderDocs(layer);
  }

  _renderEmpty() {
    this.body.append(el("div", { class: "empty" }, [
      el("div", { class: "empty__mark", html: ICONS.cursor }),
      el("div", { class: "empty__title", text: "Aucune sélection" }),
      el("div", {
        class: "empty__hint",
        text: "Clique sur un élément du canvas ou dans l'arborescence pour l'inspecter et le modifier en direct.",
      }),
    ]));
  }

  _renderMulti(ids) {
    this.body.append(el("div", { class: "empty" }, [
      el("div", { class: "empty__mark", html: ICONS.layers }),
      el("div", { class: "empty__title", text: `${ids.length} éléments sélectionnés` }),
      el("div", { class: "empty__hint", text: "Sélectionne un seul élément pour ouvrir l'inspecteur complet." }),
    ]));
  }

  /* ── Props tab ───────────────────────────────────────────── */

  _renderProps(layer) {
    // Identity
    const zone = RAG_ZONES[layer.zone];
    this.body.append(this._group("Identité", [
      this._row("Nom", el("div", { class: "input-shell" }, [
        el("input", {
          type: "text", value: layer.name,
          onchange: (e) => this._patchName(layer.id, e.target.value),
        }),
      ])),
      this._row("Type", el("div", { class: "input-shell" }, [
        el("input", { type: "text", value: layer.type, disabled: true }),
      ])),
      zone ? this._row("Zone", el("div", { class: "input-shell" }, [
        el("span", { style: { width: "10px", height: "10px", borderRadius: "50%", background: zone.color, display: "inline-block", marginRight: "6px" } }),
        el("input", { type: "text", value: zone.label, disabled: true }),
      ])) : null,
      el("div", { style: { display: "flex", gap: "4px", paddingTop: "4px" } }, [
        el("button", {
          class: "btn btn--filled btn--sm", style: { flex: 1 },
          text: "Focus", onclick: () => this.onFocus?.(layer.id),
        }),
        el("button", {
          class: "btn btn--filled btn--sm", style: { flex: 1 },
          text: "Dupliquer", onclick: () => this._duplicate(layer.id),
        }),
      ]),
    ]));

    // Transform
    this._renderTransform(layer);

    // Content
    const contentGroup = this._group("Contenu", [
      this._row("Titre", el("div", { class: "input-shell" }, [
        el("input", {
          type: "text", value: layer.content?.label || "",
          onchange: (e) => this._patchContent(layer.id, "label", e.target.value),
        }),
      ])),
    ]);
    this.body.append(contentGroup);

    // Linked layers (grouped binding)
    this._renderLinks(layer);
  }

  _renderLinks(layer) {
    const layers = [];
    const walkFn = (list) => {
      for (const l of list) {
        if (l.id !== layer.id) layers.push(l);
        if (l.children) walkFn(l.children);
      }
    };
    walkFn(this.store.state.document.layers);

    const linked = new Set(layer.linkedTo || []);
    const list = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } });
    for (const other of layers.slice(0, 50)) {
      const on = linked.has(other.id);
      const chip = el("button", {
        class: "btn btn--sm",
        style: {
          background: on ? "var(--accent-tint-strong)" : "var(--surface-2)",
          color: on ? "var(--accent-hover)" : "var(--ink-secondary)",
          boxShadow: on ? "inset 0 0 0 1px var(--accent-tint-strong)" : "var(--shadow-inset)",
        },
        text: other.name || other.type,
        title: other.name,
        onclick: () => {
          this.store.transaction(s => {
            const t = findLayer(s.document.layers, layer.id);
            if (!t) return;
            t.linkedTo = t.linkedTo || [];
            const idx = t.linkedTo.indexOf(other.id);
            if (idx >= 0) t.linkedTo.splice(idx, 1);
            else t.linkedTo.push(other.id);
          }, "update");
        },
      });
      list.append(chip);
    }
    const g = this._group("Layers liés", [
      el("div", { style: { fontSize: "11px", color: "var(--ink-tertiary)", lineHeight: "1.55" },
                  text: "Sélectionne les calques à mettre en surbrillance en même temps que celui-ci." }),
      list,
    ]);
    this.body.append(g);
  }

  _renderTransform(layer) {
    const t = layer.transform;
    const numInput = (val, onChange, suffix = "px", min, max) => {
      const shell = el("div", { class: "input-shell input-shell--drag" });
      const input = el("input", {
        type: "number", value: Math.round(val),
        onchange: (e) => onChange(parseFloat(e.target.value) || 0),
        step: 1,
      });
      if (min !== undefined) input.min = min;
      if (max !== undefined) input.max = max;
      shell.append(input, el("span", { class: "input-shell__suffix", text: suffix }));
      return shell;
    };

    const g = this._group("Transform", [
      el("div", { class: "input-grid-2" }, [
        this._row("X", numInput(t.x, v => this._patchTransform(layer.id, { x: Math.round(v) }))),
        this._row("Y", numInput(t.y, v => this._patchTransform(layer.id, { y: Math.round(v) }))),
      ]),
      el("div", { class: "input-grid-2" }, [
        this._row("L", numInput(t.w, v => this._patchTransform(layer.id, { w: Math.round(v) }), "px", 1)),
        this._row("H", numInput(t.h, v => this._patchTransform(layer.id, { h: Math.round(v) }), "px", 1)),
      ]),
      this._row("Rotation", numInput(t.rot || 0, v => this._patchTransform(layer.id, { rot: v }), "°")),
    ]);
    this._transformGroup = g;
    this.body.append(g);
  }

  _refreshTransform() {
    if (this.tab !== "props") return;
    const sel = this.store.state.selection;
    if (sel.length !== 1) return;
    const layer = findLayer(this.store.state.document.layers, sel[0]);
    if (!layer || !this._transformGroup) return;
    const inputs = this._transformGroup.querySelectorAll("input[type=number]");
    if (inputs.length >= 5) {
      inputs[0].value = Math.round(layer.transform.x);
      inputs[1].value = Math.round(layer.transform.y);
      inputs[2].value = Math.round(layer.transform.w);
      inputs[3].value = Math.round(layer.transform.h);
      inputs[4].value = round(layer.transform.rot || 0, 1);
    }
  }

  /* ── Style tab ──────────────────────────────────────────── */

  _renderStyle(layer) {
    const s = layer.style;

    this.body.append(this._group("Remplissage", [
      this._row("Fond", this._colorSwatch(s.fill || "transparent", v => this._patchStyle(layer.id, { fill: v }))),
      this._row("Opacité", this._slider(s.opacity ?? 1, 0, 1, 0.01, v => this._patchStyle(layer.id, { opacity: v }))),
    ]));

    this.body.append(this._group("Bordure", [
      this._row("Couleur", this._colorSwatch(s.stroke || "#5e7bf9", v => this._patchStyle(layer.id, { stroke: v }))),
      this._row("Épaisseur", this._slider(s.strokeWidth || 0, 0, 8, 0.5, v => this._patchStyle(layer.id, { strokeWidth: v }))),
      this._row("Style", this._select([["", "Plein"], ["6 4", "Tirets"], ["2 4", "Pointillés"]], s.strokeDash || "", v => this._patchStyle(layer.id, { strokeDash: v }))),
      this._row("Rayon", this._slider(s.radius || 0, 0, 999, 1, v => this._patchStyle(layer.id, { radius: v }))),
      this._toggleRow("Marching ants", !!s.animateDash, v => this._patchStyle(layer.id, { animateDash: v })),
      s.animateDash ? this._row("Vitesse", this._slider(s.dashSpeed || 1.2, 0.2, 4, 0.1, v => this._patchStyle(layer.id, { dashSpeed: v }), "s")) : null,
    ]));

    // Type-specific extras
    if (layer.type === "dot") {
      this.body.append(this._group("Point pulsé", [
        this._row("Halos",   this._slider(s.pulseRings || 3, 1, 5, 1, v => this._patchStyle(layer.id, { pulseRings: v }))),
        this._row("Vitesse", this._slider(s.pulseSpeed || 2.2, 0.5, 6, 0.1, v => this._patchStyle(layer.id, { pulseSpeed: v }), "s")),
        this._row("Portée",  this._slider(s.pulseScale || 5, 1.5, 10, 0.1, v => this._patchStyle(layer.id, { pulseScale: v }), "×")),
      ]));
    }
    if (layer.type === "connector") {
      this.body.append(this._group("Connecteur", [
        this._toggleRow("Flèche", s.arrowEnd !== false, v => this._patchStyle(layer.id, { arrowEnd: v })),
        this._row("Courbure", this._slider(s.curve ?? 0.5, -1, 1, 0.05, v => this._patchStyle(layer.id, { curve: v }))),
      ]));
    }
    if (layer.type === "image") {
      this.body.append(this._group("Image", [
        this._row("Ajustement", this._select([["contain", "Contain"], ["cover", "Cover"], ["fill", "Fill"], ["scale-down", "Scale-down"]], s.fit || "contain", v => this._patchStyle(layer.id, { fit: v }))),
      ]));
    }
    if (layer.type === "text") {
      this.body.append(this._group("Texte", [
        this._row("Couleur", this._colorSwatch(s.textColor || "#0a0a10", v => this._patchStyle(layer.id, { textColor: v }))),
        this._row("Taille",  this._slider(s.textSize || 14, 8, 96, 1, v => this._patchStyle(layer.id, { textSize: v }), "px")),
        this._row("Graisse", this._select([[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]], String(s.textWeight || 500), v => this._patchStyle(layer.id, { textWeight: parseInt(v, 10) }))),
        this._row("Align",   this._select([["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]], s.textAlign || "left", v => this._patchStyle(layer.id, { textAlign: v }))),
      ]));
    }

    this.body.append(this._group("Ombre", [
      el("div", { class: "field" }, [
        el("span", { class: "field__label", text: "box-shadow" }),
        el("div", { class: "input-shell" }, [
          el("input", {
            type: "text",
            value: s.shadow || "",
            placeholder: "0 8px 20px -10px rgba(0,0,0,.5)",
            onchange: (e) => this._patchStyle(layer.id, { shadow: e.target.value }),
          }),
        ]),
      ]),
      el("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } },
        [
          ["Aucune", ""],
          ["Douce", "0 4px 12px -4px rgba(0,0,0,0.25)"],
          ["Nette", "0 12px 32px -8px rgba(0,0,0,0.45)"],
          ["Halo",  "0 0 0 6px color-mix(in srgb, var(--zone-color, #5e7bf9) 18%, transparent)"],
          ["Multi", "0 1px 2px rgba(0,0,0,.3), 0 8px 24px -4px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.05)"],
        ].map(([label, val]) =>
          el("button", {
            class: "btn btn--filled btn--sm",
            text: label,
            onclick: () => this._patchStyle(layer.id, { shadow: val }),
          }),
        ),
      ),
    ]));

    this.body.append(this._group("Backdrop filter", [
      el("div", { class: "field" }, [
        el("span", { class: "field__label", text: "filter" }),
        el("div", { class: "input-shell" }, [
          el("input", {
            type: "text",
            value: s.backdrop || "",
            placeholder: "blur(12px) saturate(160%)",
            onchange: (e) => this._patchStyle(layer.id, { backdrop: e.target.value }),
          }),
        ]),
      ]),
      el("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } },
        [
          ["Aucun", ""],
          ["Blur SM", "blur(8px)"],
          ["Blur MD", "blur(16px) saturate(160%)"],
          ["Blur LG", "blur(24px) saturate(180%)"],
        ].map(([label, val]) =>
          el("button", {
            class: "btn btn--filled btn--sm",
            text: label,
            onclick: () => this._patchStyle(layer.id, { backdrop: val }),
          }),
        ),
      ),
    ]));
  }

  /* ── Motion tab ─────────────────────────────────────────── */

  _renderMotion(layer) {
    const m = layer.motion || {};
    this.body.append(this._group("Timing", [
      this._row("Durée",
        this._slider(m.duration || 240, 0, 1200, 20, v => this._patchMotion(layer.id, { duration: v }), "ms"),
      ),
      this._row("Delay",
        this._slider(m.delay || 0, 0, 2000, 20, v => this._patchMotion(layer.id, { delay: v }), "ms"),
      ),
      this._row("Easing", this._select(EASINGS, m.easing || "cubic-bezier(0.2,0,0,1)", v => this._patchMotion(layer.id, { easing: v }))),
    ]));

    this.body.append(this._group("États", [
      this._row("Hover", this._select(HOVER_STATES, m.hover || "none", v => this._patchMotion(layer.id, { hover: v }))),
      this._row("Entrée", this._select(ENTRANCES, m.entrance || "fade-up", v => this._patchMotion(layer.id, { entrance: v }))),
    ]));

    // Curve preview
    const canv = el("canvas", { width: 200, height: 80, style: { width: "100%", height: "80px", borderRadius: "6px", background: "var(--surface-2)", boxShadow: "var(--shadow-inset)" } });
    this.body.append(el("div", { class: "group" }, [
      el("div", { class: "group__head" }, [ el("span", { class: "group__title", text: "Courbe" }) ]),
      canv,
    ]));
    this._drawCurve(canv, m.easing || "cubic-bezier(0.2,0,0,1)");

    // Choreography — sync with another layer
    this._renderChoreography(layer);
  }

  _renderChoreography(layer) {
    const sync = layer.sync || {};

    // Build list of candidate sources — any other layer that has a period
    // (dot, connector with animated dash, marching-ants borders).
    const sources = [];
    walk(this.store.state.document.layers, (l) => {
      if (l.id === layer.id) return;
      const hasPeriod = l.type === "dot" || l.type === "connector" || l.style?.animateDash;
      if (hasPeriod) sources.push({ id: l.id, name: l.name || l.type });
    });

    const sourceOptions = [["", "— Aucun —"], ...sources.map(s => [s.id, s.name])];

    const setSync = (patch) => {
      this.store.transaction(s => {
        const t = findLayer(s.document.layers, layer.id);
        if (!t) return;
        t.sync = { ...(t.sync || {}), ...patch };
        if (!t.sync.source) t.sync = null;
        return { id: layer.id };
      }, "update");
    };

    const preview = () => {
      if (!layer.sync?.effect) return;
      window.__motion?.fireEffect(layer.id, layer.sync.effect, 0);
    };

    const declSyntax = layer.sync?.source
      ? `syncWith: '${(sources.find(s => s.id === layer.sync.source)?.name || layer.sync.source)}',\ntrigger: '${layer.sync.trigger || "cycle:start"}',\ndelay:   ${layer.sync.delay || 0}ms,\neffect:  '${layer.sync.effect || "pulse-cascade"}'`
      : `// Aucune synchronisation`;

    this.body.append(this._group("Choreography", [
      el("div", { style: { fontSize: "11px", color: "var(--ink-tertiary)", lineHeight: "1.55" },
                  text: sources.length
                    ? "Déclenche un effet sur ce calque quand un autre calque atteint un moment de son cycle."
                    : "Aucune source disponible : crée un Point pulsé ou active « Marching ants » sur un autre calque." }),
      this._row("Sync With", this._select(sourceOptions, sync.source || "", v => setSync({ source: v || null }))),
      sync.source ? this._row("Trigger", this._select(TRIGGERS, sync.trigger || "cycle:start", v => setSync({ trigger: v }))) : null,
      sync.source ? this._row("Delay", this._slider(sync.delay || 0, 0, 2000, 20, v => setSync({ delay: v }), "ms")) : null,
      sync.source ? this._row("Effect", this._select(EFFECTS, sync.effect || "pulse-cascade", v => setSync({ effect: v }))) : null,
      sync.source ? el("div", { style: { display: "flex", gap: "6px", paddingTop: "4px" } }, [
        el("button", {
          class: "btn btn--filled btn--sm", style: { flex: 1 },
          text: "▶ Preview", onclick: preview,
        }),
        el("button", {
          class: "btn btn--ghost btn--sm", style: { flex: 1 },
          text: "Effacer", onclick: () => setSync({ source: null }),
        }),
      ]) : null,
      sync.source ? el("pre", {
        style: {
          margin: "8px 0 0",
          padding: "10px 12px",
          background: "var(--surface-2)",
          boxShadow: "var(--shadow-inset)",
          borderRadius: "6px",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--ink-secondary)",
          lineHeight: "1.55",
          whiteSpace: "pre-wrap",
        },
        text: declSyntax,
      }) : null,
    ]));
  }

  _drawCurve(canv, easing) {
    const ctx = canv.getContext("2d");
    const w = canv.width, h = canv.height;
    ctx.clearRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke();
    }
    const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
    const points = m ? m[1].split(",").map(Number) : [0, 0, 1, 1];
    ctx.strokeStyle = "#5e7bf9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = 1 - t;
      const x = 3 * u * u * t * points[0] + 3 * u * t * t * points[2] + t * t * t;
      const y = 3 * u * u * t * points[1] + 3 * u * t * t * points[3] + t * t * t;
      const cx = 8 + x * (w - 16);
      const cy = h - 8 - y * (h - 16);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // Endpoints
    ctx.fillStyle = "#5e7bf9";
    ctx.beginPath(); ctx.arc(8, h - 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w - 8, 8, 3, 0, Math.PI * 2); ctx.fill();
  }

  /* ── Docs tab ───────────────────────────────────────────── */

  _renderDocs(layer) {
    const container = this._group("Documentation Markdown", []);
    this.body.append(container);
    mountMarkdownEditor({
      container: container.querySelector(".group__body"),
      value: layer.content?.markdown || "",
      onChange: (v) => this._patchContent(layer.id, "markdown", v, /*noHistory*/ true),
      onCommit: (v) => this._patchContent(layer.id, "markdown", v, false),
    });
  }

  /* ── Helpers ────────────────────────────────────────────── */

  _group(title, children) {
    return el("div", { class: "group" }, [
      el("div", { class: "group__head" }, [
        el("span", { class: "group__title", text: title }),
      ]),
      el("div", { class: "group__body" }, children.filter(Boolean)),
    ]);
  }

  _row(label, control) {
    return el("div", { class: "field" }, [
      el("span", { class: "field__label", text: label }),
      control,
    ]);
  }

  _colorSwatch(value, onChange) {
    const wrap = el("label", { class: "color-swatch", style: { position: "relative" } });
    wrap.style.setProperty("--swatch-color", value);
    const chip = el("span", { class: "color-swatch__chip" });
    const txt  = el("span", { class: "color-swatch__value", text: value });
    const inp  = el("input", { type: "color", value: /^#/.test(value) ? value : "#5e7bf9",
      onchange: (e) => {
        wrap.style.setProperty("--swatch-color", e.target.value);
        txt.textContent = e.target.value;
        onChange(e.target.value);
      },
    });
    wrap.append(chip, txt, inp);
    return wrap;
  }

  _slider(value, min, max, step, onChange, suffix = "") {
    const wrap = el("div", { class: "slider" });
    const inp = el("input", { type: "range", min, max, step, value });
    const val = el("span", { class: "slider__value", text: suffix ? `${round(value, 2)}${suffix}` : String(round(value, 2)) });
    const setFill = () => {
      const pct = ((value - min) / (max - min)) * 100;
      wrap.style.setProperty("--slider-fill", `${pct}%`);
    };
    setFill();
    inp.oninput = (e) => {
      value = parseFloat(e.target.value);
      val.textContent = suffix ? `${round(value, 2)}${suffix}` : String(round(value, 2));
      setFill();
      onChange(value);
    };
    wrap.append(inp, val);
    return wrap;
  }

  _toggleRow(label, value, onChange) {
    const btn = el("button", {
      class: `btn btn--filled btn--sm`,
      style: {
        justifyContent: "space-between",
        background: value ? "var(--accent-tint-strong)" : "var(--surface-2)",
        color: value ? "var(--accent-hover)" : "var(--ink-secondary)",
      },
      html: `<span>${label}</span><span style="font-family:var(--font-mono);font-size:10px">${value ? "ON" : "OFF"}</span>`,
      onclick: () => onChange(!value),
    });
    return el("div", { style: { display: "block", padding: "2px 0" } }, [btn]);
  }

  _select(options, value, onChange) {
    const sel = el("select", { class: "input--select", onchange: (e) => onChange(e.target.value) });
    for (const [v, label] of options) {
      const o = document.createElement("option");
      o.value = v; o.textContent = label;
      if (v === value) o.selected = true;
      sel.append(o);
    }
    return sel;
  }

  /* ── Mutations ─────────────────────────────────────────── */

  _patchName(id, name) {
    this.store.transaction(s => {
      const l = findLayer(s.document.layers, id);
      if (l) l.name = name;
      return { id };
    }, "update");
  }
  _patchTransform(id, patch) {
    this.store.transaction(s => {
      const l = findLayer(s.document.layers, id);
      if (l) Object.assign(l.transform, patch);
      return { id };
    }, "layer:transform");
  }
  _patchStyle(id, patch) {
    this.store.transaction(s => {
      const l = findLayer(s.document.layers, id);
      if (l) Object.assign(l.style, patch);
      return { id };
    }, "layer:style");
  }
  _patchMotion(id, patch) {
    this.store.transaction(s => {
      const l = findLayer(s.document.layers, id);
      if (l) Object.assign(l.motion, patch);
      return { id };
    }, "update");
  }
  _patchContent(id, key, value, noHistory = false) {
    const fn = noHistory ? "patch" : "transaction";
    this.store[fn](s => {
      const l = findLayer(s.document.layers, id);
      if (l) { l.content = l.content || {}; l.content[key] = value; }
      return { id };
    }, "update");
  }
  _duplicate(id) {
    import("./util.js").then(({ uid }) => {
      import("./store.js").then(({ findParent }) => {
        this.store.transaction(s => {
          const l = findLayer(s.document.layers, id);
          const parent = findParent(s.document.layers, id);
          if (!l) return;
          const cp = JSON.parse(JSON.stringify(l));
          const relabel = (n) => {
            n.id = uid(n.type.slice(0, 1));
            (n.children || []).forEach(relabel);
          };
          relabel(cp);
          cp.transform.x += 24; cp.transform.y += 24;
          cp.name = cp.name + " copie";
          if (parent) parent.children.push(cp);
          else s.document.layers.push(cp);
          s.selection = [cp.id];
        }, "update");
      });
    });
  }
}
