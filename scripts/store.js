/* Central state store — pub/sub with fine-grained events and history */

import { clone, uid } from "./util.js";

const HISTORY_LIMIT = 60;

export class Store {
  constructor(initial) {
    this.state = initial;
    this._subs = new Map();      // event -> Set<fn>
    this._history = [];          // snapshots
    this._future  = [];
  }

  on(evt, fn) {
    if (!this._subs.has(evt)) this._subs.set(evt, new Set());
    this._subs.get(evt).add(fn);
    return () => this._subs.get(evt).delete(fn);
  }
  emit(evt, payload) {
    this._subs.get(evt)?.forEach(fn => fn(payload, this.state));
    this._subs.get("*")?.forEach(fn => fn({ evt, payload }, this.state));
  }

  /* ── Mutation helpers ──────────────────────────────────────── */
  transaction(mutator, evt = "update") {
    const snap = clone(this.state);
    this._history.push(snap);
    if (this._history.length > HISTORY_LIMIT) this._history.shift();
    this._future = [];
    const result = mutator(this.state);
    this.emit(evt, result);
    this.emit("history", { canUndo: this._history.length > 0, canRedo: false });
    return result;
  }

  /* No history — for fast-path (transient drag, hover, viewport) */
  patch(mutator, evt = "update") {
    const result = mutator(this.state);
    this.emit(evt, result);
    return result;
  }

  undo() {
    if (!this._history.length) return;
    this._future.push(clone(this.state));
    this.state = this._history.pop();
    this.emit("replace", this.state);
    this.emit("history", { canUndo: this._history.length > 0, canRedo: this._future.length > 0 });
  }
  redo() {
    if (!this._future.length) return;
    this._history.push(clone(this.state));
    this.state = this._future.pop();
    this.emit("replace", this.state);
    this.emit("history", { canUndo: this._history.length > 0, canRedo: this._future.length > 0 });
  }
}

/* ── Layer tree operations ─────────────────────────────────── */

export function findLayer(root, id) {
  if (!id) return null;
  const stack = [...root];
  while (stack.length) {
    const n = stack.pop();
    if (n.id === id) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

export function findParent(root, id, parent = null) {
  for (const n of root) {
    if (n.id === id) return parent;
    if (n.children) {
      const r = findParent(n.children, id, n);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

export function walk(root, fn, depth = 0, parent = null) {
  for (const n of root) {
    const r = fn(n, depth, parent);
    if (r === false) continue;
    if (n.children) walk(n.children, fn, depth + 1, n);
  }
}

export function removeLayer(root, id) {
  for (let i = 0; i < root.length; i++) {
    if (root[i].id === id) return root.splice(i, 1)[0];
    if (root[i].children) {
      const r = removeLayer(root[i].children, id);
      if (r) return r;
    }
  }
  return null;
}

/* ── Layer factory ─────────────────────────────────────────── */

export const defaultLayer = (over = {}) => ({
  id: uid("l"),
  name: "Layer",
  type: "rect",
  visible: true,
  locked: false,
  transform: { x: 100, y: 100, w: 200, h: 120, rot: 0 },
  style: {
    fill: "rgba(94,123,249,0.10)",
    stroke: "#5e7bf9",
    strokeWidth: 1.5,
    strokeDash: "6 4",
    radius: 12,
    opacity: 1,
    shadow: "0 8px 20px -10px rgba(0,0,0,0.5)",
    backdrop: "",
    animateDash: false,       // marching-ants animation
    dashSpeed: 1.2,           // seconds per cycle
  },
  motion: {
    duration: 240,
    easing: "cubic-bezier(0.2,0,0,1)",
    delay: 0,
    hover: "lift",
    entrance: "fade-up",
  },
  content: { label: "", markdown: "" },
  linkedTo: [],               // ids of layers to highlight when this one is selected
  zone: null,
  children: [],
  ...over,
});

/* ── Layer type templates — used by the floating toolbar ──── */

const _base = defaultLayer;

export const makeShape = {
  rect: (over) => _base({ name: "Rectangle", type: "rect", ...over }),
  circle: (over) => _base({
    name: "Cercle",
    type: "circle",
    transform: { x: 200, y: 200, w: 140, h: 140, rot: 0 },
    style: {
      fill: "rgba(94,123,249,0.10)", stroke: "#5e7bf9", strokeWidth: 1.5,
      strokeDash: "", radius: 999, opacity: 1, shadow: "", backdrop: "",
      animateDash: false, dashSpeed: 1.2,
    },
    ...over,
  }),
  dot: (over) => _base({
    name: "Point pulsé",
    type: "dot",
    transform: { x: 400, y: 400, w: 16, h: 16, rot: 0 },
    style: {
      fill: "#5e7bf9", stroke: "#5e7bf9", strokeWidth: 0,
      strokeDash: "", radius: 999, opacity: 1, shadow: "",
      backdrop: "", animateDash: false,
      pulseRings: 3,      // number of concentric halos
      pulseSpeed: 2.2,    // seconds per cycle
      pulseScale: 5,      // max radius multiplier
    },
    motion: { duration: 200, easing: "cubic-bezier(0.2,0,0,1)", delay: 0, hover: "glow", entrance: "fade-scale" },
    ...over,
  }),
  text: (over) => _base({
    name: "Texte",
    type: "text",
    transform: { x: 200, y: 200, w: 220, h: 40, rot: 0 },
    style: {
      fill: "transparent", stroke: "transparent", strokeWidth: 0,
      strokeDash: "", radius: 0, opacity: 1, shadow: "", backdrop: "",
      animateDash: false, textColor: "#0a0a10", textSize: 14, textWeight: 500, textAlign: "left",
    },
    content: { label: "Nouveau texte", markdown: "" },
    ...over,
  }),
  image: (over) => _base({
    name: "Image",
    type: "image",
    transform: { x: 200, y: 200, w: 220, h: 140, rot: 0 },
    style: {
      fill: "transparent", stroke: "transparent", strokeWidth: 0,
      strokeDash: "", radius: 12, opacity: 1, shadow: "",
      backdrop: "", animateDash: false, src: "",
      fit: "contain",
    },
    ...over,
  }),
  connector: (over) => _base({
    name: "Connecteur",
    type: "connector",
    transform: { x: 100, y: 100, w: 200, h: 60, rot: 0 },
    style: {
      fill: "transparent", stroke: "#5e7bf9", strokeWidth: 2,
      strokeDash: "6 6", radius: 0, opacity: 1, shadow: "", backdrop: "",
      animateDash: true, dashSpeed: 0.8,
      arrowEnd: true,
      curve: 0.5,          // 0 = straight, 1 = strong curve
    },
    // Points expressed in canvas coordinates
    from: { x: 100, y: 100 },
    to:   { x: 300, y: 160 },
    ...over,
  }),
};
