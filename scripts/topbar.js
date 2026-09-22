/* Topbar: brand, doc title, mode segmented, actions */

import { el } from "./util.js";
import { ICONS } from "./icons.js";

export class Topbar {
  constructor({ store, root, onExport, onDownload, onImport, onFit, onZoom, onUndo, onRedo, onTheme }) {
    this.store = store;
    this.root = root;
    this.onExport = onExport;
    this.onDownload = onDownload;
    this.onImport = onImport;
    this.onFit = onFit;
    this.onZoom = onZoom;
    this.onUndo = onUndo;
    this.onRedo = onRedo;
    this.onTheme = onTheme;
    this._build();
    this.store.on("update",  () => this._syncTitle());
    this.store.on("replace", () => this._syncTitle());
    this.store.on("mode",    () => this._syncMode());
    this.store.on("history", ({ canUndo, canRedo }) => {
      this.undoBtn.disabled = !canUndo;
      this.redoBtn.disabled = !canRedo;
      this.undoBtn.style.opacity = canUndo ? 1 : 0.4;
      this.redoBtn.style.opacity = canRedo ? 1 : 0.4;
    });
  }

  _build() {
    this.root.innerHTML = "";

    // Left: brand
    const brand = el("div", { class: "topbar__brand" }, [
      el("div", { class: "brand-mark" }),
      el("div", { class: "brand-name" }, [
        document.createTextNode("Dyncv"),
        el("em", { text: "· Studio" }),
      ]),
    ]);

    // Center: title + mode
    const title = el("div", {
      class: "doc-title",
      contenteditable: "true",
      spellcheck: "false",
      text: this.store.state.document.name || "Sans titre",
      onblur: (e) => {
        const v = e.target.textContent.trim() || "Sans titre";
        e.target.textContent = v;
        this.store.transaction(s => { s.document.name = v; }, "update");
      },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } },
    });
    this.title = title;

    const mode = el("div", { class: "segmented", role: "tablist" }, [
      el("button", {
        class: "segmented__item is-active", "data-mode": "edit",
        text: "Édition", onclick: () => this._setMode("edit"),
      }),
      el("button", {
        class: "segmented__item", "data-mode": "preview",
        text: "Preview", onclick: () => this._setMode("preview"),
      }),
    ]);
    this.modeCtl = mode;

    const center = el("div", { class: "topbar__center" }, [title, mode]);

    // Right: actions
    this.undoBtn = el("button", {
      class: "btn btn--ghost btn--icon", title: "Annuler (Ctrl+Z)",
      html: ICONS.undo, onclick: () => this.onUndo?.(),
    });
    this.redoBtn = el("button", {
      class: "btn btn--ghost btn--icon", title: "Rétablir (Ctrl+Shift+Z)",
      html: ICONS.redo, onclick: () => this.onRedo?.(),
    });
    this.undoBtn.disabled = true; this.undoBtn.style.opacity = 0.4;
    this.redoBtn.disabled = true; this.redoBtn.style.opacity = 0.4;

    const right = el("div", { class: "topbar__right" }, [
      this.undoBtn,
      this.redoBtn,
      el("span", { class: "divider-v" }),
      el("button", {
        class: "btn btn--ghost",
        html: `${ICONS.upload}<span>Importer</span>`,
        onclick: () => this.onImport?.(),
      }),
      el("button", {
        class: "btn btn--filled",
        title: "Aperçu du code exporté",
        html: `${ICONS.code}<span>Export</span>`,
        onclick: () => this.onExport?.(),
      }),
      el("button", {
        class: "btn btn--accent",
        title: "Télécharger l'atlas .html (Cmd/Ctrl+S)",
        html: `${ICONS.download}<span>Télécharger</span>`,
        onclick: () => this.onDownload?.(),
      }),
      el("button", {
        class: "btn btn--ghost btn--icon", title: "Thème",
        html: ICONS.sun, onclick: () => this.onTheme?.(),
      }),
    ]);

    this.root.append(brand, center, right);
  }

  _setMode(mode) {
    this.modeCtl.querySelectorAll(".segmented__item").forEach(b => {
      b.classList.toggle("is-active", b.dataset.mode === mode);
    });
    this.store.patch(s => { s.mode = mode; }, "mode");
  }

  _syncMode() {
    const mode = this.store.state.mode;
    this.modeCtl.querySelectorAll(".segmented__item").forEach(b => {
      b.classList.toggle("is-active", b.dataset.mode === mode);
    });
  }

  _syncTitle() {
    if (this.title && !this.title.matches(":focus")) {
      const n = this.store.state.document.name || "Sans titre";
      if (this.title.textContent !== n) this.title.textContent = n;
    }
  }
}
