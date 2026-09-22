/* Layers tree — collapsible hierarchy with visibility/lock/rename */

import { el, esc } from "./util.js";
import { ICONS } from "./icons.js";
import { findLayer, findParent, walk, removeLayer } from "./store.js";
import { RAG_ZONES } from "./preset-rag.js";

const ICON_FOR = {
  group:   ICONS.group,
  rect:    ICONS.rect,
  hotspot: ICONS.hotspot,
  text:    ICONS.text,
  image:   ICONS.image,
  frame:   ICONS.frame,
};

export class LayersTree {
  constructor({ store, root }) {
    this.store = store;
    this.root = root;
    this.collapsed = new Set(); // layer ids that are folded
    this.query = "";

    this._build();
    this.store.on("replace",   () => this.render());
    this.store.on("update",    ({ kind } = {}) => { if (kind !== "viewport") this.render(); });
    this.store.on("selection", () => this._syncSelection());
    this.store.on("hover",     () => this._syncHover());
    this.store.on("layer:transform", () => {}); // no re-render
  }

  _build() {
    this.root.innerHTML = "";
    this.root.append(
      el("div", { class: "panel-head" }, [
        el("span", { class: "panel-head__title", text: "Layers" }),
        el("div", { class: "panel-head__actions" }, [
          el("button", {
            class: "btn btn--ghost btn--icon-sm",
            title: "Nouveau calque",
            "aria-label": "Ajouter un calque",
            html: ICONS.plus,
            onclick: () => this._addLayer(),
          }),
        ]),
      ]),
      el("div", { class: "layers-search" }, [
        el("div", { class: "input-shell" }, [
          el("span", { class: "input-shell__prefix", html: ICONS.search }),
          el("input", {
            type: "text",
            placeholder: "Rechercher…",
            oninput: (e) => { this.query = e.target.value.toLowerCase(); this.render(); },
          }),
        ]),
      ]),
    );
    this.list = el("div", { class: "layers-list", role: "tree" });
    this.root.append(this.list);
    this.render();
  }

  _addLayer() {
    import("./store.js").then(({ defaultLayer }) => {
      this.store.transaction(s => {
        const l = defaultLayer({ name: "Nouveau calque" });
        s.document.layers.push(l);
        s.selection = [l.id];
      }, "update");
    });
  }

  render() {
    this.list.innerHTML = "";
    const rows = [];
    walk(this.store.state.document.layers, (layer, depth, parent) => {
      // Filter by search
      if (this.query) {
        const hit = (layer.name || "").toLowerCase().includes(this.query)
                 || (layer.content?.label || "").toLowerCase().includes(this.query);
        if (!hit && !(layer.children || []).some(c => (c.name || "").toLowerCase().includes(this.query))) return true;
      }
      rows.push({ layer, depth, parent, collapsed: this.collapsed.has(layer.id) });
      if (this.collapsed.has(layer.id)) return false; // don't descend
    });

    for (const { layer, depth, collapsed } of rows) {
      this.list.append(this._renderRow(layer, depth, collapsed));
    }
    this._syncSelection();
    this._syncHover();
  }

  _renderRow(layer, depth, collapsed) {
    const hasChildren = (layer.children || []).length > 0;
    const zoneColor = RAG_ZONES[layer.zone]?.color;

    const caret = el("span", {
      class: `layer__caret ${hasChildren ? (collapsed ? "" : "is-open") : "is-leaf"}`,
      html: ICONS.chevronRight,
    });
    if (hasChildren) {
      caret.onclick = (e) => {
        e.stopPropagation();
        if (this.collapsed.has(layer.id)) this.collapsed.delete(layer.id);
        else this.collapsed.add(layer.id);
        this.render();
      };
    }

    const iconWrap = el("span", { class: "layer__icon", html: ICON_FOR[layer.type] || ICONS.rect });
    const dot = zoneColor
      ? el("span", { class: "layer__dot", style: { "--layer-color": zoneColor, background: zoneColor } })
      : null;

    const name = el("span", {
      class: "layer__name",
      title: layer.name,
      text: layer.name,
      tabindex: 0,
    });
    name.ondblclick = (e) => {
      e.stopPropagation();
      name.setAttribute("contenteditable", "true");
      name.focus();
      const range = document.createRange();
      range.selectNodeContents(name);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    };
    name.onblur = () => {
      name.removeAttribute("contenteditable");
      const v = name.textContent.trim();
      this.store.transaction(s => {
        const target = findLayer(s.document.layers, layer.id);
        if (target) target.name = v || "Layer";
      }, "update");
    };
    name.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); name.blur(); }
      if (e.key === "Escape") { name.textContent = layer.name; name.blur(); }
    };

    const actVis = el("button", {
      class: "layer__act", "data-act": "visible",
      title: layer.visible ? "Masquer" : "Afficher",
      html: layer.visible ? ICONS.eye : ICONS.eyeOff,
      onclick: (e) => {
        e.stopPropagation();
        this.store.transaction(s => {
          const t = findLayer(s.document.layers, layer.id);
          if (t) t.visible = !t.visible;
        }, "update");
      },
    });
    const actLock = el("button", {
      class: "layer__act", "data-act": "locked",
      title: layer.locked ? "Déverrouiller" : "Verrouiller",
      html: layer.locked ? ICONS.lock : ICONS.unlock,
      onclick: (e) => {
        e.stopPropagation();
        this.store.transaction(s => {
          const t = findLayer(s.document.layers, layer.id);
          if (t) t.locked = !t.locked;
        }, "update");
      },
    });
    const actDel = el("button", {
      class: "layer__act", "data-act": "delete",
      title: "Supprimer",
      html: ICONS.trash,
      onclick: (e) => {
        e.stopPropagation();
        this.store.transaction(s => {
          removeLayer(s.document.layers, layer.id);
          s.selection = [];
        }, "update");
      },
    });

    const row = el("div", {
      class: `layer${!layer.visible ? " is-hidden" : ""}${layer.locked ? " is-locked" : ""}`,
      "data-id": layer.id,
      "data-depth": Math.min(depth, 5),
      role: "treeitem",
      onmousedown: (e) => {
        if (e.target.closest(".layer__act, .layer__caret")) return;
        this.store.patch(s => {
          if (e.shiftKey) {
            if (s.selection.includes(layer.id)) s.selection = s.selection.filter(id => id !== layer.id);
            else s.selection.push(layer.id);
          } else s.selection = [layer.id];
        }, "selection");
      },
    }, [
      caret,
      iconWrap,
      dot,
      name,
      layer.sync?.source ? el("span", {
        class: "layer__sync",
        title: `Synchronisé (${layer.sync.effect || "effet"})`,
        html: `<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6a4 4 0 10-1 4"/><path d="M11 3v3h-3"/></svg>`,
      }) : null,
      layer.zone ? el("span", { class: "layer__zone-tag", text: layer.zone.slice(0,3) }) : null,
      el("div", { class: "layer__actions" }, [actVis, actLock, actDel]),
    ]);

    return row;
  }

  _syncSelection() {
    const sel = new Set(this.store.state.selection);
    this.list.querySelectorAll(".layer").forEach(row => {
      row.classList.toggle("is-selected", sel.has(row.dataset.id));
    });
  }

  _syncHover() {
    const h = this.store.state.hover;
    this.list.querySelectorAll(".layer").forEach(row => {
      row.classList.toggle("is-hover", row.dataset.id === h);
    });
  }
}
