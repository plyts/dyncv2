/* Import image / JSON + smart slicing */

import { el, toast, uid } from "./util.js";
import { ICONS } from "./icons.js";
import { defaultLayer } from "./store.js";

export class Importer {
  constructor({ store, onDone }) {
    this.store = store;
    this.onDone = onDone;
  }

  openDialog() {
    const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const modal = el("div", { class: "modal", style: { width: "min(560px, 100%)" } });

    modal.append(
      el("div", { class: "modal__head" }, [
        el("div", { class: "modal__title", text: "Importer" }),
        el("button", { class: "btn btn--icon", html: ICONS.x, onclick: () => scrim.remove() }),
      ]),
      el("div", { class: "modal__pane" }, [
        el("div", { style: { display: "grid", gap: "12px" } }, [
          this._card("Image d'architecture", "Charge une image (PNG/JPG/SVG/WebP) — elle sert d'arrière-plan éditable.", ICONS.image, () => {
            this._pickFile("image/*", async (file) => {
              const src = await this._readDataUrl(file);
              const dims = await this._imageDims(src);
              this.store.transaction(s => {
                s.document.background = { type: "image", src };
                if (dims.w > 0) {
                  s.document.viewport.w = dims.w;
                  s.document.viewport.h = dims.h;
                }
              }, "update");
              scrim.remove();
              this.onDone?.("image");
              toast("Image importée");
            });
          }),
          this._card("Composition JSON", "Réhydrate une composition exportée précédemment.", ICONS.json, () => {
            this._pickFile("application/json,.json", async (file) => {
              const txt = await file.text();
              try {
                const parsed = JSON.parse(txt);
                const doc = parsed.document || parsed;
                if (!doc.layers) throw new Error("Format invalide");
                this.store.transaction(s => { s.document = doc; s.selection = []; }, "update");
                scrim.remove();
                this.onDone?.("json");
                toast("Composition importée");
              } catch (e) {
                toast("Fichier JSON invalide", "danger");
              }
            });
          }),
          this._card("Découpage intelligent (Smart Slicing)", "Crée une grille de zones interactives sur l'image actuelle. Idéal pour reconstituer une architecture.", ICONS.slice, () => {
            this._slice();
            scrim.remove();
          }),
        ]),
      ]),
    );

    scrim.append(modal);
    document.body.append(scrim);

    const escHandler = (e) => { if (e.key === "Escape") { scrim.remove(); document.removeEventListener("keydown", escHandler); } };
    document.addEventListener("keydown", escHandler);
  }

  _card(title, hint, icon, onclick) {
    return el("button", {
      style: {
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: "14px",
        alignItems: "center",
        padding: "16px",
        borderRadius: "10px",
        background: "var(--surface-2)",
        boxShadow: "var(--shadow-inset)",
        textAlign: "left",
        color: "var(--ink-primary)",
        transition: "background 140ms cubic-bezier(0.2,0,0,1)",
      },
      onmouseenter: (e) => { e.currentTarget.style.background = "var(--surface-3)"; },
      onmouseleave: (e) => { e.currentTarget.style.background = "var(--surface-2)"; },
      onclick,
    }, [
      el("div", {
        style: {
          width: "44px", height: "44px", display: "grid", placeItems: "center",
          borderRadius: "8px", background: "var(--accent-tint)",
          color: "var(--accent-hover)",
        },
        html: icon,
      }),
      el("div", {}, [
        el("div", { style: { fontSize: "13px", fontWeight: "600", marginBottom: "3px" }, text: title }),
        el("div", { style: { fontSize: "12px", color: "var(--ink-tertiary)", lineHeight: "1.5" }, text: hint }),
      ]),
    ]);
  }

  _pickFile(accept, cb) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange = () => { if (input.files[0]) cb(input.files[0]); };
    input.click();
  }

  _readDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }
  _imageDims(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ w: 0, h: 0 });
      img.src = src;
    });
  }

  _slice() {
    // 4x3 grid on the current viewport
    const doc = this.store.state.document;
    const cols = 4, rows = 3;
    const padding = 24;
    const gap = 16;
    const W = doc.viewport.w - padding * 2;
    const H = doc.viewport.h - padding * 2;
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = (H - gap * (rows - 1)) / rows;

    this.store.transaction(s => {
      const rootId = uid("g");
      const children = [];
      let n = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          children.push(defaultLayer({
            name: `Bloc ${n++}`,
            type: "hotspot",
            transform: {
              x: padding + c * (cw + gap),
              y: padding + r * (ch + gap),
              w: cw, h: ch, rot: 0,
            },
          }));
        }
      }
      s.document.layers.push({
        id: rootId,
        name: "Découpage 4×3",
        type: "group",
        visible: true, locked: false,
        transform: { x: padding, y: padding, w: W, h: H, rot: 0 },
        style: {
          fill: "transparent",
          stroke: "#5e7bf9",
          strokeWidth: 1,
          strokeDash: "4 4",
          radius: 12,
          opacity: 1,
          shadow: "",
          backdrop: "",
        },
        motion: { duration: 240, easing: "cubic-bezier(0.2,0,0,1)", delay: 0, hover: "none", entrance: "fade" },
        content: { label: "Découpage", markdown: "" },
        children,
      });
    }, "update");
    toast("Grille 4 × 3 créée");
    this.onDone?.("slice");
  }
}
