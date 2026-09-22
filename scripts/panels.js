/* Resizable + collapsible side panels (layers left, inspector right).
   Widths are driven by CSS variables on :root so the grid re-flows. */

import { clamp } from "./util.js";

const LS_KEY = "dyncv:panels";
const MIN_STAGE = 380;   // the central canvas is never allowed below this
const LEFT_MIN = 200, LEFT_MAX = 420;
const RIGHT_MIN = 260, RIGHT_MAX = 520;

export function initPanels({ app, workspace, leftPanel, rightPanel, onResize }) {
  const root = document.documentElement;

  const state = loadState();
  clampToViewport();
  applyState(state);

  // Keep panels within bounds when the window itself resizes
  window.addEventListener("resize", () => {
    clampToViewport();
    applyState(state);
    positionResizers();
    onResize?.();
  });

  function clampToViewport() {
    const vw = window.innerWidth;
    const leftW  = state.leftCollapsed  ? 0 : state.left;
    const rightW = state.rightCollapsed ? 0 : state.right;
    // If both panels + min stage overflow, shrink them proportionally
    const overflow = (leftW + rightW + MIN_STAGE) - vw;
    if (overflow > 0) {
      if (!state.rightCollapsed) state.right = clamp(state.right - overflow, RIGHT_MIN, RIGHT_MAX);
      const stillOver = (state.leftCollapsed ? 0 : state.left) + (state.rightCollapsed ? 0 : state.right) + MIN_STAGE - vw;
      if (stillOver > 0 && !state.leftCollapsed) state.left = clamp(state.left - stillOver, LEFT_MIN, LEFT_MAX);
    }
  }

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
    document.body.classList.add("is-resizing-panels");
    const startX = e.clientX;
    const startW = side === "left" ? state.left : state.right;
    const move = (ev) => {
      const delta = ev.clientX - startX;
      const vw = window.innerWidth;
      // The other panel's effective width (0 if collapsed)
      const otherW = side === "left"
        ? (state.rightCollapsed ? 0 : state.right)
        : (state.leftCollapsed ? 0 : state.left);
      // Hard cap so the central stage never drops below MIN_STAGE
      const roomCap = Math.max(0, vw - otherW - MIN_STAGE);
      if (side === "left") {
        state.left = clamp(startW + delta, LEFT_MIN, Math.min(LEFT_MAX, roomCap));
        root.style.setProperty("--left-panel-w", state.left + "px");
      } else {
        state.right = clamp(startW - delta, RIGHT_MIN, Math.min(RIGHT_MAX, roomCap));
        root.style.setProperty("--right-panel-w", state.right + "px");
      }
      positionResizers();
      onResize?.();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.classList.remove("is-resizing-panels");
      saveState(state);
      onResize?.();
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
    clampToViewport();
    applyState(state);
    positionResizers();
    saveState(state);
    // Let the canvas re-center after the layout settles
    setTimeout(() => onResize?.(), 30);
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
