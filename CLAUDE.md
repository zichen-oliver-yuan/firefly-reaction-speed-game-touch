# Firefly Reaction Speed Game — Claude Guide

## Project Overview

Touch-based reaction speed game built for trade show / kiosk use.
**No build system.** Plain HTML + CSS + vanilla JS served statically (Netlify).
The game runs on a tablet in kiosk mode; the "attract" loop plays when no one is interacting.

## File Structure

```
frontend/
  index.html          — all screens (attract, game, score, lead form, leaderboard)
  css/styles.css      — all styling, keyframes, transitions
  js/
    ui.js             — UIController: all DOM/animation logic
    game.js           — GameController: state machine, timers, scoring
    main.js           — entry point, wires ui + game together
    config.js         — runtime config (speeds, thresholds, Google Sheets URL)
    scoring.js        — score calculation
    touch-keyboard.js — on-screen keyboard for lead form
    sheets.js         — Google Sheets sync
    local-storage.js  — offline score queue
apps-script/Code.gs   — Google Apps Script backend
netlify/              — edge function for auth
```

## Architecture Notes

- `UIController` (ui.js) owns all animation and DOM state.
- `GameController` (game.js) owns game state; calls `window.ui.*` methods to drive UI.
- Attract mode can run in two modes: DOM band animation (default) or video (`window.useVideoAttract`).
- `window.disableDomAttractBands = true` skips all attract DOM animation phases.

---

## Attract Animation — Full Map

The attract cycle lives in `ui.js`. It runs continuously on the demo/attract screen.

### Cycle Timings (default)

| Time   | Phase | What happens |
|--------|-------|--------------|
| 0 ms   | 0     | Reset — only teal band visible (flex-grow:1), magenta+lime hidden |
| 1500 ms | 1    | Magenta band grows in (CSS flex-grow transition, 0.9 s) |
| 2500 ms | 2    | Lime band grows in (CSS flex-grow transition, 0.9 s) |
| 3800 ms | 3    | Text grows (WAAPI scale 0.3→1, 900 ms) + infinite marquee scroll starts |
| 9500 ms | 4    | Container zooms out (WAAPI scale N→1, 900 ms) — all bands revealed |
| 14000 ms | —   | Leaderboard panel slides up (CSS transition, 0.65 s) |
| 24000 ms | —   | Leaderboard slides down; cycle restarts |

### Phase 3 — The Heavy One

`startAttractScroll()` in `ui.js:671`:

1. **Container scale:** Sets `.attract-bands` to `scale(N)` where N = 4 (1080p), 3 (1440p), or 2 (4K). This creates a massive composited layer.
2. **DOM build:** Injects `copiesPerBand * 2` text `<span>` nodes into each active track (12–24 copies × 12 bands = up to 288 nodes).
3. **Marquee CSS animation:** Each `.attract-track` gets `animation: attractScrollLTR/RTL Xs linear infinite` — all 12 tracks scrolling simultaneously.
4. **WAAPI scale grow:** Each of the 3 original `.attract-track-scaler` elements gets `el.animate([{scale:'0.3'}, {scale:'1'}], {duration:900})`.

### Phase 4 — Zoom-Out

`showAttractPhase4()` in `ui.js:839`:

- Cancels scaler WAAPI, pins scalers at `scale(1)`.
- Fires WAAPI on `.attract-bands` container: `scale(N→1)`, 900 ms, fill:'none'.
- On finish, commits `bands.style.scale = '1'`.

### Other Animations

| Animation | Technique | Location |
|-----------|-----------|----------|
| Leaderboard auto-scroll | `requestAnimationFrame` loop, 18 px/s | `ui.js:377` |
| Button ambient glow | CSS `@keyframes ambientGlow/Pulse`, 1.9 s infinite | `styles.css:307` |
| Button press ripple | CSS `@keyframes pressRipple`, 330 ms | `styles.css:531` |
| Odometer roll | CSS `@keyframes rollUp/Down`, 180 ms | `styles.css:615` |
| Countdown pop | CSS `@keyframes cdPop`, 250 ms | `styles.css:1421` |
| LED subtitle marquee | CSS `@keyframes ledMarqueeTrack`, variable | `styles.css:218` |
| Cursor blink | CSS `@keyframes cursor-blink`, 1 s step-end | `styles.css:850` |
| Screen slide transitions | JS setTimeout + CSS `transform translateX`, 280 ms | `ui.js:234` |
| Lead form stagger-in | JS setTimeout chain, 70 ms stagger, 320 ms each | `ui.js:1743` |
| Game-over overlay | JS multi-phase: slide-in 400 ms → shrink 500 ms → fade 200 ms | `ui.js:1625` |

---

## Reducing Motion — Key Levers

### Most Expensive (target first)

1. **Container scale (Phase 3)** — `bands.style.scale = String(containerScale)` at `ui.js:782`. Reducing `containerScale` shrinks the composited layer proportionally. At scale(1) = no zoom effect, zero GPU overhead.
2. **Marquee track count** — `copiesPerBand` at `ui.js:644`. Fewer copies = fewer DOM nodes and a smaller `translateX` composited layer.
3. **Active band count** — `totalBands` at `ui.js:623`. Fewer bands = less layout and fewer scrolling layers.
4. **Marquee scroll speed** — `speed` per band config × `phase4SpeedScale`. Slowing down reduces how often the GPU composites a new frame position (though linear infinite is already cheap).
5. **Phase 3 WAAPI grow** — 3 simultaneous scale animations on `.attract-track-scaler`. Can be replaced with instant snap to `scale(1)`.
6. **Phase 4 WAAPI zoom-out** — `zoomAnim` at `ui.js:873`. Can be replaced with instant style set.

### Quick Kill Switches

```js
// Disable all DOM band phases entirely (leaderboard still shows):
window.disableDomAttractBands = true;

// Switch to video attract:
window.useVideoAttract = true;
```

### CSS `prefers-reduced-motion`

Not yet implemented. Would suppress `ambientGlow`, `ambientPulse`, marquee animations, and transition durations.

---

## Working Conventions

- No build step — edit files directly, refresh browser.
- CSS custom properties (vars) are used throughout for theming and runtime values.
- `_getAttractMeasurements()` is cached after first call per `UIController` instance; bust it by setting `this.attractMeasurementsCache = null`.
- Timing constants (`attractReveal1Ms`, `attractGrowMs`, etc.) are properties on `UIController` — safe to tweak in `ui.js` constructor.
