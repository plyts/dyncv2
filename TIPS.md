# Tips — Linker et synchroniser des blocs

Ce guide couvre les patterns les plus utiles du Studio pour raconter un **flux animé** entre deux briques (bloc A → bloc B) via une combinaison **Connecteur pointillé + Point pulsé**, ou pour créer une **surbrillance croisée** entre plusieurs blocs.

---

## 1. Lier deux blocs en surbrillance croisée (grouped binding)

**But** — cliquer sur *"API Gateway"* met aussi en surbrillance *"Cache Redis"*, et inversement.

### Recette

1. Sélectionne le premier bloc (clic sur le canvas ou dans l'arborescence).
2. Panneau **Inspecteur → Propriétés → Layers liés**.
3. Clique sur les chips des autres calques à associer.
4. Sélectionne ensuite le second bloc et fais pareil dans l'autre sens (le binding n'est pas symétrique par défaut — chaque calque déclare **qui** il éclaire).

À l'écran, dès qu'un calque lié est sélectionné, les autres apparaissent avec un liseré `--accent-hover` (`#869dff`) et un léger halo. En **Preview**, ils partagent une pulsation. Dans l'atlas **exporté**, un clic sur A allume A ET tous ses `linkedTo`.

**Astuce** — Pour une surbrillance permanente (pas seulement au clic), tu peux mettre un **Connecteur** entre A et B (voir §2). Il reste toujours visible et suggère la relation même sans interaction.

---

## 2. Connecteur pointillé + Point pulsé synchronisés (flux de données)

**But** — matérialiser un flux : un trait pointillé animé va de A vers B **et** un point pulsé se dilate à la même vitesse pour évoquer la cadence du flux.

### Recette pas-à-pas

1. **Créer le connecteur.**
   - Barre d'outils flottante → outil **Connecteur** (raccourci `L`).
   - Clique-glisse depuis A jusqu'à B.
   - Il apparaît avec une **flèche** et un **dash animé** (marching ants).
2. **Régler la vitesse.**
   - Sélectionne-le → **Style → Bordure → Vitesse**.
   - Note la valeur, par exemple **`1.2 s`**.
3. **Ajouter le point pulsé.**
   - Barre d'outils → **Point pulsé** (`D`).
   - Clique-glisse à côté de A pour le placer sur le point de départ du flux.
4. **Synchroniser la cadence.**
   - Sélectionne le point → **Style → Point pulsé → Vitesse**.
   - Mets **la même valeur** que celle du connecteur — **`1.2 s`**.
5. **Aligner les phases (optionnel).**
   - **Halos** = 1 → une seule onde qui part en même temps que le dash.
   - **Portée** = 4 à 6 pour un halo qui s'étale sur la même distance visuelle que la longueur d'un tiret animé.

### Formule mnémotechnique — la « règle des trois S »

| Ce qui doit matcher | Connecteur (Style)     | Point pulsé (Style)  |
|:-------------------:|:----------------------:|:--------------------:|
| **Speed**           | `Vitesse` (s)          | `Vitesse` (s)        |
| **Stride**          | `Style` (Tirets/Points)| `Halos` (1 = un pas) |
| **Shade**           | `Couleur` bordure      | `Couleur` de fond    |

Quand ces trois S sont identiques, l'œil perçoit **une seule et même onde** qui parcourt le connecteur et rayonne depuis le point de départ.

### Aller plus loin — flux multi-étapes

- Un point pulsé à l'origine + un point pulsé à la destination (**Vitesse identique, mais Delay ≠ 0** dans **Motion → Delay**) crée l'illusion d'un signal qui atteint B après un temps de propagation.
- Un connecteur avec `Courbure` positive et un second avec `Courbure` négative (`-0.5`) évoque un **aller-retour** (request/response) entre deux services.

---

## 3. Linker un connecteur à ses deux blocs

**But** — quand on clique sur A, on veut voir non seulement B en surbrillance, mais aussi **le connecteur** entre eux.

### Recette

1. Sélectionne **A**.
2. Panneau Inspecteur → **Layers liés** → active la chip **B** *et* la chip du **connecteur**.
3. Répète en sélectionnant **B** → linker A + le connecteur.

Le connecteur reste toujours visible (c'est son rôle), mais quand une des extrémités est sélectionnée il reçoit la classe `.is-linked` et s'éclaire du même bleu accent. En preview, ça produit un effet de **circuit qui s'active** au clic.

---

## 4. Recette : « API Gateway ↔ Cache Redis »

Un exemple concret pour tester tout ça de bout en bout.

1. Dessine deux rectangles côte à côte : **API Gateway** (gauche) et **Cache Redis** (droite).
2. Trace un **Connecteur** entre eux :
   - `Vitesse` = **0.8 s**
   - `Courbure` = **0.3**
   - `Flèche` = **ON**
3. Place un **Point pulsé** collé au bord droit de l'API Gateway :
   - `Vitesse` = **0.8 s** (identique !)
   - `Halos` = **1**
   - `Portée` = **5×**
   - `Couleur` = même bleu que le connecteur
4. Dans l'inspecteur de **API Gateway** → Layers liés → active `Cache Redis` + `connecteur` + `point pulsé`.
5. Passe en **Preview**, clique sur **API Gateway** → les 4 éléments s'allument ensemble, l'onde pulsée quitte le Gateway à la même cadence que le dash du connecteur qui court vers le Cache.

---

## 5. Debug rapide

- **Le changement d'un paramètre ne se voit pas ?** → Depuis la v2 c'est du **live two-way binding** : chaque tick du slider redessine le calque à l'instant. Si tu n'en vois rien, vérifie que le calque n'est pas **masqué** (icône œil dans l'arborescence) ou **verrouillé**.
- **Le connecteur ne suit pas quand je bouge un bloc ?** → Les extrémités du connecteur sont **indépendantes** des blocs. Sélectionne le connecteur, tu vois deux poignées bleues (from / to) : tu peux les glisser directement, ou déplacer le connecteur entier depuis son bounding box.
- **Le pulse est trop rapide/lent par rapport au dash ?** → Ce sont deux vitesses distinctes. Recopie-les exactement, à la seconde près, dans le Style.

---

## Raccourcis clavier utiles

| Action                        | Raccourci |
|:------------------------------|:---------:|
| Outil Sélection               | `V`       |
| Outil Rectangle               | `R`       |
| Outil Cercle                  | `O`       |
| Outil Point pulsé             | `D`       |
| Outil Texte                   | `T`       |
| Outil Connecteur              | `L`       |
| Outil Image                   | `I`       |
| Basculer Édition ⇄ Preview     | `E` / `P` |
| Dupliquer la sélection        | `Cmd/Ctrl + D` |
| Annuler / Rétablir            | `Cmd/Ctrl + Z` / `Shift+Z` |
| Télécharger l'atlas .html     | `Cmd/Ctrl + S` |
| Nudge (fin / gros)            | `←→↑↓` / `Shift + ←→↑↓` |
