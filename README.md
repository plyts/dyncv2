# RAG Atlas

Un **fichier HTML unique et autonome** qui transforme l'image d'architecture d'un RAG avancé en expérience interactive : chaque bloc du schéma est cliquable, un panneau latéral glisse depuis la droite avec la fiche Markdown détaillée du composant.

Aucune dépendance à installer, aucun build. Ouvre `index.html` dans un navigateur récent — ou sers le dossier avec `python3 -m http.server 8080`.

## Ce qu'il contient

- **Image de base** — le schéma RAG complet (Query Construction · Translation · Routing · Indexing · Retrieval · Generation), embedded en base64 pour rester portable.
- **15 hotspots** positionnés en % par-dessus l'image (chunks, HyDE, Self-RAG, RAPTOR…). Chacun a sa fiche Markdown : rôle, techniques, quand l'utiliser, points d'attention.
- **6 zones colorées** avec chips de navigation dans la barre du haut.
- **Side-panel glass** qui slide en douceur, backdrop-blur, accent chromatique par zone, contenu Markdown rendu (titres, listes, code, blockquote colorée, liens).
- **Effets de survol soignés** — halo, ring, tag flottant, pulsation subtile au repos pour indiquer ce qui est cliquable ; spotlight qui assombrit le reste à la sélection.
- **Navigation clavier** — `←` / `→` entre briques, `Esc` pour fermer.
- **Thème clair / sombre** persisté (localStorage).
- **Related links** — chips "Explorer aussi" en bas de chaque fiche.

## Design

Tokens inspirés d'Apple HIG et Material 3 : dark par défaut, surfaces vitrées, Inter + JetBrains Mono, courbes de Bézier soignées (`cubic-bezier(0.2, 0, 0, 1)`, `cubic-bezier(0.34, 1.56, 0.64, 1)` pour les rebonds), micro-espacements millimétrés, aucune surcharge visuelle.

## Structure du fichier

```
index.html
├── <style> …tokens + composants (~24 KB)
├── <body>  …app shell (topbar + stage + panel)
└── <script>
    ├── ZONES           # 6 zones + couleurs + coord de titre
    ├── HOTSPOTS        # 15 briques avec fiches Markdown
    ├── md()            # parser Markdown minimal
    ├── buildUI()       # zone chips + labels + hotspots
    ├── openHotspot()   # ouverture animée du panel
    └── keyboard/theme  # raccourcis + persistance
```

Total : ~890 KB dont 850 KB pour l'image base64.

## Raccourcis

| Action | Raccourci |
|--|--|
| Ouvrir la fiche d'une brique | Clic (ou chip de zone en topbar) |
| Naviguer entre briques | `←` `→` |
| Fermer le panel | `Esc` ou clic hors du schéma |
| Basculer le thème | Bouton lune/soleil en haut à droite |
