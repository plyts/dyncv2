/* Canvas HUD — zoom, coordinates, fit-to-screen */

import { el } from "./util.js";
import { ICONS } from "./icons.js";

export class CanvasHud {
  constructor({ store, root, canvas }) {
    this.store = store;
    this.root = root;
    this.canvas = canvas;
    this._build();
    this.store.on("update", ({ kind } = {}) => { if (kind === "viewport") this.updateZoom(this.canvas.zoom); });
    this.store.on("selection", () => this._renderInfo());
    this.store.on("layer:transform", () => this._renderInfo());
  }

  _build() {
    this.root.innerHTML = "";

    this.info = el("div", { class: "hud-pill" });
    this._renderInfo();

    const spacer = el("div", { class: "canvas-hud__spacer" });

    const zoomCluster = el("div", { class: "zoom-cluster" });
    const zOut = el("button", { html: ICONS.minus, title: "Zoom -", onclick: () => this.canvas.setZoom(this.canvas.zoom * 0.85) });
    this.zVal = el("button", { class: "zoom-cluster__value", text: "100 %", onclick: () => this.canvas.setZoom(1) });
    const zIn  = el("button", { html: ICONS.plus, title: "Zoom +", onclick: () => this.canvas.setZoom(this.canvas.zoom * 1.15) });
    const zFit = el("button", { html: ICONS.fit, title: "Adapter", onclick: () => this.canvas.fitToScreen() });
    zoomCluster.append(zOut, this.zVal, zIn, zFit);

    this.root.append(this.info, spacer, zoomCluster);
  }

  _renderInfo() {
    const sel = this.store.state.selection;
    if (sel.length === 0) {
      this.info.textContent = `${this.store.state.document.viewport.w} × ${this.store.state.document.viewport.h}`;
      return;
    }
    if (sel.length === 1) {
      const l = this.store.state.document.layers.flatMap(function flat(x) { return [x, ...(x.children || []).flatMap(flat)]; }).find(x => x.id === sel[0]);
      if (l) {
        this.info.innerHTML = `<span style="color:var(--ink-tertiary)">${l.name}</span> · <span>${Math.round(l.transform.x)},${Math.round(l.transform.y)}</span> · <span>${Math.round(l.transform.w)}×${Math.round(l.transform.h)}</span>`;
        return;
      }
    }
    this.info.textContent = `${sel.length} éléments sélectionnés`;
  }

  updateZoom(z) {
    this.zVal.textContent = Math.round(z * 100) + " %";
  }
}
