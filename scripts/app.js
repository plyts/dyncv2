/* App entry — wires everything */

import { $, el, toast } from "./util.js";
import { ICONS } from "./icons.js";
import { Store } from "./store.js";
import { ragScene } from "./preset-rag.js";
import { CanvasView } from "./canvas.js";
import { CanvasHud } from "./canvas-hud.js";
import { LayersTree } from "./layers-tree.js";
import { Inspector } from "./inspector.js";
import { Topbar } from "./topbar.js";
import { PreviewFlyout } from "./preview-flyout.js";
import { Exporter } from "./exporter.js";
import { Importer } from "./importer.js";
import { ShapeToolbar } from "./toolbar.js";
import { makeShape, findLayer } from "./store.js";
import { MotionEngine } from "./motion-engine.js";
import { initPanels } from "./panels.js";
import { PresetLibrary } from "./presets.js";

const initialState = {
  document: ragScene(),
  selection: [],
  hover: null,
  mode: "edit",           // 'edit' | 'preview'
  viewport: { zoom: 1, pan: { x: 0, y: 0 } },
  theme: "dark",
};

const store = new Store(initialState);
window.__store = store; // dev access

// Persist on unload
window.addEventListener("beforeunload", () => {
  try {
    sessionStorage.setItem("dyncv:doc", JSON.stringify(store.state.document));
  } catch {}
});
// Restore
try {
  const saved = sessionStorage.getItem("dyncv:doc");
  if (saved) {
    const doc = JSON.parse(saved);
    if (doc && doc.layers) store.state.document = doc;
  }
} catch {}

// Mount
const appRoot   = $(".app");
const topbarEl  = $(".topbar");
const leftEl    = $(".panel-left");
const stageEl   = $(".stage");
const hudEl     = $(".canvas-hud");
const rightEl   = $(".panel-right");
const statusEl  = $(".statusbar");
const flyoutEl  = $(".preview-flyout");
const workspaceEl = $(".workspace");

// Resizable + collapsible side panels
const panels = initPanels({
  app: appRoot, workspace: workspaceEl, leftPanel: leftEl, rightPanel: rightEl,
  onResize: () => { syncToggleIcons(); canvas?.applyTransform?.(); },
});

// Floating collapse toggles
const chevronL = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L5 7l4 4"/></svg>`;
const chevronR = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l4 4-4 4"/></svg>`;
const leftToggle = el("button", {
  class: "panel-toggle panel-toggle--left",
  title: "Afficher / masquer les calques (Cmd/Ctrl+\\)",
  onclick: () => { panels.toggleLeft(); syncToggleIcons(); },
});
const rightToggle = el("button", {
  class: "panel-toggle panel-toggle--right",
  title: "Afficher / masquer l'inspecteur",
  onclick: () => { panels.toggleRight(); syncToggleIcons(); },
});
workspaceEl.append(leftToggle, rightToggle);
function syncToggleIcons() {
  leftToggle.innerHTML  = panels.isLeftCollapsed()  ? chevronR : chevronL;
  rightToggle.innerHTML = panels.isRightCollapsed() ? chevronL : chevronR;
  leftToggle.style.left  = panels.isLeftCollapsed()  ? "0" : "calc(var(--left-panel-w) - 11px)";
  rightToggle.style.right = panels.isRightCollapsed() ? "0" : "calc(var(--right-panel-w) - 11px)";
}
syncToggleIcons();
window.addEventListener("resize", syncToggleIcons);

const flyout = new PreviewFlyout({
  store,
  root: flyoutEl,
  onFocus: (id) => canvas.focusOn(id),
  onClose: () => {
    stageEl.classList.remove("has-focus");
    canvas.nodeMap.forEach(n => n.classList.remove("is-focus"));
  },
});
const canvas = new CanvasView({ store, root: stageEl, flyout });
const hud    = new CanvasHud({ store, root: hudEl, canvas });
canvas.hud   = hud;

// Floating shape toolbar
const toolbarEl = document.createElement("div");
stageEl.append(toolbarEl);
const shapeToolbar = new ShapeToolbar({ store, root: toolbarEl, canvas });

// Motion Choreography Engine + timeline HUD
const motion = new MotionEngine({ store, canvas });
window.__motion = motion;
motion.play();

const tlHud = document.createElement("div");
tlHud.className = "timeline-hud";
tlHud.innerHTML = `
  <button id="tlPlay" title="Lecture / pause de la timeline">
    <svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><path d="M4 3h2v8H4zM8 3h2v8H8z"/></svg>
  </button>
  <div class="timeline-hud__pill"><span id="tlHead"></span></div>
  <span class="timeline-hud__evt" id="tlEvt">IDLE</span>
  <button id="tlDemo" class="timeline-hud__demo" title="Rejouer toute la chorégraphie">
    <svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><path d="M4 3l7 4-7 4V3z"/></svg>
    <span>Jouer</span>
  </button>
`;
stageEl.append(tlHud);
tlHud.querySelector("#tlDemo").onclick = () => {
  const n = motion.playChoreographyOnce();
  toast(n ? `Chorégraphie jouée — ${n} effet${n > 1 ? "s" : ""}` : "Aucune synchronisation configurée");
};

const tlHead = tlHud.querySelector("#tlHead");
const tlEvt  = tlHud.querySelector("#tlEvt");
const tlPlay = tlHud.querySelector("#tlPlay");
let tlPlaying = true;
tlPlay.onclick = () => {
  tlPlaying = !tlPlaying;
  if (tlPlaying) motion.play(); else motion.pause();
  tlPlay.innerHTML = tlPlaying
    ? `<svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><path d="M4 3h2v8H4zM8 3h2v8H8z"/></svg>`
    : `<svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><path d="M4 3l7 4-7 4V3z"/></svg>`;
};

// Drive the master head from motion engine's phase (average of tracks)
function drawTlHead() {
  let head = 0, n = 0;
  motion.tracks.forEach(t => { head += t.phase; n++; });
  const pct = n ? (head / n) * 100 : 0;
  tlHead.style.transform = `translateX(${pct * 2.14}px)`;
  requestAnimationFrame(drawTlHead);
}
drawTlHead();

motion.onAnyTrigger((event, payload) => {
  const parts = event.split(":phase:");
  tlEvt.textContent = "◆ " + (parts[1] || "").toUpperCase();
  tlEvt.style.color = "var(--accent-hover)";
  setTimeout(() => { tlEvt.style.color = "var(--ink-tertiary)"; tlEvt.textContent = "IDLE"; }, 250);
});

// Drag-drop images anywhere on the canvas
["dragover", "drop"].forEach(ev => stageEl.addEventListener(ev, (e) => e.preventDefault()));
stageEl.addEventListener("drop", async (e) => {
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  for (const f of files) {
    const src = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    const dims = await new Promise(res => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 200, h: 140 }); img.src = src; });
    const stageRect = canvas.stage.getBoundingClientRect();
    const zoom = canvas.zoom;
    const cx = Math.round((e.clientX - stageRect.left) / zoom);
    const cy = Math.round((e.clientY - stageRect.top) / zoom);
    const w = Math.min(400, dims.w || 200);
    const h = Math.round(w * (dims.h / (dims.w || 1))) || 140;
    store.transaction(s => {
      const layer = makeShape.image({
        name: f.name.replace(/\.[^.]+$/, "") || "Image",
        transform: { x: cx - w / 2, y: cy - h / 2, w, h, rot: 0 },
        style: { ...makeShape.image().style, src },
      });
      s.document.layers.push(layer);
      s.selection = [layer.id];
    }, "update");
  }
});

const inspector = new Inspector({
  store, root: rightEl,
  onFocus: (id) => canvas.focusOn(id),
});
const layers = new LayersTree({ store, root: leftEl });

const exporter = new Exporter({ store });
const importer = new Importer({ store, onDone: () => canvas.fitToScreen() });
const library  = new PresetLibrary({ store, canvas });
window.__library = library;
inspector.library = library;

const topbar = new Topbar({
  store, root: topbarEl,
  onExport:   () => exporter.open(),
  onDownload: () => exporter.download(),
  onImport:   () => importer.openDialog(),
  onLibrary:  () => library.openLibrary(),
  onFit:      () => canvas.fitToScreen(),
  onUndo:     () => store.undo(),
  onRedo:     () => store.redo(),
  onTheme:    () => toggleTheme(),
});

// Statusbar
function renderStatus() {
  const doc = store.state.document;
  statusEl.innerHTML = "";
  statusEl.append(
    el("div", { class: "statusbar__item" }, [
      el("span", { class: "statusbar__dot" }),
      el("span", { text: store.state.mode === "edit" ? "ÉDITION" : "PREVIEW" }),
    ]),
    el("div", { class: "statusbar__item", text: `${countLayers(doc.layers)} calques` }),
    el("div", { class: "statusbar__item", text: `${doc.viewport.w} × ${doc.viewport.h}` }),
    el("div", { class: "statusbar__spacer" }),
    el("div", { class: "statusbar__item", text: "Cmd/Ctrl+Z — annuler · Space — panorama · Cmd/Ctrl+Molette — zoom" }),
  );
}
function countLayers(list) {
  let n = 0;
  const w = (arr) => arr.forEach(l => { n++; if (l.children) w(l.children); });
  w(list);
  return n;
}
store.on("*", renderStatus);
renderStatus();

// Sync app-level mode class
const syncAppMode = () => {
  appRoot.classList.toggle("mode-edit",    store.state.mode === "edit");
  appRoot.classList.toggle("mode-preview", store.state.mode === "preview");
};
store.on("mode", syncAppMode);
store.on("replace", syncAppMode);
syncAppMode();

// Theme toggle
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const icon = next === "dark" ? ICONS.sun : ICONS.moon;
  document.querySelector(".topbar__right button[title='Thème']").innerHTML = icon;
  toast(next === "dark" ? "Thème sombre" : "Thème clair");
}

// Global shortcuts
document.addEventListener("keydown", (e) => {
  const inField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
  if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); store.redo(); return; }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); exporter.download(); return; }
  if (mod && e.key === "\\") { e.preventDefault(); panels.toggleLeft(); syncToggleIcons(); return; }
  if (inField) return;

  if (e.key === "Escape") {
    if (flyoutEl.classList.contains("is-open")) { flyout.close(); return; }
    store.patch(s => { s.selection = []; }, "selection");
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    const sel = store.state.selection;
    if (sel.length) {
      e.preventDefault();
      store.transaction(s => {
        for (const id of sel) {
          const removeFrom = (arr) => {
            for (let i = 0; i < arr.length; i++) {
              if (arr[i].id === id) { arr.splice(i, 1); return true; }
              if (arr[i].children && removeFrom(arr[i].children)) return true;
            }
            return false;
          };
          removeFrom(s.document.layers);
        }
        s.selection = [];
      }, "update");
    }
  }
  if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    const sel = store.state.selection[0];
    if (sel) inspector._duplicate(sel);
  }
  if (mod && e.key.toLowerCase() === "0") { e.preventDefault(); canvas.fitToScreen(); }
  if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); canvas.setZoom(canvas.zoom * 1.2); }
  if (mod && e.key === "-") { e.preventDefault(); canvas.setZoom(canvas.zoom * 0.85); }
  if (e.key.toLowerCase() === "e") {
    store.patch(s => { s.mode = "edit"; }, "mode");
  }
  if (e.key.toLowerCase() === "p") {
    store.patch(s => { s.mode = "preview"; }, "mode");
  }
  // Arrow keys nudge — works for every object type (connectors move
  // both endpoints; groups carry their children).
  const selIds = store.state.selection;
  if (selIds.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp"   ? -step : e.key === "ArrowDown"  ? step : 0;
    store.transaction(s => {
      for (const id of selIds) {
        const l = findLayer(s.document.layers, id);
        if (!l) continue;
        l.transform.x += dx; l.transform.y += dy;
        if (l.type === "connector") {
          if (l.from) { l.from.x += dx; l.from.y += dy; }
          if (l.to)   { l.to.x += dx;   l.to.y += dy; }
        }
        // Move descendants of a group by the same delta
        if (l.children?.length) {
          const shift = (arr) => arr.forEach(c => {
            c.transform.x += dx; c.transform.y += dy;
            if (c.type === "connector") { if (c.from) { c.from.x += dx; c.from.y += dy; } if (c.to) { c.to.x += dx; c.to.y += dy; } }
            if (c.children) shift(c.children);
          });
          shift(l.children);
        }
      }
      return { id: selIds[0] };
    }, "layer:transform");
    // Refresh every moved node
    selIds.forEach(id => {
      canvas.updateNode(id);
      const l = findLayer(store.state.document.layers, id);
      if (l?.children) { const w = (arr) => arr.forEach(c => { canvas.updateNode(c.id); if (c.children) w(c.children); }); w(l.children); }
    });
    canvas._alignHandles();
  }
});

// Initial render + fit
canvas.renderAll();
requestAnimationFrame(() => canvas.fitToScreen());

// Welcome toast
setTimeout(() => toast("Bienvenue — clique sur un bloc, ou passe en mode Preview"), 400);
