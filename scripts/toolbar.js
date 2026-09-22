/* Floating shape toolbar — Apple/Figma-style
   Tools:
   - V  Select
   - R  Rectangle
   - O  Circle / Ellipse
   - D  Dot (pulsing)
   - T  Text
   - L  Line / Connector (arrow)
   - I  Image import
*/

import { el, toast, uid } from "./util.js";
import { ICONS } from "./icons.js";
import { makeShape, findLayer } from "./store.js";

export const TOOLS = [
  { id: "select",    label: "Sélection",  key: "V", icon: ICONS.cursor },
  { id: "rect",      label: "Rectangle",  key: "R", icon: ICONS.rect },
  { id: "circle",    label: "Cercle",     key: "O", icon: circleIcon() },
  { id: "dot",       label: "Point pulsé",key: "D", icon: dotIcon() },
  { id: "text",      label: "Texte",      key: "T", icon: ICONS.text },
  { id: "connector", label: "Connecteur", key: "L", icon: connectorIcon() },
  { id: "image",     label: "Image",      key: "I", icon: ICONS.image },
];

function circleIcon() {
  return `<svg class="icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/></svg>`;
}
function dotIcon() {
  return `<svg class="icon" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="2.2"/><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/></svg>`;
}
function connectorIcon() {
  return `<svg class="icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 10 Q7 3 11 6"/><path d="M9.5 3.5L11 6l-2.5 1.2"/></svg>`;
}

export class ShapeToolbar {
  constructor({ store, root, canvas }) {
    this.store = store;
    this.root = root;
    this.canvas = canvas;
    this.tool = "select";
    this.drawing = null;
    this._build();
    this._bindGlobal();
  }

  _build() {
    this.root.innerHTML = "";
    this.root.className = "shape-toolbar";
    for (const t of TOOLS) {
      const btn = el("button", {
        class: `tool-btn${t.id === this.tool ? " is-active" : ""}`,
        "data-tool": t.id,
        "aria-label": `${t.label} (${t.key})`,
        title: `${t.label} · ${t.key}`,
        html: t.icon,
        onclick: () => this.setTool(t.id),
      });
      const kbd = el("span", { class: "tool-btn__kbd", text: t.key });
      btn.append(kbd);
      this.root.append(btn);
    }
  }

  setTool(id) {
    this.tool = id;
    this.root.querySelectorAll(".tool-btn").forEach(b => b.classList.toggle("is-active", b.dataset.tool === id));
    // Update stage cursor hint
    const stageEl = this.canvas.root;
    stageEl.dataset.tool = id;
    if (id === "image") this._pickImage();
  }

  _bindGlobal() {
    document.addEventListener("keydown", (e) => {
      const inField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) { this.setTool(t.id); e.preventDefault(); }
    });

    // Canvas drag-to-draw
    const stageEl = this.canvas.root;
    const viewport = this.canvas.viewport;
    viewport.addEventListener("mousedown", (e) => {
      if (this.tool === "select" || this.tool === "image") return;
      if (e.button !== 0) return;
      // Ignore clicks on existing nodes / handles / hud / topbar
      const targ = e.target;
      if (targ.closest(".node") || targ.closest(".handle") || targ.closest(".connector-handle") || targ.closest(".canvas-hud")) return;
      if (this.store.state.mode !== "edit") return;

      e.preventDefault();
      const start = this._toCanvasCoords(e);
      this.drawing = { tool: this.tool, start, current: { ...start } };
      window.addEventListener("mousemove", this._onDrawMove);
      window.addEventListener("mouseup", this._onDrawUp);
    });
    this._onDrawMove = (e) => {
      if (!this.drawing) return;
      this.drawing.current = this._toCanvasCoords(e);
      // Live preview: we insert immediately if size > threshold
      const dx = Math.abs(this.drawing.current.x - this.drawing.start.x);
      const dy = Math.abs(this.drawing.current.y - this.drawing.start.y);
      if (!this.drawing.id && (dx > 4 || dy > 4)) this._createShape();
      if (this.drawing.id) this._updateShape();
    };
    this._onDrawUp = () => {
      window.removeEventListener("mousemove", this._onDrawMove);
      window.removeEventListener("mouseup", this._onDrawUp);
      const d = this.drawing;
      this.drawing = null;
      if (d?.id) {
        this.store.transaction(() => {}, "commit");
        // After creation, snap back to Select
        this.setTool("select");
      }
    };
  }

  _toCanvasCoords(e) {
    const rect = this.canvas.stage.getBoundingClientRect();
    const zoom = this.canvas.zoom;
    return {
      x: Math.round((e.clientX - rect.left) / zoom),
      y: Math.round((e.clientY - rect.top)  / zoom),
    };
  }

  _createShape() {
    const d = this.drawing;
    const { x: x1, y: y1 } = d.start;
    const { x: x2, y: y2 } = d.current;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.max(4, Math.abs(x2 - x1));
    const h = Math.max(4, Math.abs(y2 - y1));

    let layer;
    if (d.tool === "connector") {
      layer = makeShape.connector({
        from: { x: x1, y: y1 },
        to:   { x: x2, y: y2 },
        transform: { x, y, w, h, rot: 0 },
      });
    } else if (d.tool === "dot") {
      const size = Math.max(w, h, 16);
      layer = makeShape.dot({ transform: { x: (x1 + x2)/2 - size/2, y: (y1 + y2)/2 - size/2, w: size, h: size, rot: 0 } });
    } else if (d.tool === "circle") {
      layer = makeShape.circle({ transform: { x, y, w, h, rot: 0 } });
    } else if (d.tool === "text") {
      layer = makeShape.text({ transform: { x, y, w: Math.max(120, w), h: Math.max(28, h), rot: 0 } });
    } else {
      layer = makeShape.rect({ transform: { x, y, w, h, rot: 0 } });
    }

    d.id = layer.id;
    this.store.patch(s => {
      s.document.layers.push(layer);
      s.selection = [layer.id];
    }, "update");
  }

  _updateShape() {
    const d = this.drawing;
    const { x: x1, y: y1 } = d.start;
    const { x: x2, y: y2 } = d.current;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.max(4, Math.abs(x2 - x1));
    const h = Math.max(4, Math.abs(y2 - y1));
    this.store.patch(s => {
      const l = findLayer(s.document.layers, d.id);
      if (!l) return;
      if (l.type === "connector") {
        l.from = { x: x1, y: y1 };
        l.to   = { x: x2, y: y2 };
      } else if (l.type === "dot") {
        const size = Math.max(w, h, 16);
        l.transform.x = (x1 + x2)/2 - size/2;
        l.transform.y = (y1 + y2)/2 - size/2;
        l.transform.w = size; l.transform.h = size;
      } else {
        l.transform.x = x; l.transform.y = y;
        l.transform.w = w; l.transform.h = h;
      }
    }, "layer:transform");
  }

  _pickImage() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) { this.setTool("select"); return; }
      const src = await this._readDataUrl(f);
      const dims = await this._imgDims(src);
      const w = Math.min(400, dims.w || 200);
      const h = Math.round(w * (dims.h / (dims.w || 1))) || 200;
      const doc = this.store.state.document;
      // Drop it at the center of the current viewport
      const cx = doc.viewport.w / 2 - w / 2;
      const cy = doc.viewport.h / 2 - h / 2;
      this.store.transaction(s => {
        const layer = makeShape.image({
          name: f.name.replace(/\.[^.]+$/, "") || "Image",
          transform: { x: Math.round(cx), y: Math.round(cy), w, h, rot: 0 },
          style: { ...makeShape.image().style, src },
        });
        s.document.layers.push(layer);
        s.selection = [layer.id];
      }, "update");
      toast(`Image "${f.name}" ajoutée`);
      this.setTool("select");
    };
    input.click();
  }
  _readDataUrl(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
  }
  _imgDims(src) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ w: 0, h: 0 });
      img.src = src;
    });
  }
}
