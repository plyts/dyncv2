/* ============================================================
   Motion Choreography Engine
   ------------------------------------------------------------
   • MotionBus       — decoupled pub/sub for phase & lifecycle events
   • MasterTimeline  — a single rAF loop drives global time (t0)
   • Tracks          — one per animated layer; each has an inferred
                       period and emits phase-crossing signals
   • Effects         — a registry of transient CSS classes applied
                       on trigger (pulse-cascade, fade-chain, wobble,
                       beam-scan, sync-start)
   ------------------------------------------------------------
   Declarative sync config on a layer:
     sync: {
       source:  "<layer-id>",       // who to listen to
       trigger: "cycle:mid",        // when to fire on the source
       delay:   200,                // ms wait after fire
       effect:  "pulse-cascade",    // which effect to run
       loop:    true,               // re-run on every cycle
     }
   ============================================================ */

import { findLayer, walk } from "./store.js";

const CROSSINGS = {
  "cycle:start":  0.0,
  "cycle:quarter": 0.25,
  "cycle:mid":    0.5,
  "cycle:three-quarter": 0.75,
  "cycle:end":    0.999,
};

export const EFFECTS = [
  ["pulse-cascade", "Pulse en cascade"],
  ["fade-chain",    "Fondu enchaîné"],
  ["wobble",        "Wobble subtil"],
  ["beam-scan",     "Faisceau lumineux"],
  ["sync-start",    "Sync-start (flash)"],
];

export const TRIGGERS = [
  ["cycle:start",  "Début de cycle (0 %)"],
  ["cycle:quarter", "Quart de cycle (25 %)"],
  ["cycle:mid",    "Milieu de cycle (50 %)"],
  ["cycle:three-quarter", "Trois quarts (75 %)"],
  ["cycle:end",    "Fin de cycle (100 %)"],
];

export class MotionEngine {
  constructor({ store, canvas }) {
    this.store = store;
    this.canvas = canvas;
    this.bus = new Map();          // event → Set<fn>
    this.tracks = new Map();       // layerId → { period, lastPhase, phase }
    this.subs = new Map();         // layerId → unsubscribers for sync source
    this.startTime = performance.now();
    this._raf = null;
    this._playing = true;
    this._speed = 1;               // master timeline playback speed
    this._triggerCallbacks = new Set();
    this._buildTracks();

    this.store.on("update",  () => this._rebuild());
    this.store.on("replace", () => this._rebuild());
    this.store.on("mode",    () => this._rebuild());
    this.store.on("layer:style", () => this._rebuild(/*softly*/ true));
    this.store.on("layer:motion",() => this._rebuild(true));
  }

  /* ── Public API ────────────────────────────────────────── */

  play()  { if (!this._raf) { this._playing = true; this._loop(); } }
  pause() { this._playing = false; if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }
  setSpeed(x) { this._speed = Math.max(0.05, Math.min(4, x)); }
  reset() { this.startTime = performance.now(); }

  /** Get the current normalized phase [0..1) of a given layer's own cycle. */
  phaseOf(layerId) {
    const t = this.tracks.get(layerId);
    return t ? t.phase : 0;
  }

  /** Manually fire an effect on a target — used by "Preview" button. */
  fireEffect(targetId, effect, delayMs = 0) {
    setTimeout(() => this._applyEffect(targetId, effect), delayMs);
  }

  /** Subscribe to a phase-crossing event for a layer. */
  onPhase(layerId, trigger, fn) {
    const event = `${layerId}:phase:${trigger}`;
    if (!this.bus.has(event)) this.bus.set(event, new Set());
    this.bus.get(event).add(fn);
    return () => this.bus.get(event).delete(fn);
  }

  emit(event, payload) {
    this.bus.get(event)?.forEach(fn => fn(payload));
    // Fire a wildcard for debugging / timeline HUD
    this._triggerCallbacks.forEach(fn => fn(event, payload));
  }

  onAnyTrigger(fn) {
    this._triggerCallbacks.add(fn);
    return () => this._triggerCallbacks.delete(fn);
  }

  /* ── Internal ─────────────────────────────────────────── */

  _rebuild(soft = false) {
    // Rebuild the sync subscriptions from the current state.
    // Called on any state change; cheap because we only re-wire pub/sub.
    if (!soft) {
      this.tracks.clear();
      this._buildTracks();
    } else {
      this._refreshPeriods();
    }
    this.subs.forEach((unsubs) => unsubs.forEach(fn => fn()));
    this.subs.clear();
    walk(this.store.state.document.layers, (layer) => {
      const sync = layer.sync;
      if (!sync?.source || !sync?.trigger || !sync?.effect) return;
      const unsubs = this.subs.get(layer.id) || new Set();
      const off = this.onPhase(sync.source, sync.trigger, () => {
        this.fireEffect(layer.id, sync.effect, sync.delay || 0);
      });
      unsubs.add(off);
      this.subs.set(layer.id, unsubs);
    });
    if (!this._raf && this._playing) this._loop();
  }

  _buildTracks() {
    walk(this.store.state.document.layers, (layer) => {
      const period = this._inferPeriod(layer);
      if (!period) return;
      const prev = this.tracks.get(layer.id) || { phase: 0, lastPhase: 0 };
      this.tracks.set(layer.id, { period, phase: prev.phase, lastPhase: prev.lastPhase });
    });
  }

  _refreshPeriods() {
    // Update existing tracks' periods without wiping their phases
    walk(this.store.state.document.layers, (layer) => {
      const period = this._inferPeriod(layer);
      if (!period) { this.tracks.delete(layer.id); return; }
      const prev = this.tracks.get(layer.id);
      if (prev) prev.period = period;
      else this.tracks.set(layer.id, { period, phase: 0, lastPhase: 0 });
    });
  }

  _inferPeriod(layer) {
    // Any layer that carries a natural cycle contributes a period:
    //  • dot          → pulseSpeed
    //  • connector    → dashSpeed
    //  • marching-ants→ dashSpeed
    //  • motion.entrance / hover animations don't loop, ignored
    if (layer.type === "dot") return (layer.style?.pulseSpeed || 2.2) * 1000;
    if (layer.type === "connector" && layer.style?.animateDash) return (layer.style?.dashSpeed || 1.2) * 1000;
    if (layer.style?.animateDash) return (layer.style?.dashSpeed || 1.2) * 1000;
    return null;
  }

  _loop() {
    const step = () => {
      if (!this._playing) { this._raf = null; return; }
      this._tick(performance.now());
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _tick(now) {
    const dt = (now - this.startTime) * this._speed;
    for (const [id, track] of this.tracks) {
      const t = dt % track.period;
      const phase = t / track.period;
      const last = track.lastPhase;
      for (const [name, threshold] of Object.entries(CROSSINGS)) {
        // Handle wrap-around at cycle end
        const crossed = last <= phase
          ? (last < threshold && phase >= threshold)
          : (last < threshold || phase >= threshold); // wrapped from ~1 to 0
        if (crossed) this.emit(`${id}:phase:${name}`, { layerId: id, phase: threshold });
      }
      track.lastPhase = phase;
      track.phase = phase;
    }
  }

  _applyEffect(targetId, effect) {
    const node = this.canvas.nodeMap.get(targetId);
    if (!node) return;
    const cls = "fx-" + effect;
    node.classList.remove(cls);
    // Force a reflow so re-adding replays the animation
    void node.offsetWidth;
    node.classList.add(cls);
    // Effects self-clean via CSS animation-fill-mode: forwards +
    // animationend listener that removes the class.
    node.addEventListener("animationend", () => node.classList.remove(cls), { once: true });
  }
}

/* Snippet dumper for embed in the exported atlas.
   The exporter includes a slimmed clone of this engine so the atlas
   plays the same choreography without any dependency. */
export const ATLAS_ENGINE_JS = `
(function(){
  const CROSSINGS = ${JSON.stringify(CROSSINGS)};
  function inferPeriod(l){
    if(l.type==='dot') return (l.style && l.style.pulseSpeed||2.2)*1000;
    if(l.style && l.style.animateDash) return (l.style.dashSpeed||1.2)*1000;
    return null;
  }
  window.__motion = { tracks:new Map(), bus:new Map(), subs:new Map(), start:performance.now(), speed:1,
    on(ev,fn){ if(!this.bus.has(ev)) this.bus.set(ev,new Set()); this.bus.get(ev).add(fn); },
    emit(ev,p){ const s=this.bus.get(ev); if(s) s.forEach(fn=>fn(p)); },
    fire(id,effect,delay){ setTimeout(()=>{
      const n = document.querySelector('.hotspot[data-id="'+id+'"], .node[data-id="'+id+'"], .atlas-dot[data-id="'+id+'"], .atlas-connector[data-id="'+id+'"]');
      if(!n) return;
      const cls='fx-'+effect;
      n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls);
      n.addEventListener('animationend', ()=>n.classList.remove(cls), { once:true });
    }, delay||0);
  }};
  function build(hotspots){
    hotspots.forEach(function(l){
      const p=inferPeriod(l); if(!p) return;
      __motion.tracks.set(l.id, { period:p, phase:0, lastPhase:0 });
    });
    hotspots.forEach(function(l){
      const s=l.sync;
      if(!s||!s.source||!s.trigger||!s.effect) return;
      __motion.on(s.source+':phase:'+s.trigger, function(){
        __motion.fire(l.id, s.effect, s.delay||0);
      });
    });
    function loop(){
      const dt=(performance.now()-__motion.start)*__motion.speed;
      __motion.tracks.forEach(function(t,id){
        const cur=(dt%t.period)/t.period, last=t.lastPhase;
        for(const k in CROSSINGS){
          const th=CROSSINGS[k];
          const crossed = last<=cur ? (last<th && cur>=th) : (last<th || cur>=th);
          if(crossed) __motion.emit(id+':phase:'+k, { layerId:id, phase:th });
        }
        t.lastPhase=cur; t.phase=cur;
      });
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  window.__buildMotion = build;
})();`;
