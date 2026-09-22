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

const inspector = new Inspector({
  store, root: rightEl,
  onFocus: (id) => canvas.focusOn(id),
});
const layers = new LayersTree({ store, root: leftEl });

const exporter = new Exporter({ store });
const importer = new Importer({ store, onDone: () => canvas.fitToScreen() });

const topbar = new Topbar({
  store, root: topbarEl,
  onExport:   () => exporter.open(),
  onDownload: () => exporter.download(),
  onImport:   () => importer.openDialog(),
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
  // Arrow keys nudge
  const sel = store.state.selection[0];
  if (sel && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    store.transaction(s => {
      const findAndNudge = (arr) => {
        for (const l of arr) {
          if (l.id === sel) {
            if (e.key === "ArrowUp")    l.transform.y -= step;
            if (e.key === "ArrowDown")  l.transform.y += step;
            if (e.key === "ArrowLeft")  l.transform.x -= step;
            if (e.key === "ArrowRight") l.transform.x += step;
            return true;
          }
          if (l.children && findAndNudge(l.children)) return true;
        }
      };
      findAndNudge(s.document.layers);
    }, "layer:transform");
  }
});

// Initial render + fit
canvas.renderAll();
requestAnimationFrame(() => canvas.fitToScreen());

// Welcome toast
setTimeout(() => toast("Bienvenue — clique sur un bloc, ou passe en mode Preview"), 400);
