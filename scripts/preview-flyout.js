/* Preview mode flyout — sliding docs panel */

import { el, md } from "./util.js";
import { ICONS } from "./icons.js";
import { findLayer } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";

export class PreviewFlyout {
  constructor({ store, root, onFocus, onClose }) {
    this.store = store;
    this.root = root;
    this.onFocus = onFocus;
    this.onClose = onClose;
    this.currentId = null;
    this._build();
  }

  _build() {
    this.root.innerHTML = "";
    this.head = el("div", { class: "preview-flyout__head" });
    this.body = el("div", { class: "preview-flyout__body" }, [
      el("div", { class: "markdown-body" }),
    ]);
    this.root.append(this.head, this.body);
  }

  open(id) {
    const layer = findLayer(this.store.state.document.layers, id);
    if (!layer) return;
    this.currentId = id;
    const zone = RAG_ZONES[layer.zone];
    const color = zone?.color || "#5e7bf9";
    this.root.style.setProperty("--zone-color", color);

    this.head.innerHTML = "";
    this.head.append(
      el("div", { class: "preview-flyout__zone" }, [
        el("i"),
        document.createTextNode(zone?.label || "Composant"),
      ]),
      el("div", { class: "preview-flyout__title", text: layer.content?.label || layer.name }),
      el("div", { class: "preview-flyout__kicker", text: layer.name }),
      el("button", {
        class: "preview-flyout__close btn btn--icon",
        html: ICONS.x,
        title: "Fermer (Esc)",
        onclick: () => this.close(),
      }),
    );

    const body = this.body.querySelector(".markdown-body");
    body.innerHTML = md(layer.content?.markdown || "_Aucune documentation pour cette brique. Édite en mode Édition → onglet Docs._");
    this.root.classList.add("is-open");
    this.onFocus?.(id);
  }

  close() {
    this.root.classList.remove("is-open");
    this.currentId = null;
    this.onClose?.();
  }
}
