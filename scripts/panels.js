/* Resizable + collapsible side panels (layers left, inspector right).
   Widths are driven by CSS variables on :root so the grid re-flows. */

import { clamp } from "./util.js";

const LS_KEY = "dyncv:panels";

export function initPanels({ app, workspace, leftPanel, rightPanel }) {
  const root = document.documentElement;

  const state = loadState();
  applyState(state);

  // ── Build resize handles ────────────────────────────────────
  const leftResizer  = mkResizer("left");
  const rightResizer = mkResizer("right");
  workspace.append(leftResizer, rightResizer);

  function mkResizer(side) {
    const r = document.createElement("div");
    r.className = `panel-resizer panel-resizer--${side}`;
    r.title = "Glisser pour redimensionner";
    r.addEventListener("mousedown", (e) => startDrag(e, side));
    return r;
  }

  function startDrag(e, side) {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const startX = e.clientX;
    const startW = side === "left" ? state.left : state.right;
    const move = (ev) => {
      const delta = ev.clientX - startX;
      if (side === "left") {
        state.left = clamp(startW + delta, 180, 520);
        root.style.setProperty("--left-panel-w", state.left + "px");
      } else {
        state.right = clamp(startW - delta, 240, 640);
        root.style.setProperty("--right-panel-w", state.right + "px");
      }
      positionResizers();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      saveState(state);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function positionResizers() {
    const lw = state.leftCollapsed ? 0 : state.left;
    const rw = state.rightCollapsed ? 0 : state.right;
    leftResizer.style.left  = lw + "px";
    rightResizer.style.right = rw + "px";
    leftResizer.style.display  = state.leftCollapsed  ? "none" : "block";
    rightResizer.style.display = state.rightCollapsed ? "none" : "block";
  }

  function applyState(s) {
    root.style.setProperty("--left-panel-w",  (s.leftCollapsed ? 0 : s.left) + "px");
    root.style.setProperty("--right-panel-w", (s.rightCollapsed ? 0 : s.right) + "px");
    app.classList.toggle("left-collapsed",  s.leftCollapsed);
    app.classList.toggle("right-collapsed", s.rightCollapsed);
  }

  function toggle(side) {
    if (side === "left")  state.leftCollapsed  = !state.leftCollapsed;
    if (side === "right") state.rightCollapsed = !state.rightCollapsed;
    applyState(state);
    positionResizers();
    saveState(state);
  }

  // Expose toggles
  const api = {
    toggleLeft:  () => toggle("left"),
    toggleRight: () => toggle("right"),
    isLeftCollapsed:  () => state.leftCollapsed,
    isRightCollapsed: () => state.rightCollapsed,
  };

  requestAnimationFrame(positionResizers);
  window.addEventListener("resize", positionResizers);

  return api;

  function loadState() {
    let s = { left: 264, right: 320, leftCollapsed: false, rightCollapsed: false };
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) s = { ...s, ...JSON.parse(raw) };
    } catch {}
    return s;
  }
  function saveState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  }
}
