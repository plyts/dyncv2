# Dyncv Studio

Éditeur visuel modulaire pour transformer n'importe quelle architecture logicielle en expérience interactive léchée (type Figma / Adobe / Apple Pro Apps).

## Démarrage

```sh
# Ouvre l'app localement — aucun build, aucune dépendance
python3 -m http.server 8080
# → http://localhost:8080/
```

Rien à installer. Chrome, Firefox et Safari récents fonctionnent tel quel.

## Piliers

1. **Modularité universelle** — chaque objet, sous-objet, zone ou div est un calque indépendant, imbricable et manipulable.
2. **Mode Édition ⇄ Preview** — bascule instantanée entre l'atelier et l'expérience animée finale (raccourci `E` / `P`).
3. **Smart Slicing** — pré-découpe automatique en grille de zones interactives sur une image importée.
4. **Onboarding & Flow** — hotspots pulsants, halos ultra-fins, focus/spotlight, transitions cubic-bezier.
5. **Inspector Pro** — panneau latéral segmenté (Propriétés · Style · Motion · Docs).
6. **Fine-tuning CSS** — X, Y, W, H, rotation, radius, opacité, box-shadow, backdrop-filter, easings, durées, hover states.
7. **Éditeur Markdown riche** — split view, toolbar (H1-H3, gras, italique, code, listes, blockquote, HR, lien), aperçu live.

## Raccourcis

| Action | Raccourci |
|--|--|
| Panorama canvas | `Space` + drag |
| Zoom | `Cmd/Ctrl` + molette · `Cmd/Ctrl` + `+` / `−` |
| Fit to screen | `Cmd/Ctrl` + `0` |
| Édition / Preview | `E` / `P` |
| Annuler / Rétablir | `Cmd/Ctrl` + `Z` / `Shift+Z` |
| Dupliquer | `Cmd/Ctrl` + `D` |
| Supprimer | `Delete` |
| Déplacement fin | `←` `→` `↑` `↓` (shift = 10 px) |

## Architecture

```
dyncv2/
├── index.html
├── styles/
│   ├── tokens.css          # Design tokens (Material 3 / Apple HIG inspired)
│   ├── base.css            # Reset + primitives
│   ├── layout.css          # App shell (grid : topbar / workspace / statusbar)
│   ├── controls.css        # Buttons, inputs, sliders, color swatches, modals
│   ├── canvas.css          # Stage + nodes + handles + preview flyout
│   ├── layers.css          # Layers tree
│   └── markdown-editor.css # Rich md composer
└── scripts/
    ├── app.js              # entry: wires everything
    ├── store.js            # pub/sub + history
    ├── util.js             # DOM helpers, markdown parser, toast, download
    ├── icons.js            # icon set (14×14 outline)
    ├── preset-rag.js       # preset RAG architecture (6 zones + 15 hotspots)
    ├── canvas.js           # WYSIWYG surface + drag/resize/rotate
    ├── canvas-hud.js       # zoom cluster + info pill
    ├── layers-tree.js      # collapsible hierarchy
    ├── inspector.js        # 4-tab property inspector
    ├── markdown-editor.js  # rich toolbar + live preview
    ├── topbar.js           # brand + title + mode + actions
    ├── preview-flyout.js   # sliding docs panel (preview mode)
    ├── exporter.js         # HTML / CSS / JSON export
    └── importer.js         # image / JSON / smart-slice
```

Aucun runtime, aucun bundler, aucune dépendance NPM. Uniquement des ES modules natifs et Google Fonts (Inter + JetBrains Mono).

## Export

Le bouton `Export` génère un HTML/CSS autonome, prêt à intégrer, ou un JSON portable pour ré-hydratation ultérieure.
