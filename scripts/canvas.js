/* Canvas — WYSIWYG render + direct manipulation (drag, resize, rotate) */

import { $, $$, el, clamp, round, md } from "./util.js";
import { findLayer, walk } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";

const MIN_SIZE = 8;

export class CanvasView {
  constructor({ store, root, hud, flyout }) {
    this.store = store;
    this.root = root;
    this.hud = hud;
    this.flyout = flyout;
    this.viewport = el("div", { class: "viewport" });
    this.canvas   = el("div", { class: "canvas" });
    this.stage    = el("div", { class: "canvas__stage" });
    this.bg       = el("img", { class: "canvas__background", alt: "" });
    this.overlay  = el("div", { class: "canvas__overlay" });
    this.handles  = el("div", { class: "handles hidden" });
    this.dimOverlay = el("div", { class: "dim-overlay hidden" });

    this.stage.append(this.bg, this.overlay, this.handles, this.dimOverlay);
    this.canvas.append(this.stage);
    this.viewport.append(this.canvas);
    this.root.append(this.viewport);

    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.nodeMap = new Map(); // layerId -> DOM

    this._bind();
    this.store.on("replace", () => this.renderAll());
    this.store.on("update",  ({ kind } = {}) => {
      if (kind === "viewport") this.applyTransform();
      else this.renderAll();
    });
    this.store.on("layer:transform", (p) => this.updateNode(p?.id));
    this.store.on("layer:style",     (p) => this.updateNode(p?.id));
    this.store.on("selection",       () => this.updateSelection());
    this.store.on("hover",           () => this.updateHover());
    this.store.on("mode",            () => this.updateMode());
  }

  _bind() {
    // Click on empty stage: clear selection
    this.viewport.addEventListener("mousedown", (e) => {
      if (e.target === this.viewport || e.target === this.canvas || e.target === this.stage) {
        this.store.patch(s => { s.selection = []; }, "selection");
      }
    });

    // Pan (space or middle button)
    let panning = false;
    let panStart = null;
    let spaceDown = false;
    document.addEventListener("keydown", e => {
      if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA" && !document.activeElement.isContentEditable) {
        spaceDown = true;
        this.viewport.style.cursor = "grab";
      }
    });
    document.addEventListener("keyup", e => {
      if (e.code === "Space") { spaceDown = false; this.viewport.style.cursor = ""; }
    });
    this.viewport.addEventListener("mousedown", e => {
      if (spaceDown || e.button === 1) {
        panning = true;
        panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
        this.canvas.classList.add("is-panning");
        this.viewport.style.cursor = "grabbing";
        e.preventDefault();
      }
    });
    window.addEventListener("mousemove", e => {
      if (!panning) return;
      this.pan.x = e.clientX - panStart.x;
      this.pan.y = e.clientY - panStart.y;
      this.applyTransform();
    });
    window.addEventListener("mouseup", () => {
      if (panning) { panning = false; this.canvas.classList.remove("is-panning"); this.viewport.style.cursor = spaceDown ? "grab" : ""; }
    });

    // Zoom with wheel (ctrl/cmd)
    this.viewport.addEventListener("wheel", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2 - this.pan.x;
      const cy = e.clientY - rect.top  - rect.height / 2 - this.pan.y;
      const oldZoom = this.zoom;
      const factor = Math.pow(0.999, e.deltaY);
      this.zoom = clamp(oldZoom * factor, 0.15, 4);
      this.pan.x -= cx * (this.zoom / oldZoom - 1);
      this.pan.y -= cy * (this.zoom / oldZoom - 1);
      this.applyTransform();
      this._pushViewport();
    }, { passive: false });
  }

  _pushViewport() {
    this.store.patch(s => { s.viewport = { zoom: this.zoom, pan: { ...this.pan } }; }, "update");
    this.hud?.updateZoom(this.zoom);
  }

  applyTransform() {
    const doc = this.store.state.document;
    const rect = this.viewport.getBoundingClientRect();
    // Center the canvas in the viewport, then apply user pan + zoom
    const cx = (rect.width  - doc.viewport.w * this.zoom) / 2 + this.pan.x;
    const cy = (rect.height - doc.viewport.h * this.zoom) / 2 + this.pan.y;
    this.canvas.style.transform = `translate(${cx}px, ${cy}px) scale(${this.zoom})`;
    this._alignHandles();
  }

  fitToScreen() {
    const doc = this.store.state.document;
    const rect = this.viewport.getBoundingClientRect();
    const scale = Math.min(
      (rect.width  - 120) / doc.viewport.w,
      (rect.height - 120) / doc.viewport.h,
    );
    this.zoom = clamp(scale, 0.15, 2);
    this.pan = { x: 0, y: 0 };
    this.applyTransform();
    this._pushViewport();
  }

  setZoom(z) {
    this.zoom = clamp(z, 0.15, 4);
    this.applyTransform();
    this._pushViewport();
  }

  /* ── Rendering ────────────────────────────────────────────── */

  renderAll() {
    const doc = this.store.state.document;
    this.stage.style.width  = doc.viewport.w + "px";
    this.stage.style.height = doc.viewport.h + "px";
    this.canvas.style.marginLeft = -(doc.viewport.w / 2) + "px";
    this.canvas.style.marginTop  = -(doc.viewport.h / 2) + "px";
    this.stage.style.background = doc.viewport.paper || "#fdfaf3";
    // margin trick no longer needed — centered via applyTransform()
    this.canvas.style.marginLeft = "0";
    this.canvas.style.marginTop  = "0";

    // Background image
    if (doc.background?.src) {
      this.bg.src = doc.background.src;
      this.bg.style.display = "block";
    } else {
      this.bg.removeAttribute("src");
      this.bg.style.display = "none";
    }

    // Clear overlay, rebuild
    this.overlay.innerHTML = "";
    this.nodeMap.clear();
    for (const layer of doc.layers) this._renderLayer(layer, this.overlay);
    this.updateMode();
    this.updateSelection();
    this.updateHover();
  }

  _renderLayer(layer, parent) {
    const node = el("div", {
      class: `node node--${layer.type}`,
      "data-id": layer.id,
    });
    parent.append(node);
    this.nodeMap.set(layer.id, node);
    this._styleNode(node, layer);

    if (layer.children?.length) {
      const childHost = el("div", { style: { position: "absolute", inset: 0 } });
      // Children coordinates are absolute (in stage coords), so instead of nesting we render on root overlay.
      // But we still walk children:
      for (const c of layer.children) this._renderLayer(c, this.overlay);
    }
    this._attachInteractions(node, layer);
  }

  _styleNode(node, layer) {
    const t = layer.transform;
    node.style.left   = t.x + "px";
    node.style.top    = t.y + "px";
    node.style.width  = t.w + "px";
    node.style.height = t.h + "px";
    node.style.transform = t.rot ? `rotate(${t.rot}deg)` : "";
    const s = layer.style;
    node.style.background   = s.fill || "transparent";
    node.style.borderRadius = (s.radius || 0) + "px";
    node.style.opacity      = s.opacity ?? 1;
    if (s.stroke && s.strokeWidth) {
      node.style.border = `${s.strokeWidth}px ${s.strokeDash ? "dashed" : "solid"} ${s.stroke}`;
      if (s.strokeDash) node.style.borderStyle = "dashed";
    } else {
      node.style.border = "none";
    }
    node.style.boxShadow    = s.shadow || "none";
    if (s.backdrop) {
      node.style.backdropFilter = s.backdrop;
      node.style.webkitBackdropFilter = s.backdrop;
    } else {
      node.style.backdropFilter = "";
      node.style.webkitBackdropFilter = "";
    }
    node.style.setProperty("--zone-color", RAG_ZONES[layer.zone]?.color || "var(--accent)");

    node.classList.toggle("is-hidden", !layer.visible);
    node.classList.toggle("is-locked", layer.locked);

    // Label chip
    let label = node.querySelector(":scope > .node__label");
    if (!label) {
      label = el("div", { class: "node__label" });
      node.append(label);
    }
    label.textContent = layer.name || layer.content?.label || layer.type;

    // Zone/hotspot text render
    let textEl = node.querySelector(":scope > .node__text");
    if (layer.type === "group" && layer.content?.label) {
      if (!textEl) {
        textEl = el("div", { class: "node__text" });
        textEl.style.alignItems = "flex-start";
        textEl.style.justifyContent = "flex-start";
        textEl.style.padding = "10px 14px";
        node.append(textEl);
      }
      textEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:${RAG_ZONES[layer.zone]?.color || 'var(--accent)'};display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${RAG_ZONES[layer.zone]?.color || 'var(--accent)'}"></span>${layer.content.label}</div>`;
      textEl.style.pointerEvents = "none";
    } else if (textEl) {
      textEl.remove();
    }
  }

  _attachInteractions(node, layer) {
    node.addEventListener("mouseenter", () => {
      if (this.store.state.mode === "edit") {
        this.store.patch(s => { s.hover = layer.id; }, "hover");
      }
    });
    node.addEventListener("mouseleave", () => {
      if (this.store.state.mode === "edit") {
        this.store.patch(s => { s.hover = null; }, "hover");
      }
    });
    node.addEventListener("mousedown", (e) => {
      if (layer.locked) return;
      e.stopPropagation();
      if (this.store.state.mode === "preview") return;
      const additive = e.shiftKey;
      this.store.patch(s => {
        if (additive) {
          if (s.selection.includes(layer.id)) s.selection = s.selection.filter(id => id !== layer.id);
          else s.selection.push(layer.id);
        } else {
          s.selection = [layer.id];
        }
      }, "selection");
      this._startDrag(e, layer);
    });
    node.addEventListener("click", (e) => {
      if (this.store.state.mode === "preview" && layer.type === "hotspot") {
        e.stopPropagation();
        this.flyout?.open(layer.id);
        this.store.patch(s => { s.selection = [layer.id]; }, "selection");
      }
    });
  }

  _startDrag(e, layer) {
    const startX = e.clientX, startY = e.clientY;
    const t0 = { ...layer.transform };
    const zoom = this.zoom;
    let moved = false;

    const move = (ev) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) moved = true;
      if (!moved) return;
      const snap = ev.shiftKey ? 8 : 1;
      const nx = Math.round((t0.x + dx) / snap) * snap;
      const ny = Math.round((t0.y + dy) / snap) * snap;
      // Move layer + children by delta (delta relative to original position)
      this.store.patch(s => {
        const target = findLayer(s.document.layers, layer.id);
        if (!target) return;
        const ddx = nx - target.transform.x;
        const ddy = ny - target.transform.y;
        target.transform.x = nx;
        target.transform.y = ny;
        walk(target.children || [], n => { n.transform.x += ddx; n.transform.y += ddy; });
      }, "layer:transform");
      this._emitBatch(layer.id);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (moved) {
        this.store.transaction(() => {}, "commit");
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  _emitBatch(id) {
    const layer = findLayer(this.store.state.document.layers, id);
    if (layer) {
      this.updateNode(id);
      // Update descendants too (a moved group carries its children)
      walk(layer.children || [], (c) => this.updateNode(c.id));
    }
    this._alignHandles();
    this.store.emit("layer:transform", { id });
  }

  updateNode(id) {
    if (!id) return;
    const layer = findLayer(this.store.state.document.layers, id);
    const node = this.nodeMap.get(id);
    if (layer && node) this._styleNode(node, layer);
  }

  updateSelection() {
    const sel = new Set(this.store.state.selection);
    this.nodeMap.forEach((node, id) => {
      node.classList.toggle("is-selected", sel.has(id));
    });
    this._alignHandles();
  }

  updateHover() {
    const hover = this.store.state.hover;
    this.nodeMap.forEach((node, id) => node.classList.toggle("is-hover", id === hover));
  }

  updateMode() {
    const mode = this.store.state.mode;
    this.root.classList.toggle("mode-edit", mode === "edit");
    this.root.classList.toggle("mode-preview", mode === "preview");
    this._alignHandles();
    if (mode !== "preview") this.flyout?.close();
    this.root.classList.remove("has-focus");
  }

  /* ── Handles (resize/rotate) ──────────────────────────────── */

  _alignHandles() {
    const sel = this.store.state.selection;
    const singleId = sel.length === 1 ? sel[0] : null;
    const layer = singleId ? findLayer(this.store.state.document.layers, singleId) : null;
    const isEdit = this.store.state.mode === "edit";

    if (!layer || !isEdit || layer.locked) {
      this.handles.classList.add("hidden");
      this.dimOverlay.classList.add("hidden");
      return;
    }
    const t = layer.transform;
    this.handles.style.left   = t.x + "px";
    this.handles.style.top    = t.y + "px";
    this.handles.style.width  = t.w + "px";
    this.handles.style.height = t.h + "px";
    this.handles.style.transform = t.rot ? `rotate(${t.rot}deg)` : "";
    this.handles.classList.remove("hidden");

    // Populate handles once
    if (!this.handles.children.length) {
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(h => {
        const dot = el("div", { class: "handle", "data-h": h });
        this._bindResize(dot, h);
        this.handles.append(dot);
      });
      const rot = el("div", { class: "handle handle--rot", "data-h": "rot" });
      this._bindRotate(rot);
      this.handles.append(rot);
    }

    // Dim overlay
    this.dimOverlay.classList.remove("hidden");
    this.dimOverlay.style.left = (t.x + t.w / 2) + "px";
    this.dimOverlay.style.top  = (t.y + t.h) + "px";
    this.dimOverlay.textContent = `${Math.round(t.w)} × ${Math.round(t.h)}`;

    this.overlay.append(this.handles);
  }

  _bindResize(dot, dir) {
    dot.addEventListener("mousedown", (e) => {
      e.stopPropagation(); e.preventDefault();
      const sel = this.store.state.selection[0];
      const layer = findLayer(this.store.state.document.layers, sel);
      if (!layer) return;
      const t0 = { ...layer.transform };
      const startX = e.clientX, startY = e.clientY;
      const zoom = this.zoom;
      let moved = false;

      const move = (ev) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        if (!moved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) moved = true;
        if (!moved) return;
        let { x, y, w, h } = t0;
        if (dir.includes("e")) w = Math.max(MIN_SIZE, t0.w + dx);
        if (dir.includes("w")) { w = Math.max(MIN_SIZE, t0.w - dx); x = t0.x + (t0.w - w); }
        if (dir.includes("s")) h = Math.max(MIN_SIZE, t0.h + dy);
        if (dir.includes("n")) { h = Math.max(MIN_SIZE, t0.h - dy); y = t0.y + (t0.h - h); }
        if (ev.shiftKey) {
          const ratio = t0.w / t0.h;
          if (dir.length === 2) {
            if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
            else w = h * ratio;
            if (dir.includes("w")) x = t0.x + (t0.w - w);
            if (dir.includes("n")) y = t0.y + (t0.h - h);
          }
        }
        this.store.patch(s => {
          const target = findLayer(s.document.layers, sel);
          if (!target) return;
          target.transform.x = Math.round(x);
          target.transform.y = Math.round(y);
          target.transform.w = Math.round(w);
          target.transform.h = Math.round(h);
        }, "layer:transform");
        this._emitBatch(sel);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (moved) this.store.transaction(() => {}, "commit");
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  }

  _bindRotate(dot) {
    dot.addEventListener("mousedown", (e) => {
      e.stopPropagation(); e.preventDefault();
      const sel = this.store.state.selection[0];
      const layer = findLayer(this.store.state.document.layers, sel);
      if (!layer) return;
      const t = layer.transform;
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const rect = this.stage.getBoundingClientRect();
      const zoom = this.zoom;
      const start0 = Math.atan2((e.clientY - rect.top) / zoom - cy, (e.clientX - rect.left) / zoom - cx);
      const rot0 = t.rot || 0;
      let moved = false;
      const move = (ev) => {
        const ang = Math.atan2((ev.clientY - rect.top) / zoom - cy, (ev.clientX - rect.left) / zoom - cx);
        let deg = rot0 + ((ang - start0) * 180 / Math.PI);
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        if (!moved && Math.abs(deg - rot0) > 0.5) moved = true;
        this.store.patch(s => {
          const target = findLayer(s.document.layers, sel);
          if (target) target.transform.rot = round(deg, 1);
        }, "layer:transform");
        this._emitBatch(sel);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (moved) this.store.transaction(() => {}, "commit");
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  }

  focusOn(id) {
    const layer = findLayer(this.store.state.document.layers, id);
    if (!layer) return;
    const t = layer.transform;
    const rect = this.viewport.getBoundingClientRect();
    const targetScale = Math.min(
      (rect.width  - 240) / t.w,
      (rect.height - 200) / t.h,
      1.6,
    );
    this.zoom = Math.max(0.4, targetScale);
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const doc = this.store.state.document;
    this.pan.x = -(cx - doc.viewport.w / 2) * this.zoom;
    this.pan.y = -(cy - doc.viewport.h / 2) * this.zoom;
    this.applyTransform();
    this._pushViewport();
    // Set focus class
    this.nodeMap.forEach((n, nid) => n.classList.toggle("is-focus", nid === id));
    this.root.classList.toggle("has-focus", true);
  }
}
