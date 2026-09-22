/* Preset: RAG architecture — zones + hotspots with documentation
   Coordinates target a 1600x1200 base canvas.
*/

import { uid } from "./util.js";

export const RAG_ZONES = {
  construction: { label: "Query Construction", color: "#f2b705", ink: "#2a2000" },
  translation:  { label: "Query Translation",  color: "#e03131", ink: "#ffffff" },
  routing:      { label: "Routing",            color: "#f08c00", ink: "#2a1500" },
  indexing:     { label: "Indexing",           color: "#1c7ed6", ink: "#ffffff" },
  retrieval:    { label: "Retrieval",          color: "#2f9e44", ink: "#ffffff" },
  generation:   { label: "Generation",         color: "#9c36b5", ink: "#ffffff" },
};

const mkGroup = (zone, name, rect, children = [], markdown = "") => ({
  id: uid("g"),
  name,
  type: "group",
  zone,
  visible: true, locked: false,
  transform: { x: rect[0], y: rect[1], w: rect[2], h: rect[3], rot: 0 },
  style: {
    fill:   `color-mix(in srgb, ${RAG_ZONES[zone].color} 10%, transparent)`,
    stroke: RAG_ZONES[zone].color,
    strokeWidth: 1.5,
    strokeDash: "6 4",
    radius: 20,
    opacity: 1,
    shadow: "",
    backdrop: "",
  },
  motion: { duration: 320, easing: "cubic-bezier(0.2,0,0,1)", delay: 0, hover: "lift", entrance: "fade-up" },
  content: { label: RAG_ZONES[zone].label, markdown },
  children,
});

const mkHot = (zone, name, rect, title, markdown) => ({
  id: uid("h"),
  name,
  type: "hotspot",
  zone,
  visible: true, locked: false,
  transform: { x: rect[0], y: rect[1], w: rect[2], h: rect[3], rot: 0 },
  style: {
    fill:   `color-mix(in srgb, ${RAG_ZONES[zone].color} 14%, transparent)`,
    stroke: RAG_ZONES[zone].color,
    strokeWidth: 1.2,
    strokeDash: "",
    radius: 14,
    opacity: 1,
    shadow: "",
    backdrop: "",
  },
  motion: { duration: 240, easing: "cubic-bezier(0.34,1.56,0.64,1)", delay: 0, hover: "glow", entrance: "fade-scale" },
  content: { label: title, markdown },
  children: [],
});

/* ---------------------------------------------------------- */

const md_sql = `## Text-to-SQL
Convertit la question de l'utilisateur en **requête SQL** exécutable contre une base relationnelle.

- LLM comme parseur sémantique.
- Optionnel : \`SQL + PGVector\` pour combiner recherche vectorielle et attributs relationnels.

> À utiliser quand les données de réponse vivent dans des tables (transactions, catalogues).`;

const md_cypher = `## Text-to-Cypher
Traduit une question en **Cypher** pour interroger un GraphDB (Neo4j…).

- Idéal pour parcourir des relations (personnes, entités, réseaux).
- Nécessite un schéma de graphe déclaré au prompt.`;

const md_selfquery = `## Self-Query Retriever
Le LLM **auto-génère les filtres de métadonnées** à partir de la question.

- Combine recherche vectorielle + filtres structurés.
- Fonctionne mieux quand les documents sont taggés (auteur, date, type).`;

const md_decomp = `## Décomposition de requête
Techniques : **Multi-query**, **Step-back**, **RAG-Fusion**.

- **Multi-query** : reformulations pour élargir la couverture.
- **Step-back** : remonter d'un cran d'abstraction avant de plonger.
- **RAG-Fusion** : fusion pondérée des résultats via Reciprocal Rank Fusion.`;

const md_hyde = `## HyDE — Hypothetical Documents
Génère un **document hypothétique** répondant à la question, puis embed-le pour récupérer.

- Contourne le mismatch question/document.
- Attention aux hallucinations qui biaisent la recherche.`;

const md_logical = `## Routage logique
Le LLM choisit la **source de données** (SQL, Graph, Vector) en fonction de la question.

- Prompts avec description de chaque source.
- Résultat : un identifiant de route + éventuels paramètres.`;

const md_semantic = `## Routage sémantique
Embed la question, puis choisit le **prompt** dont l'embedding est le plus proche.

- Sélectionne un persona / style / système sans LLM en boucle.
- Latence sub-100 ms.`;

const md_chunk = `## Chunking optimal
Découpe des documents avant embedding : par **caractères**, **sections**, **découpage sémantique** ou **délimiteurs**.

- Un chunk trop grand dilue le signal, trop petit fragmente le sens.
- Overlap 10–20 % en général.`;

const md_multi = `## Multi-représentation
Indexer plusieurs vues d'un même document :

- **Parent Document** : embed le résumé, retourne le document long.
- **Dense-X** : plusieurs versions denses (résumé, questions, propositions).`;

const md_special = `## Embeddings spécialisés
- **Fine-tuning** d'un modèle d'embeddings sur ton corpus.
- **ColBERT** : late-interaction, meilleure rappel sur des queries précises.`;

const md_hier = `## RAPTOR — Hiérarchique
Construit un **arbre de résumés récursif** par clustering :

- Chunks → clusters → résumés → clusters de résumés…
- Requête récupère à plusieurs niveaux d'abstraction.`;

const md_rank = `## Re-ranking
Trie les documents candidats avec :

- **Cross-encoder** (BGE, Cohere Rerank),
- **RankGPT** — LLM notant en zero-shot,
- **RAG-Fusion** — RRF sur plusieurs listes.`;

const md_refine = `## Refinement (CRAG)
Compresse ou reformule les documents avant de les passer au LLM :

- Résumé extractif,
- Suppression des passages inutiles,
- Ré-écriture ciblée.`;

const md_active = `## Active Retrieval
Si les documents récupérés ne sont **pas assez pertinents**, la boucle re-lance :

- Sur une autre source (web, autre index),
- Ou avec une reformulation.`;

const md_selfrag = `## Self-RAG / RRR
Le modèle **critique sa propre génération** :

- Émet des tokens de contrôle (retrieve, no-retrieve, support).
- Peut demander une nouvelle passe de retrieval.`;

/* ---------------------------------------------------------- */

const CANVAS_W = 1600;
const CANVAS_H = 1200;

export function ragScene() {
  return {
    id: "root",
    name: "RAG Architecture",
    viewport: { w: CANVAS_W, h: CANVAS_H, paper: "#fdfaf3" },
    background: { type: "none", src: null, color: "#fdfaf3" },
    layers: [
      mkGroup("construction", "Query Construction", [24, 40, 900, 260], [
        mkHot("construction", "SQL",         [40, 80, 260, 200], "Text-to-SQL",        md_sql),
        mkHot("construction", "Cypher",      [320, 80, 260, 200], "Text-to-Cypher",     md_cypher),
        mkHot("construction", "Self-Query",  [600, 80, 300, 200], "Self-Query Retriever", md_selfquery),
      ], `# Query Construction\nTransforme la question en **requête structurée** exécutable sur ta base (SQL, Cypher, filtres vector).`),

      mkGroup("translation", "Query Translation", [24, 340, 720, 200], [
        mkHot("translation", "Decomposition", [40, 380, 420, 160], "Query Decomposition", md_decomp),
        mkHot("translation", "HyDE",          [480, 380, 246, 160], "HyDE",                md_hyde),
      ], `# Query Translation\nReformule ou décompose la question pour mieux viser les documents.`),

      mkGroup("routing", "Routing", [24, 620, 640, 220], [
        mkHot("routing", "Logical",  [40, 660, 280, 180], "Routage logique",   md_logical),
        mkHot("routing", "Semantic", [340, 660, 300, 180], "Routage sémantique", md_semantic),
      ], `# Routing\nChoisit la **source** (DB, prompt) à activer pour cette question.`),

      mkGroup("indexing", "Indexing", [24, 900, 1140, 280], [
        mkHot("indexing", "Chunk",        [40, 940, 240, 220], "Chunk Optimization",     md_chunk),
        mkHot("indexing", "Multi-repr",   [300, 940, 300, 220], "Multi-representation",  md_multi),
        mkHot("indexing", "Specialized",  [620, 940, 260, 220], "Specialized Embeddings", md_special),
        mkHot("indexing", "Hierarchical", [900, 940, 240, 220], "Hierarchical (RAPTOR)",  md_hier),
      ], `# Indexing\nComment on **stocke** et **structure** le savoir avant qu'une question n'arrive.`),

      mkGroup("retrieval", "Retrieval", [1010, 40, 540, 400], [
        mkHot("retrieval", "Ranking",     [1030, 80, 320, 240], "Re-Rank / RankGPT / RAG-Fusion", md_rank),
        mkHot("retrieval", "Refinement",  [1370, 80, 160, 240], "CRAG Refinement",                md_refine),
        mkHot("retrieval", "Active",      [1030, 330, 500, 90],  "Active Retrieval",              md_active),
      ], `# Retrieval\nTrouver, classer et affiner les documents avant de générer.`),

      mkGroup("generation", "Generation", [1180, 880, 380, 280], [
        mkHot("generation", "Self-RAG",   [1200, 920, 340, 220], "Self-RAG / RRR", md_selfrag),
      ], `# Generation\nProduit la réponse — éventuellement en **critiquant sa propre sortie**.`),
    ],
  };
}
