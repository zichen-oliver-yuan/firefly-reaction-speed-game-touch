/** UI controller for touch-first gameplay. */

class UIController {
  constructor() {
    const runtimeConfig =
      (typeof window !== "undefined" && window.CONFIG) ||
      (typeof CONFIG !== "undefined" ? CONFIG : null) ||
      {};
    const ambientScrollConfig =
      (runtimeConfig.ui && runtimeConfig.ui.ambientLeaderboardScroll) || {};
    const parsedSpeedPxPerSecond = Number(ambientScrollConfig.speedPxPerSecond);
    const parsedTickMs = Number(ambientScrollConfig.tickMs);
    const parsedStepPxPerTick = Number(ambientScrollConfig.stepPxPerTick);
    const legacyTickMs =
      Number.isFinite(parsedTickMs) && parsedTickMs > 0 ? parsedTickMs : 40;
    const derivedLegacySpeed =
      Number.isFinite(parsedStepPxPerTick) && parsedStepPxPerTick >= 0
        ? (parsedStepPxPerTick * 1000) / legacyTickMs
        : null;
    this.currentScreen = null;
    this.currentScreenEl = null;
    this.transitionMs = 280;
    this.transitionTimer = null;
    this.transitionFromEl = null;
    this.transitionToEl = null;
    this.demoRefreshInterval = null;
    this.demoRefreshMs = 12000;
    this.demoLoadedOnce = false;
    this.lastLeaderboardInteractionTs = Date.now();
    this.ambientLeaderboardScrollEnabled =
      ambientScrollConfig.enabled !== false;
    this.ambientLeaderboardScrollDemoOnly =
      ambientScrollConfig.demoScreenOnly !== false;
    this.leaderboardAutoScrollSpeedPxPerSecond =
      Number.isFinite(parsedSpeedPxPerSecond) && parsedSpeedPxPerSecond >= 0
        ? parsedSpeedPxPerSecond
        : Number.isFinite(derivedLegacySpeed)
        ? derivedLegacySpeed
        : 18;
    this.leaderboardAutoScrollResumeDelayMs = Number.isFinite(
      ambientScrollConfig.resumeDelayMs
    )
      ? ambientScrollConfig.resumeDelayMs
      : 3500;
    this.leaderboardAutoScrollRafId = null;
    this.leaderboardAutoScrollLastFrameTs = null;
    this.leaderboardAutoScrollDebugLastLogTs = 0;
    this.leaderboardAutoScrollDirectionByList = {};
    this.leaderboardAutoScrollPositionByList = {};
    this.lastTimeValue = null;
    this.lastScoreValue = null;

    // Attract cycle timers (multi-step: reveal → grow → scroll → grid → lb → repeat)
    this.attractTimers = [];
    this.attractLbVisible = false;
    this.attractMeasurementsCache = null; // cached on first cycle, invalidated on resize

    // ── Phase timing (ms from cycle start) ──
    this.attractReveal1Ms = 1500; // Phase 1: magenta slides up
    this.attractReveal2Ms = 2500; // Phase 2: lime slides up
    this.attractGrowMs = 3800; // Phase 3: text grows + scrolls simultaneously
    this.attractGridMs = 9500; // Phase 4: zoom-out (all 12 bands)
    this.attractLbShowMs = 18000; // Leaderboard slides up
    this.attractLbHideMs = 30000; // Leaderboard hides → restart cycle (DOM mode)
    const uiConfig = runtimeConfig.ui || {};
    this.attractVideoHoldMs = Number.isFinite(uiConfig.attractVideoHoldMs)
      ? uiConfig.attractVideoHoldMs
      : 4000;

    // ── Marquee speed multiplier (applies to BOTH Phase 3 and Phase 4) ──
    // Multiplies each band's "speed" value to control scroll velocity.
    // Higher = slower scroll.  1 = fastest.  3 = 3× slower.
    this.phase4SpeedScale = 3;

    // ── Marquee speed per band ──
    // "speed" = base animation duration in seconds for one full loop.
    //   Lower number = FASTER scroll   (e.g. 3 = fast)
    //   Higher number = SLOWER scroll   (e.g. 12 = slow)
    // Actual duration = speed × phase4SpeedScale (both phases).

    // Original 3 bands (fill screen in Phase 3, shrink to 1/12 in Phase 4)
    this.attractBandConfigs = [
      { id: "attract-track-0", text: "PLAY TO WIN!", dir: "ltr", speed: 15 },
      { id: "attract-track-1", text: "$1,000", dir: "rtl", speed: 12 },
      { id: "attract-track-2", text: "CASH", dir: "ltr", speed: 20 },
    ];

    // Extra 9 bands (tiny slivers below fold in Phase 3, grow to 1/12 in Phase 4)
    this.attractExtraBandConfigs = [
      { id: "attract-track-3", text: "PLAY TO WIN!", dir: "rtl", speed: 15 },
      { id: "attract-track-4", text: "$1,000", dir: "ltr", speed: 12 },
      { id: "attract-track-5", text: "CASH", dir: "rtl", speed: 20 },
      { id: "attract-track-6", text: "PLAY TO WIN!", dir: "ltr", speed: 15 },
      { id: "attract-track-7", text: "$1,000", dir: "rtl", speed: 12 },
      { id: "attract-track-8", text: "CASH", dir: "ltr", speed: 20 },
      { id: "attract-track-9", text: "PLAY TO WIN!", dir: "rtl", speed: 15 },
      { id: "attract-track-10", text: "$1,000", dir: "ltr", speed: 12 },
      { id: "attract-track-11", text: "CASH", dir: "rtl", speed: 20 },
    ];

    this.initializeCountdownGrid();
    this.setupLedResizeHandler();
    this.setupLeaderboardUX();
  }

  updateState(state, nav = {}) {
    if (state !== "demo") {
      this.stopDemoRefresh();
      this.stopAttractCycle();
      this.stopLeaderboardAutoScroll();
      // Pause the video background when leaving the demo screen.
      if (window.useVideoAttract) {
        const video = document.querySelector(".attract-video-bg");
        if (video && !video.paused) video.pause();
      }
    }

    switch (state) {
      case "demo":
        this.showScreen("demo", nav.direction);
        this.clearLeadFormData();
        this.startDemoRefresh();
        this.startAttractCycle();
        break;
      case "countdown":
        this.stopAttractCycle();
        break;
      case "game_start":
      case "game_play":
        this.showScreen("game", nav.direction);
        this.initializeButtonGrid();
        break;
      case "show_score":
        this.showScreen("score", nav.direction);
        break;
      case "game_end":
        break;
      case "lead_form":
        this.clearLeadFormError();
        this.showLeadFormWithOverlay();
        break;
      case "show_leaderboard":
        this.showScreen("leaderboard", nav.direction);
        break;
      case "idle_warning":
        this.showScreen("idle-warning", nav.direction);
        break;
      default:
        this.showScreen("demo", nav.direction);
        this.startDemoRefresh();
    }
  }

  hideAllScreens() {
    const screens = document.querySelectorAll(".screen");
    screens.forEach((screen) => {
      screen.classList.add("hidden");
      screen.classList.remove("fade-enter", "fade-exit");
      screen.style.opacity = "";
      screen.style.transition = "";
      this.clearContentMotion(screen);
    });
  }

  getContentMotionNodes(screen) {
    if (!screen) return [];
    return Array.from(
      screen.querySelectorAll(".screen-main, .bottom-cta-wrap")
    );
  }

  setContentMotion(screen, translatePct, withTransition) {
    const nodes = this.getContentMotionNodes(screen);
    nodes.forEach((node) => {
      node.style.transition = withTransition
        ? `transform ${this.transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "none";
      node.style.transform = `translateX(${translatePct}%)`;
    });
  }

  clearContentMotion(screen) {
    const nodes = this.getContentMotionNodes(screen);
    nodes.forEach((node) => {
      node.style.transition = "";
      node.style.transform = "";
    });
  }

  showScreen(screenId, direction = "forward") {
    const nextScreen = document.getElementById(`screen-${screenId}`);
    if (!nextScreen) return;

    this.settlePendingTransition();

    const previous = this.currentScreenEl;
    if (!previous || previous === nextScreen) {
      this.hideAllScreens();
      nextScreen.classList.remove("hidden");
      this.currentScreen = screenId;
      this.currentScreenEl = nextScreen;
      console.log(`[UI] screen loaded: ${screenId}`);
      this.refreshLedMarquee();
      this.updateLeaderboardUX();
      return;
    }

    this.transitionFromEl = previous;
    this.transitionToEl = nextScreen;
    nextScreen.classList.remove("hidden");
    const isBack = direction === "back";
    const enterFrom = isBack ? -14 : 14;
    const exitTo = isBack ? 14 : -14;

    nextScreen.style.opacity = "0";
    previous.style.opacity = "1";
    nextScreen.style.transition = `opacity ${this.transitionMs}ms ease`;
    previous.style.transition = `opacity ${this.transitionMs}ms ease`;

    this.setContentMotion(nextScreen, enterFrom, false);
    this.setContentMotion(previous, 0, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.setContentMotion(nextScreen, 0, true);
        this.setContentMotion(previous, exitTo, true);
        nextScreen.style.opacity = "1";
        previous.style.opacity = "0";
      });
    });

    this.transitionTimer = setTimeout(() => {
      this.commitTransition(screenId);
    }, this.transitionMs + 30);
  }

  settlePendingTransition() {
    if (!this.transitionTimer) return;
    clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    const resolvedScreenId = this.transitionToEl
      ? this.transitionToEl.id.replace("screen-", "")
      : this.currentScreen || "demo";
    this.commitTransition(resolvedScreenId);
  }

  commitTransition(screenId) {
    if (this.transitionFromEl) {
      this.transitionFromEl.classList.add("hidden");
      this.transitionFromEl.classList.remove("fade-enter", "fade-exit");
      this.transitionFromEl.style.opacity = "";
      this.transitionFromEl.style.transition = "";
      this.clearContentMotion(this.transitionFromEl);
    }
    if (this.transitionToEl) {
      this.transitionToEl.classList.remove("fade-enter", "fade-exit");
      this.transitionToEl.classList.remove("hidden");
      this.transitionToEl.style.opacity = "";
      this.transitionToEl.style.transition = "";
      this.clearContentMotion(this.transitionToEl);
      this.currentScreenEl = this.transitionToEl;
    }
    this.currentScreen = screenId;
    this.transitionFromEl = null;
    this.transitionToEl = null;
    this.refreshLedMarquee();
    this.updateLeaderboardUX();
    console.log(`[UI] screen loaded: ${screenId}`);
  }

  setupLeaderboardUX() {
    const backTopBtn = document.getElementById("leaderboard-back-top-btn");
    if (backTopBtn) {
      backTopBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      backTopBtn.addEventListener("click", (event) => {
        event.preventDefault();
        const list = this.getActiveLeaderboardList();
        if (list) {
          list.scrollTo({ top: 0, behavior: "smooth" });
        }
        this.markLeaderboardInteraction();
      });
    }

    const bindList = (list) => {
      if (!list || list.dataset.uxBound === "1") return;
      list.dataset.uxBound = "1";

      list.addEventListener(
        "pointerdown",
        () => this.markLeaderboardInteraction(),
        { passive: true }
      );
      list.addEventListener(
        "touchstart",
        () => this.markLeaderboardInteraction(),
        { passive: true }
      );
      list.addEventListener("wheel", () => this.markLeaderboardInteraction(), {
        passive: true,
      });
      list.addEventListener(
        "scroll",
        () => this.updateBackTopButtonVisibility(),
        { passive: true }
      );
    };

    bindList(document.getElementById("demo-leaderboard-list"));
    bindList(document.getElementById("leaderboard-list"));
  }

  updateLeaderboardUX() {
    this.updateBackTopButtonVisibility();
    this.startLeaderboardAutoScroll();
  }

  getActiveLeaderboardList() {
    if (this.currentScreen === "demo") {
      return document.getElementById("demo-leaderboard-list");
    }
    if (this.currentScreen === "leaderboard") {
      return document.getElementById("leaderboard-list");
    }
    return null;
  }

  markLeaderboardInteraction() {
    this.lastLeaderboardInteractionTs = Date.now();
    const list = this.getActiveLeaderboardList();
    if (list) {
      const listKey = list.id || "default";
      this.leaderboardAutoScrollPositionByList[listKey] = list.scrollTop;
    }
    this.updateBackTopButtonVisibility();
  }

  updateBackTopButtonVisibility() {
    const button = document.getElementById("leaderboard-back-top-btn");
    if (!button) return;

    // Never show on game-end leaderboard (HOME button handles that) or demo screen.
    if (this.currentScreen === "leaderboard" || this.currentScreen === "demo") {
      button.classList.add("hidden");
      return;
    }

    const list = this.getActiveLeaderboardList();
    if (!list) {
      button.classList.add("hidden");
      return;
    }

    const shouldShow = list.scrollTop > 120;
    button.classList.toggle("hidden", !shouldShow);
  }

  startLeaderboardAutoScroll() {
    this.stopLeaderboardAutoScroll();
    if (!this.ambientLeaderboardScrollEnabled) return;
    if (this.ambientLeaderboardScrollDemoOnly && this.currentScreen !== "demo")
      return;

    const tick = (timestampMs) => {
      this.leaderboardAutoScrollRafId = window.requestAnimationFrame(tick);

      if (!this.ambientLeaderboardScrollEnabled) return;
      if (
        this.ambientLeaderboardScrollDemoOnly &&
        this.currentScreen !== "demo"
      )
        return;

      const list = this.getActiveLeaderboardList();
      if (!list) {
        this.leaderboardAutoScrollLastFrameTs = timestampMs;
        return;
      }
      // Demo ambient scroll should only run while the demo leaderboard panel is visible.
      if (this.currentScreen === "demo" && !this.attractLbVisible) {
        this.leaderboardAutoScrollLastFrameTs = timestampMs;
        return;
      }
      if (list.scrollHeight <= list.clientHeight + 2) {
        this.leaderboardAutoScrollLastFrameTs = timestampMs;
        return;
      }
      if (
        Date.now() - this.lastLeaderboardInteractionTs <
        this.leaderboardAutoScrollResumeDelayMs
      ) {
        this.leaderboardAutoScrollLastFrameTs = timestampMs;
        return;
      }

      if (!Number.isFinite(this.leaderboardAutoScrollLastFrameTs)) {
        this.leaderboardAutoScrollLastFrameTs = timestampMs;
        return;
      }

      // Cap per-frame delta to avoid jumpy catch-up after tab/background throttling.
      const deltaSec = Math.min(
        (timestampMs - this.leaderboardAutoScrollLastFrameTs) / 1000,
        0.05
      );
      this.leaderboardAutoScrollLastFrameTs = timestampMs;
      if (deltaSec <= 0) return;

      const listKey = list.id || "default";
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      let direction = this.leaderboardAutoScrollDirectionByList[listKey] ?? 1;
      let virtualTop = this.leaderboardAutoScrollPositionByList[listKey];
      if (!Number.isFinite(virtualTop)) virtualTop = list.scrollTop;

      if (virtualTop >= maxScrollTop - 2) direction = -1;
      if (virtualTop <= 2) direction = 1;

      this.leaderboardAutoScrollDirectionByList[listKey] = direction;
      const movementPx = this.leaderboardAutoScrollSpeedPxPerSecond * deltaSec;
      const nextTop = virtualTop + movementPx * direction;
      const clampedTop = Math.max(0, Math.min(maxScrollTop, nextTop));
      this.leaderboardAutoScrollPositionByList[listKey] = clampedTop;
      list.scrollTop = clampedTop;
      if (timestampMs - this.leaderboardAutoScrollDebugLastLogTs >= 250) {
        this.leaderboardAutoScrollDebugLastLogTs = timestampMs;
        const signedSpeed =
          this.leaderboardAutoScrollSpeedPxPerSecond * direction;
        console.log(
          `[ambient-scroll] list=${listKey} speed=${signedSpeed.toFixed(
            1
          )}px/s scrollTop=${clampedTop.toFixed(1)} max=${maxScrollTop.toFixed(
            1
          )}`
        );
      }
      this.updateBackTopButtonVisibility();
    };

    this.leaderboardAutoScrollLastFrameTs = null;
    this.leaderboardAutoScrollDebugLastLogTs = 0;
    this.leaderboardAutoScrollRafId = window.requestAnimationFrame(tick);
  }

  stopLeaderboardAutoScroll() {
    if (this.leaderboardAutoScrollRafId) {
      window.cancelAnimationFrame(this.leaderboardAutoScrollRafId);
      this.leaderboardAutoScrollRafId = null;
    }
    this.leaderboardAutoScrollLastFrameTs = null;
    this.leaderboardAutoScrollDebugLastLogTs = 0;
  }

  setupLedResizeHandler() {
    this.onResize = () => {
      this.attractMeasurementsCache = null;
      this.refreshLedMarquee();
    };
    window.addEventListener("resize", this.onResize);
  }

  refreshLedMarquee() {
    const subtitleEls = document.querySelectorAll(".led-row-sub .led-subtitle");
    subtitleEls.forEach((el) => {
      const row = el.closest(".led-row-sub");
      if (!row) return;

      if (!el.dataset.baseText) {
        el.dataset.baseText = (el.textContent || "").trim();
      }
      const baseText = el.dataset.baseText || "";
      const marqueeSig = `${baseText}|${row.clientWidth}`;
      if (el.dataset.marqueeSig === marqueeSig) {
        return;
      }

      el.classList.remove("is-marquee");
      el.style.removeProperty("--marquee-duration");
      el.textContent = baseText;

      if (el.scrollWidth <= row.clientWidth - 24) {
        el.dataset.marqueeSig = marqueeSig;
        return;
      }

      // Use a fixed marquee duration to avoid per-element width calculations.
      const duration = 12;
      el.style.setProperty("--marquee-duration", `${duration}s`);
      el.innerHTML = `
        <span class="led-marquee-track">
          <span class="led-marquee-copy">${baseText}</span>
          <span class="led-marquee-copy" aria-hidden="true">${baseText}</span>
        </span>
      `;
      el.classList.add("is-marquee");
      el.dataset.marqueeSig = marqueeSig;
    });
  }

  initializeCountdownGrid() {
    // countdown-grid removed in new design — no-op kept for safety
  }

  /** Show or hide the demo leaderboard panel. */
  setDemoLeaderboardVisible(visible) {
    const panel = document.getElementById("demo-lb-panel");
    if (!panel) return;
    this.attractLbVisible = visible;
    panel.classList.toggle("visible", visible);
  }

  /**
   * Reset attract to Phase 0 instantly (no transition flash of colour bands).
   * Rebuilds each band track back to a single seed item.
   */
  resetAttractPhase() {
    if (window.useVideoAttract || window.disableDomAttractBands)
      return; /* bands hidden/unused — skip DOM work */
    console.log("[attract] Phase 0 – reset");
    const bands = document.getElementById("attract-bands");
    if (bands) {
      // Disable transitions FIRST so no in-between state is ever rendered.
      // (Previously scale was cleared before class removal, causing a one-frame
      // flash where attract-growing + scale(1) made all 12 bands visible.)
      bands.querySelectorAll(".attract-band").forEach((b) => {
        b.style.transition = "none";
      });
      // Cancel container WAAPI, then remove all classes and inline scale atomically.
      bands.getAnimations().forEach((a) => a.cancel());
      bands.classList.remove(
        "attract-phase-1",
        "attract-phase-2",
        "attract-growing",
        "attract-scrolling",
        "attract-phase4"
      );
      bands.style.scale = "";
      // Reflow NOW — committed state is clean Phase 0 (no grow, no scale).
      void bands.offsetHeight;
      // Re-enable transitions on the next paint.
      requestAnimationFrame(() => {
        bands.querySelectorAll(".attract-band").forEach((b) => {
          b.style.transition = "";
        });
      });
    }

    const resetTrack = (id, text) => {
      const track = document.getElementById(id);
      if (!track) return;
      // If track was wrapped in a scaler, unwrap it back into the band
      const scaler = track.closest(".attract-track-scaler");
      if (scaler) {
        scaler.parentNode.insertBefore(track, scaler);
        scaler.remove();
      }
      track.style.animation = "";
      track.style.transform = "";
      track.style.justifyContent = "";
      track.style.width = "";
      track.style.removeProperty("--marquee-dist");
      track.innerHTML = "";
      const s = document.createElement("span");
      s.className = "attract-item";
      s.textContent = text;
      track.appendChild(s);
    };

    // Rebuild each original track with a single seed item (small font-size)
    this.attractBandConfigs.forEach(({ id, text }) => resetTrack(id, text));
    // Reset extra band tracks to a single seed item and clear Phase 3 inline styles
    this.attractExtraBandConfigs.forEach(({ id, text }) => {
      resetTrack(id, text);
      const band = document.getElementById(id)?.closest(".attract-band");
      if (band) {
        band.style.display = "";
        band.style.contentVisibility = "";
      }
    });
  }

  /**
   * Phase 3 — grow text AND scroll simultaneously for ALL 12 bands.
   *
   * Performance: font-size is set once to the large Phase 3 value (fixed).
   * Visual scaling during Phase 2→3 and Phase 3→4 is handled by the CSS `scale`
   * property on a wrapper (.attract-track-scaler) — compositor-only, zero layout cost.
   *
   * Phase 2→3 grow: scaler starts at (currentSmallFont / largeFontSize) so text
   * appears at the Phase 2 visual size, then transitions scale to 1 — recreating
   * the old font-size grow animation without any layout thrashing.
   *
   * The track itself uses `transform: translateX()` for the marquee, which
   * composes correctly because `scale` lives on the outer wrapper.
   */
  _getAttractMeasurements() {
    if (this.attractMeasurementsCache) return this.attractMeasurementsCache;

    const bands = document.getElementById("attract-bands");
    if (!bands) return null;

    // Use simple viewport-based sizing and fixed values to avoid heavy layout work.
    const viewportH =
      window.innerHeight || document.documentElement?.clientHeight || 1080;
    const viewportW =
      window.innerWidth || document.documentElement?.clientWidth || 1080;

    // Adaptive band count: totalBands controls how many rows appear in the Phase 4 grid.
    // scalerScale = totalBands / 3 is now applied to individual original-band scalers
    // (NOT the container) — this keeps totalBands and the GPU compositor budget decoupled.
    // On 4K we still reduce totalBands so each scaler layer stays manageable.
    const totalPx = viewportW * viewportH;
    let totalBands;
    if (totalPx > 6_000_000) {
      // ~4K → 6 bands, scalerScale 2
      totalBands = 6;
    } else if (totalPx > 3_000_000) {
      // ~1440p → 9 bands, scalerScale 3
      totalBands = 9;
    } else {
      // 1080p → 12 bands, scalerScale 4
      totalBands = 12;
    }
    // scalerScale: applied to each original .attract-track-scaler in Phase 3 (not the container).
    // Phase 3 visual: fontSizeSmall × scalerScale = visually large text filling the band.
    const containerScale = totalBands / 3; // kept as containerScale for minimal rename churn
    const extraBandCount = totalBands - 3;

    // fontSizeSmall: actual DOM font-size for all items in all bands (Phase 4 size).
    // In Phase 3 the scaler scale makes originals appear (fontSizeSmall × scalerScale) tall.
    const largeFontSize = (viewportH / totalBands) * 0.9; // named largeFontSize for compat

    console.log(
      `[attract] _getAttractMeasurements: viewportH=${viewportH}, viewportW=${viewportW}, totalPx=${totalPx}, totalBands=${totalBands}, scalerScale=${containerScale}, extraBandCount=${extraBandCount}, fontSizeSmall=${largeFontSize.toFixed(1)}`
    );
    this.attractMeasurementsCache = {
      largeFontSize,
      containerScale,
      totalBands,
      extraBandCount,
    };
    return this.attractMeasurementsCache;
  }

  startAttractScroll() {
    try {
      const bands = document.getElementById("attract-bands");
      if (!bands) {
        console.error("[attract] startAttractScroll: #attract-bands not found");
        return;
      }

      const m = this._getAttractMeasurements();
      if (!m) {
        console.error(
          "[attract] startAttractScroll: measurements unavailable, aborting"
        );
        return;
      }
      const {
        largeFontSize,
        containerScale,
        extraBandCount,
      } = m;

      // Only use the first `extraBandCount` extra bands (adaptive for 4K).
      const activeExtras = this.attractExtraBandConfigs.slice(
        0,
        extraBandCount
      );
      const allConfigs = [...this.attractBandConfigs, ...activeExtras];

      // Hide unused extra bands so they don't participate in flex layout.
      // Active extras are off-screen during Phase 3 (container scale pushes them below
      // viewport). content-visibility:hidden tells Chrome to skip painting their content
      // entirely while they are invisible, saving paint and raster work.
      this.attractExtraBandConfigs.forEach(({ id }, i) => {
        const band = document.getElementById(id)?.closest(".attract-band");
        if (band) {
          band.style.display = i < extraBandCount ? "" : "none";
          if (i < extraBandCount) band.style.contentVisibility = "hidden";
        }
      });
      console.log(`[attract] startAttractScroll: classes="${bands.className}"`);
      console.log(
        `[attract] startAttractScroll: fontSizeSmall=${largeFontSize.toFixed(1)}, scalerScale=${containerScale}`
      );

      // 2. Build each track with copies at large font size, wrap in scaler, start scrolling.
      //    originalScalers: rows 0-2 — get WAAPI grow animation (initialScale → 1).
      //    Extra bands (rows 3-11): scaler set to scale(1) immediately. They are
      //    off-screen during Phase 3 (container scale 4 pushes them below viewport)
      //    so no visible artifact, and they are ready when Phase 4 reveals them.
      const originalScalers = [];
      allConfigs.forEach(({ id, text, dir, speed }, i) => {
        const isExtra = i >= this.attractBandConfigs.length;
        const track = document.getElementById(id);
        if (!track) {
          console.error(`[attract] startAttractScroll: track #${id} not found`);
          return;
        }

        // Seed one item, measure its rendered width, then fill with the minimum
        // number of copies for a seamless translateX(-50%) loop.
        // Binding constraint: Phase 4 (container scale=1, full viewport visible).
        // Need: half-track-width ≥ viewportW  →  copiesNeeded = ceil(viewportW / itemW).
        const viewportW =
          window.innerWidth || document.documentElement?.clientWidth || 1920;
        track.innerHTML = "";
        track.style.justifyContent = "flex-start";
        track.style.width = "max-content";
        const seedItem = document.createElement("span");
        seedItem.className = "attract-item";
        seedItem.style.fontSize = `${largeFontSize}px`;
        seedItem.textContent = text;
        track.appendChild(seedItem);
        void seedItem.offsetWidth; // force reflow for accurate measurement
        const itemW = seedItem.offsetWidth || 1;
        const minCopies = Math.ceil(viewportW / itemW);
        const totalItems = Math.max(minCopies * 2, 4); // 2 halves; floor at 4
        console.log(
          `[attract] track #${id}: itemW=${itemW}px, minCopies=${minCopies}, totalItems=${totalItems}`
        );
        for (let j = 1; j < totalItems; j++) {
          track.appendChild(seedItem.cloneNode(true));
        }

        // Wrap track in a scaler div (scale on wrapper, translateX marquee on track).
        const band = track.closest(".attract-band");
        let scaler = track.closest(".attract-track-scaler");
        if (!scaler) {
          scaler = document.createElement("div");
          scaler.className = "attract-track-scaler";
          // All scalers start at scale(1). Originals grow to scale(containerScale) via
          // WAAPI below; scale(1) matches Phase 2 text size exactly since fontSizeSmall
          // is the same value as the CSS clamp() in phases 0-2. Extras stay at scale(1)
          // (flex-grow:0 keeps them zero-height and off-screen until Phase 4).
          scaler.style.scale = "1";
          band.insertBefore(scaler, track);
          scaler.appendChild(track);
        }
        if (!isExtra) originalScalers.push(scaler);

        const dur = speed * this.phase4SpeedScale;
        const animName =
          dir === "ltr" ? "attractScrollLTR" : "attractScrollRTL";
        track.style.animation = `${animName} ${dur}s linear infinite`;
      });

      // 3. Snap to Phase 3 layout without any CSS flex-grow transition.
      //    .attract-band has `transition: flex-grow 0.9s` which, if allowed to run,
      //    would animate flex-grows from Phase 2 values (~1.05–1.10) before the
      //    attract-growing class normalises originals to equal thirds — visually
      //    harmless but unnecessary. Suppress then re-enable via rAF as before.
      bands.querySelectorAll(".attract-band").forEach((b) => {
        b.style.transition = "none";
      });
      // Container stays at scale(1) — no container scale in Phase 3.
      bands.style.scale = "";
      bands.classList.add("attract-growing");

      // 4. Force layout — commits all changes as one rendered frame.
      void bands.offsetHeight;

      // Re-enable flex-grow transitions for Phase 3→4 (the attract-phase4 class
      // doesn't change flex-grow here, but restoring the rule keeps CSS consistent).
      requestAnimationFrame(() => {
        bands.querySelectorAll(".attract-band").forEach((b) => {
          b.style.transition = "";
        });
      });

      // 5. WAAPI grow on original scalers only: scale(1 → containerScale).
      //    scale(1) matches Phase 2 text size (fontSizeSmall = CSS clamp() value).
      //    Grows to scale(containerScale) so text visually = fontSizeSmall × scalerScale
      //    = viewportH/3×0.9 (fills the band). fill:'none' + finish handler commits
      //    the final scale as inline style so the next cycle's scale(1) reset is clean.
      //    Extra band scalers stay at scale(1) — they are zero-height during Phase 3.
      console.log(
        `[attract] startAttractScroll: WAAPI grow on ${originalScalers.length} original scalers (1 → ${containerScale})`
      );
      originalScalers.forEach((s) => {
        const anim = s.animate(
          [{ scale: "1" }, { scale: String(containerScale) }],
          {
            duration: 900,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "none",
          }
        );
        anim.addEventListener("cancel", () =>
          console.warn("[attract] scaler grow animation cancelled")
        );
        anim.addEventListener("finish", () => {
          s.style.scale = String(containerScale);
          console.log(`[attract] scaler grow finished — pinned at scale(${containerScale})`);
        });
      });
      console.log(
        `[attract] startAttractScroll: done, bands.className="${bands.className}", bands.style.scale="${bands.style.scale}"`
      );
    } catch (err) {
      console.error("[attract] startAttractScroll threw:", err);
    }
  }

  /**
   * Phase 4: zoom-out — the .attract-bands container animates scale(N → 1).
   *
   * N = containerScale (adaptive: 4 on 1080p, 2 on 4K) so the virtual
   * composited area stays manageable on high-resolution displays.
   *
   * All active bands already have flex-grow:1 (equal DOM height) and
   * their scalers at scale(1).  The container was at scale(N) during Phase 3,
   * showing only the top 3 bands. Animating to scale(1) reveals all bands
   * proportionally — a true zoom-out with zero layout recalculation (compositor-only).
   */
  showAttractPhase4() {
    const bands = document.getElementById("attract-bands");
    if (!bands) {
      console.error("[attract] showAttractPhase4: #attract-bands not found");
      return;
    }

    const m = this._getAttractMeasurements();
    const cs = m ? m.containerScale : 4; // scalerScale for original bands
    console.log(
      `[attract] showAttractPhase4: scalerScale=${cs}, bands.className="${bands.className}"`
    );

    // Pin original scalers at scale(cs) — cancel any in-progress Phase 3 grow WAAPI
    // (defensive; grow should have finished long before Phase 4 starts at 9500ms).
    // Extras stay at scale(1) — they were never animated.
    const originalScalers = Array.from(
      bands.querySelectorAll(".attract-band:not(.attract-band-extra) .attract-track-scaler")
    );
    originalScalers.forEach((scaler) => {
      scaler.getAnimations().forEach((a) => a.cancel());
      scaler.style.scale = String(cs);
    });

    // Clear container scale (defensive — container should already be at scale(1)/unset).
    bands.style.scale = "";

    // Restore painting for extra bands before the flush so Chrome rasters them
    // in time for the Phase 4 reveal.
    bands.querySelectorAll(".attract-band-extra").forEach((b) => {
      b.style.contentVisibility = "";
    });

    void bands.offsetHeight; // commit all cleanup before starting animations

    // Phase 4 animation A: WAAPI scale(cs→1) on each original scaler.
    // Visually: large text compresses to Phase 4 size as the band height shrinks.
    // fill:'none' + finish handler commits the final scale so the next cycle is clean.
    originalScalers.forEach((scaler) => {
      const anim = scaler.animate(
        [{ scale: String(cs) }, { scale: "1" }],
        {
          duration: 900,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "none",
        }
      );
      anim.addEventListener("cancel", () =>
        console.warn("[attract] Phase 4 scaler zoom-out cancelled")
      );
      anim.addEventListener("finish", () => {
        scaler.style.scale = "1";
        console.log("[attract] Phase 4 scaler zoom-out finished – pinned at scale(1)");
      });
    });

    // Phase 4 animation B: CSS flex-grow transition on extra bands (0→1).
    // Triggered by adding attract-phase4 class (sets all .attract-band to flex-grow:1).
    // Extras have `transition: flex-grow 0.9s` (added in CSS), so they animate in.
    // Originals stay at flex-grow:1 — their height naturally decreases as extras
    // grow in and share the total flex space (3 → 12 bands worth).
    bands.classList.remove(
      "attract-phase-1",
      "attract-phase-2",
      "attract-growing",  // removing this also unpauses extra band marquee animations
      "attract-scrolling"
    );
    bands.classList.add("attract-phase4");
    console.log(
      `[attract] showAttractPhase4: done, bands.className="${bands.className}"`
    );
  }

  /**
   * Bind the video `ended` handler exactly once.
   * On each playback end: hold on frame 0 for `attractVideoHoldMs`, hide the
   * leaderboard (exit animation), then replay and restart the attract cycle.
   */
  _bindVideoAttractEnded() {
    if (this._videoAttractEndedBound) return;
    const video = document.querySelector(".attract-video-bg");
    if (!video) return;
    this._videoAttractEndedBound = true;

    video.addEventListener("ended", () => {
      if (!window.useVideoAttract) return;
      // Seek to frame 0 while the leaderboard is still covering the video.
      // Only dismiss the leaderboard once the seek completes and frame 0 is
      // decoded — this prevents a flash of the last frame behind the panel.
      video.currentTime = 0;
      video.pause();

      const onFirstFrameReady = () => {
        if (!window.useVideoAttract) return;
        this.setDemoLeaderboardVisible(false);
        const LB_SLIDE_MS = 650;
        const POST_LB_DELAY_MS = 2000;
        console.log(
          `[attract] frame 0 ready — leaderboard hiding, replaying in ${LB_SLIDE_MS + POST_LB_DELAY_MS}ms`
        );
        const t = setTimeout(() => {
          if (!window.useVideoAttract) return;
          this.startAttractCycle();
        }, LB_SLIDE_MS + POST_LB_DELAY_MS);
        this.attractTimers.push(t);
      };

      // `seeked` fires once the browser has decoded the target frame.
      // Guard with a timeout in case the event never fires (e.g. broken src).
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("seeked", settle);
        onFirstFrameReady();
      };
      video.addEventListener("seeked", settle, { once: true });
      const fallback = setTimeout(settle, 500);
      this.attractTimers.push(fallback);
    });
  }

  /** Start the multi-step attract cycle. */
  startAttractCycle() {
    this._cycleId = (this._cycleId ?? 0) + 1;
    console.log(`[attract] Cycle ${this._cycleId} start`);
    this.stopAttractCycle();
    this.resetAttractPhase(); // no-ops in video/disabled mode
    this.setDemoLeaderboardVisible(false);

    const cycleId = this._cycleId;
    const at = (delay, fn) => {
      const t = setTimeout(fn, delay);
      this.attractTimers.push(t);
    };

    // Video mode: bind ended handler (once) and play from the beginning.
    if (window.useVideoAttract) {
      this._bindVideoAttractEnded();
      const video = document.querySelector(".attract-video-bg");
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }

    // Run DOM band animation phases only when not in video/disabled mode.
    if (!window.useVideoAttract && !window.disableDomAttractBands) {
      const bands = document.getElementById("attract-bands");

      // Phase 1 – magenta slides up
      at(this.attractReveal1Ms, () => {
        console.log(`[attract] Cycle ${cycleId} – Phase 1`);
        if (bands) bands.classList.add("attract-phase-1");
      });

      // Phase 2 – lime slides up
      at(this.attractReveal2Ms, () => {
        console.log(`[attract] Cycle ${cycleId} – Phase 2`);
        if (bands) bands.classList.add("attract-phase-2");
      });

      // Phase 3 – text grows AND scrolls simultaneously
      at(this.attractGrowMs, () => {
        console.log(
          `[attract] Cycle ${cycleId} – Phase 3 (startAttractScroll)`
        );
        this.startAttractScroll();
      });

      // Phase 4 – zoom-out: bands compress to 1/12 height, extra rows rise into view
      at(this.attractGridMs, () => {
        console.log(`[attract] Cycle ${cycleId} – Phase 4 (showAttractPhase4)`);
        this.showAttractPhase4();
      });
    }

    // Leaderboard show timer — all modes except recording.
    if (!window.isRecordingMode) {
      at(this.attractLbShowMs, () => {
        console.log(`[attract] Cycle ${cycleId} – Leaderboard show`);
        this.setDemoLeaderboardVisible(true);
      });

      // DOM mode only: timer-driven hide + restart.
      // Video mode: leaderboard hide + restart are driven by video.ended above.
      if (!window.useVideoAttract) {
        at(this.attractLbHideMs, () => {
          console.log(
            `[attract] Cycle ${cycleId} – Leaderboard hide, restarting`
          );
          this.setDemoLeaderboardVisible(false);
          this.startAttractCycle();
        });
      }
    } else {
      // Recording mode: no leaderboard overlay; timer-driven restart (DOM only).
      if (!window.useVideoAttract) {
        at(this.attractLbHideMs, () => {
          console.log(
            `[attract] Cycle ${cycleId} – restart (recording mode, no leaderboard)`
          );
          this.startAttractCycle();
        });
      }
    }
  }

  stopAttractCycle() {
    this.attractTimers.forEach((t) => clearTimeout(t));
    this.attractTimers = [];
    this.setDemoLeaderboardVisible(false);
    this.resetAttractPhase();
  }

  /**
   * DEBUG: Skip directly to a specific attract phase for testing.
   * Usage: ui.debugSkipToPhase('phase1') or ui.debugSkipToPhase('leaderboard')
   * Phases: 'phase1', 'phase2', 'phase3', 'phase4', 'leaderboard'
   */
  debugSkipToPhase(phaseName) {
    console.log(`[debug] Skipping to ${phaseName}`);
    this.stopAttractCycle();
    const bands = document.getElementById("attract-bands");
    if (!bands) return;

    switch (phaseName) {
      case "phase1":
        bands.classList.add("attract-phase-1");
        break;

      case "phase2":
        bands.classList.add("attract-phase-1", "attract-phase-2");
        break;

      case "phase3":
        // Phase 3: 3 large bands, scrolling. Container stays at scale(1);
        // startAttractScroll() applies scale(cs) to individual original scalers.
        bands.classList.add(
          "attract-phase-1",
          "attract-phase-2",
          "attract-growing"
        );
        // Schedule track building in next moment to let layout settle
        setTimeout(() => {
          this.startAttractScroll();
        }, 50);
        break;

      case "phase4":
        // Phase 4: adaptive-band grid. Container stays at scale(1).
        bands.classList.add(
          "attract-phase-1",
          "attract-phase-2",
          "attract-growing"
        );
        // Build tracks first
        setTimeout(() => {
          this.startAttractScroll();
          // Then trigger Phase 4 after Phase 3 would normally end (0.9s grow + margin)
          setTimeout(() => {
            this.showAttractPhase4();
          }, 1100);
        }, 50);
        break;

      case "leaderboard":
        // Leaderboard: grid visible + leaderboard panel up
        bands.classList.add(
          "attract-phase-1",
          "attract-phase-2",
          "attract-phase4"
        );
        bands.style.scale = "";
        this.setDemoLeaderboardVisible(true);
        break;

      default:
        console.warn(
          `[debug] Unknown phase: ${phaseName}. Valid: phase1, phase2, phase3, phase4, leaderboard`
        );
    }
  }

  initializeButtonGrid() {
    const grid = document.getElementById("button-grid");
    if (!grid) return;
    if (grid.children.length === 54) return;

    grid.innerHTML = "";
    for (let i = 0; i < 54; i++) {
      const button = document.createElement("div");
      button.className = "game-button";
      button.dataset.index = i;
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", `Button ${i + 1}`);
      grid.appendChild(button);
    }
  }

  /** Flash the MISSED! overlay for a short duration. */
  showMissedOverlay(durationMs = 700) {
    this._showWarningOverlay("MISSED!", durationMs);
  }

  showRedPressOverlay(durationMs = 900) {
    this._showWarningOverlay("SHOULD HAVE WAITED IT OUT!", durationMs);
  }

  _showWarningOverlay(text, durationMs) {
    const el = document.getElementById("missed-overlay");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(this._missedOverlayTimeout);
    this._missedOverlayTimeout = setTimeout(() => {
      el.classList.add("hidden");
    }, durationMs);
  }

  hideMissedOverlay() {
    const el = document.getElementById("missed-overlay");
    if (!el) return;
    el.classList.add("hidden");
    clearTimeout(this._missedOverlayTimeout);
  }

  updateTutorialStep() {
    const stepEl = document.getElementById("tutorial-step");
    if (!stepEl) return;

    stepEl.innerHTML = `
      <div class="tutorial-media-placeholder"></div>
      <div class="tutorial-copy">${this.tutorialData.copy}</div>
    `;
    this.refreshLedMarquee();
  }

  nextTutorialStep() {
    if (window.game) {
      window.game.finishTutorial();
    }
  }

  prevTutorialStep() {
    // no-op: single page tutorial
  }

  async startDemoRefresh() {
    this.stopDemoRefresh();

    const shouldRefresh =
      !this.demoLoadedOnce ||
      !window.game ||
      typeof window.game.shouldRefreshDemoLeaderboard !== "function" ||
      window.game.shouldRefreshDemoLeaderboard();

    if (!shouldRefresh) {
      return;
    }

    await this.renderDemoLeaderboard().catch(() => {});
    this.demoLoadedOnce = true;
    if (
      window.game &&
      typeof window.game.markDemoLeaderboardRendered === "function"
    ) {
      window.game.markDemoLeaderboardRendered();
    }
  }

  stopDemoRefresh() {
    if (this.demoRefreshInterval) {
      clearInterval(this.demoRefreshInterval);
      this.demoRefreshInterval = null;
    }
  }

  async renderDemoLeaderboard() {
    const listEl = document.getElementById("demo-leaderboard-list");
    if (!listEl) return;

    const hasGame = !!window.game;
    const hasCacheGetter =
      hasGame && typeof window.game.getCachedRemoteLeaderboard === "function";
    const cachedLeaderboard = hasCacheGetter
      ? window.game.getCachedRemoteLeaderboard(1000)
      : [];

    if (cachedLeaderboard.length > 0) {
      this.renderLeaderboardRows(listEl, cachedLeaderboard, null, false);
    } else {
      this.renderLoadingRow(listEl, "LOADING...");
    }

    const canFetchRemote = typeof navigator === "undefined" || navigator.onLine;
    if (
      !canFetchRemote ||
      !window.game ||
      typeof window.game.getRemoteLeaderboard !== "function"
    ) {
      if (cachedLeaderboard.length === 0) {
        this.renderLoadingRow(listEl, "OFFLINE");
      }
      return;
    }

    const remoteLeaderboard = await window.game.getRemoteLeaderboard(1000);
    if (Array.isArray(remoteLeaderboard) && remoteLeaderboard.length > 0) {
      this.renderLeaderboardRows(listEl, remoteLeaderboard, null, false);
      return;
    }

    if (cachedLeaderboard.length === 0) {
      this.renderLeaderboardRows(listEl, [], null, false);
    }
  }

  renderLoadingRow(listEl, text = "LOADING...") {
    listEl.innerHTML = "";
    const row = document.createElement("div");
    row.className = "leaderboard-entry";
    row.innerHTML = `<span>${text}</span>`;
    listEl.appendChild(row);
    this.updateBackTopButtonVisibility();
  }

  renderLeaderboardRows(
    listEl,
    leaderboard,
    playerSummary = null,
    includePtsSuffix = true
  ) {
    listEl.innerHTML = "";

    if (!leaderboard || leaderboard.length === 0) {
      if (playerSummary && playerSummary.playerData) {
        const row = document.createElement("div");
        row.className = "leaderboard-entry player-highlight";
        row.innerHTML = `
          <span>${
            playerSummary.placement ? playerSummary.placement.rank : "-"
          }</span>
          <span class="leaderboard-name">${this.toDisplayName(
            playerSummary.playerData.name || "YOU"
          )}</span>
          <span class="leaderboard-score">${
            playerSummary.playerData.totalScore || 0
          }${includePtsSuffix ? "PTS" : ""}</span>
        `;
        listEl.appendChild(row);
      } else {
        const empty = document.createElement("div");
        empty.className = "leaderboard-entry leaderboard-message";
        empty.textContent = "PLAY TO JOIN THE LEADERBOARD!";
        listEl.appendChild(empty);
      }
      this.updateBackTopButtonVisibility();
      return;
    }

    const hasPlayer = !!(playerSummary && playerSummary.playerData);
    const placementRank =
      hasPlayer && playerSummary.placement
        ? Number(playerSummary.placement.rank) || 1
        : 1;

    // If the player's entry already exists in the fetched leaderboard (score was synced
    // before this render), highlight it in-place instead of injecting a duplicate row.
    const playerScore = hasPlayer
      ? Number(playerSummary.playerData.totalScore)
      : null;
    const playerName = hasPlayer
      ? (playerSummary.playerData.name || "").trim().toLowerCase()
      : null;
    const playerAlreadyInList =
      hasPlayer &&
      leaderboard.some(
        (e) =>
          Number(e.score) === playerScore &&
          (e.name || "").trim().toLowerCase() === playerName
      );

    const insertIndex = Math.max(
      0,
      Math.min(leaderboard.length, placementRank - 1)
    );
    let playerInserted = playerAlreadyInList;

    // Build rows array first so we can tag near-player rows after the fact.
    const rowEls = [];

    leaderboard.forEach((entry, index) => {
      if (
        hasPlayer &&
        !playerAlreadyInList &&
        !playerInserted &&
        index === insertIndex
      ) {
        const playerRow = document.createElement("div");
        playerRow.className = "leaderboard-entry player-highlight";
        playerRow.innerHTML = `
          <span>${
            playerSummary.placement ? playerSummary.placement.rank : "-"
          }</span>
          <span class="leaderboard-name">${this.toDisplayName(
            playerSummary.playerData.name || "YOU"
          )}</span>
          <span class="leaderboard-score">${
            playerSummary.playerData.totalScore || 0
          }${includePtsSuffix ? "PTS" : ""}</span>
        `;
        rowEls.push(playerRow);
        playerInserted = true;
      }

      const isPlayerEntry =
        playerAlreadyInList &&
        Number(entry.score) === playerScore &&
        (entry.name || "").trim().toLowerCase() === playerName;
      const row = document.createElement("div");
      row.className =
        "leaderboard-entry" + (isPlayerEntry ? " player-highlight" : "");
      row.innerHTML = `
        <span>${entry.rank || "-"}</span>
        <span class="leaderboard-name">${this.toDisplayName(entry.name)}</span>
        <span class="leaderboard-score">${entry.score || 0}${
        includePtsSuffix ? "PTS" : ""
      }</span>
      `;
      rowEls.push(row);
    });

    if (hasPlayer && !playerInserted) {
      const playerRow = document.createElement("div");
      playerRow.className = "leaderboard-entry player-highlight";
      playerRow.innerHTML = `
        <span>${
          playerSummary.placement ? playerSummary.placement.rank : "-"
        }</span>
        <span class="leaderboard-name">${this.toDisplayName(
          playerSummary.playerData.name || "YOU"
        )}</span>
        <span class="leaderboard-score">${
          playerSummary.playerData.totalScore || 0
        }${includePtsSuffix ? "PTS" : ""}</span>
      `;
      rowEls.push(playerRow);
    }

    if (!hasPlayer) {
      const endMessage = document.createElement("div");
      endMessage.className = "leaderboard-entry leaderboard-message";
      endMessage.textContent = "PLAY TO JOIN THE LEADERBOARD!";
      rowEls.push(endMessage);
    }

    // Tag the rows immediately adjacent to the player-highlight as near-player
    // so they get a slightly higher opacity in the dark theme.
    const playerIdx = rowEls.findIndex((r) =>
      r.classList.contains("player-highlight")
    );
    if (playerIdx !== -1) {
      if (rowEls[playerIdx - 1])
        rowEls[playerIdx - 1].classList.add("near-player");
      if (rowEls[playerIdx + 1])
        rowEls[playerIdx + 1].classList.add("near-player");
    }

    rowEls.forEach((r) => listEl.appendChild(r));

    if (
      listEl.id === "demo-leaderboard-list" ||
      listEl.id === "leaderboard-list"
    ) {
      requestAnimationFrame(() => this.shrinkLeaderboardNamesToFit(listEl));
    }

    this.updateBackTopButtonVisibility();
  }

  /** Shrink name font size when it overflows to keep each row on one line. */
  shrinkLeaderboardNamesToFit(listEl) {
    const rows = listEl.querySelectorAll(
      ".leaderboard-entry:not(.leaderboard-message)"
    );
    rows.forEach((row) => {
      const nameEl = row.querySelector(".leaderboard-name");
      if (!nameEl) return;

      const computed = getComputedStyle(nameEl);
      let fontSize = parseFloat(computed.fontSize);
      const minFontSize = 24;
      const step = 4;

      nameEl.style.fontSize = fontSize + "px";
      while (
        nameEl.scrollWidth > nameEl.clientWidth &&
        fontSize > minFontSize
      ) {
        fontSize = Math.max(minFontSize, fontSize - step);
        nameEl.style.fontSize = fontSize + "px";
      }
    });
  }

  showLeaderboard(leaderboard, playerName = "Unknown", playerSummary = null) {
    const listEl = document.getElementById("leaderboard-list");
    if (!listEl) return;

    this.renderLeaderboardRows(listEl, leaderboard, playerSummary, false);

    const highlightRow = listEl.querySelector(".player-highlight");
    if (highlightRow) {
      const targetTop = Math.max(
        0,
        highlightRow.offsetTop -
          (listEl.clientHeight - highlightRow.clientHeight) / 2
      );
      listEl.scrollTop = targetTop;
      this.updateBackTopButtonVisibility();
    }

    void playerName;
  }

  toDisplayName(name) {
    const cleaned = String(name || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!cleaned) return "Unknown";
    const parts = cleaned.split(" ");
    if (parts.length < 2) return parts[0];
    const first = parts[0];
    const lastInitial = (parts[parts.length - 1] || "").charAt(0).toUpperCase();
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }

  showLeaderboardLoading() {
    const listEl = document.getElementById("leaderboard-list");
    if (!listEl) return;
    this.renderLoadingRow(listEl, "LOADING...");
  }

  showLeaderboardError(message = "UNABLE TO LOAD LEADERBOARD") {
    const listEl = document.getElementById("leaderboard-list");
    if (!listEl) return;
    this.renderLoadingRow(listEl, message);
  }

  emitPressEffect(buttonIndex) {
    const buttons = document.querySelectorAll("#button-grid .game-button");
    const button = buttons[buttonIndex];
    if (!button) return;

    button.classList.remove("pressed");
    void button.offsetWidth; // force reflow so re-adding 'pressed' re-triggers transition
    button.classList.add("pressed");

    // Remove press state after animation completes; also clean up any lingering lit classes.
    clearTimeout(this._pressEffectTimeout);
    this._pressEffectTimeout = setTimeout(() => {
      button.classList.remove("pressed", "lit", "lit-red");
    }, 200);
  }

  /**
   * Light a specific grid button and start the grow animation.
   * @param {number} buttonIndex  - which cell to highlight
   * @param {string} type         - 'good' | 'red'
   * @param {number} growDurationMs - how long the cells take to fill (= reaction window)
   */
  lightButton(buttonIndex, type = "good", growDurationMs = 1000) {
    const grid = document.getElementById("button-grid");
    const buttons = document.querySelectorAll("#button-grid .game-button");

    // Clear any previous state
    clearTimeout(this._pressEffectTimeout);
    buttons.forEach((btn) => btn.classList.remove("lit", "lit-red", "pressed"));

    // Mark target button
    if (buttons[buttonIndex]) {
      buttons[buttonIndex].classList.add(type === "red" ? "lit-red" : "lit");
    }

    this.hideMissedOverlay();

    // Set duration and reset to scale(0) (no transition) before starting grow
    if (grid) {
      grid.classList.remove("grid-growing");
      grid.style.setProperty("--grow-duration", `${growDurationMs}ms`);
    }

    // Double rAF: ensures the scale(0) state is painted before grow begins
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (grid) grid.classList.add("grid-growing");
      });
    });
  }

  clearLitButton() {
    const grid = document.getElementById("button-grid");
    const buttons = document.querySelectorAll("#button-grid .game-button");

    // Leave 'pressed' class on the tapped button — emitPressEffect owns its cleanup
    buttons.forEach((btn) => {
      if (!btn.classList.contains("pressed")) {
        btn.classList.remove("lit", "lit-red");
      }
    });

    // Removing grid-growing snaps all cells to scale(0) instantly (transition: 0ms default)
    if (grid) grid.classList.remove("grid-growing");
  }

  prepareGameScreen() {
    this.showScreen("game");
    this.clearLitButton();
    this.hideMissedOverlay();
    this.showGameStatus("START!!", "good");
  }

  animateOdometer(elementId, nextValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) {
      el.textContent = String(nextValue);
      return;
    }

    const prevValue = Number(el.dataset.value || numeric);
    const delta = numeric - prevValue;
    el.dataset.value = String(numeric);

    const rollClass = delta >= 0 ? "odometer-roll-up" : "odometer-roll-down";
    const tintClass = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";

    el.classList.remove("delta-up", "delta-down");
    if (tintClass) {
      el.classList.add(tintClass);
      setTimeout(() => {
        el.classList.remove(tintClass);
      }, 240);
    }

    el.innerHTML = `<span class="odometer-inner ${rollClass}">${numeric}</span>`;
  }

  updateTimeRemaining(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    this.animateOdometer("time-left", value);
    this.lastTimeValue = value;
  }

  updateGameStats(hits, misses, wrongWhacks) {
    // Intentionally hidden in the new screenshot-aligned HUD.
    void hits;
    void misses;
    void wrongWhacks;
  }

  showGameStatus(message, tone = "") {
    const waitingEl = document.getElementById("waiting-message");
    if (!waitingEl) return;
    waitingEl.textContent = message;
    waitingEl.dataset.baseText = message;
    waitingEl.classList.remove(
      "judgement-fast",
      "judgement-good",
      "judgement-slow",
      "judgement-bad"
    );
    if (tone) {
      waitingEl.classList.add(`judgement-${tone}`);
    }
    this.refreshLedMarquee();
  }

  updateScore(score) {
    const numeric = Number(score) || 0;
    this.animateOdometer("current-score", numeric);
    this.lastScoreValue = numeric;
  }

  animateScoreBreakdown(items = []) {
    if (!items || items.length === 0) return;
    const delta = items.reduce(
      (sum, item) => sum + (Number(item.value) || 0),
      0
    );
    if (delta < 0) {
      this.showGameStatus("YOU MISSED!", "bad");
    } else if (delta > 0) {
      this.showGameStatus("NICE HIT!", "good");
    }
  }

  animateTimeBreakdown(items = []) {
    void items;
  }

  updatePreGameCountdown(seconds) {
    const val = Math.max(0, seconds);
    const bgMap = { 3: "#03eabb", 2: "#fc36fe", 1: "#dfff96" };

    if (val === 0) {
      // Remove any stale countdown overlays left from previous ticks
      document.querySelectorAll(".game-over-overlay").forEach((el) => el.remove());

      // Create overlay matching the "1" state for a slide-up reveal
      const overlay = document.createElement("div");
      overlay.className = "game-over-overlay";
      overlay.style.background = bgMap[1];
      overlay.innerHTML = '<span class="countdown-number">1</span>';
      document.body.appendChild(overlay);

      // Switch to game screen behind the overlay
      this.hideAllScreens();
      const gameScreen = document.getElementById("screen-game");
      if (gameScreen) {
        gameScreen.classList.remove("hidden");
        this.currentScreen = "game";
        this.currentScreenEl = gameScreen;
      }

      // Slide overlay + tip up together to reveal the game
      const tipEl = document.getElementById("countdown-tip-overlay");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.style.transition = "transform 0.4s ease-in";
          overlay.style.transform = "translateY(-100%)";
          if (tipEl) {
            tipEl.style.transition = "transform 0.4s ease-in";
            tipEl.style.transform = "translateY(-100vh)";
          }
        });
      });

      setTimeout(() => {
        overlay.remove();
        if (tipEl) tipEl.remove();
      }, 450);
      return;
    }

    // Countdown tip disabled

    // New number slides in from the right; previous overlay stays as the background
    const overlay = document.createElement("div");
    overlay.className = "game-over-overlay";
    overlay.style.background = bgMap[val] || "#03eabb";
    overlay.innerHTML = '<span class="countdown-number">' + val + "</span>";
    document.body.appendChild(overlay);

    overlay.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = "transform 0.4s ease-out";
        overlay.style.transform = "translateX(0)";
      });
    });

    // Remove any older overlays once this one fully covers the screen
    const prev = overlay.previousElementSibling;
    if (prev && prev.classList.contains("game-over-overlay")) {
      setTimeout(() => prev.remove(), 420);
    }
  }

  showGameEnd(totalScore, avgReaction, bestReaction) {
    // Populate results before the screen is revealed
    const finalScoreEl = document.getElementById("final-score");
    const avgReactionEl = document.getElementById("avg-reaction");
    if (finalScoreEl) {
      finalScoreEl.textContent = Number(totalScore || 0).toLocaleString();
    }
    if (avgReactionEl) {
      avgReactionEl.textContent = `${Number(avgReaction || 0).toFixed(3)}sec`;
    }

    // Create the lime-green GAME OVER overlay (position: fixed, covers everything)
    const overlay = document.createElement("div");
    overlay.className = "game-over-overlay";
    overlay.innerHTML = '<span class="game-over-overlay-text">GAME OVER</span>';
    document.body.appendChild(overlay);

    // Phase 1: Slide in from the right (0 → 400ms)
    overlay.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = "transform 0.4s ease-out";
        overlay.style.transform = "translateX(0)";
      });
    });

    // Phase 2: Hold full-screen for 0.6s (400ms → 1000ms)

    // Phase 3: Switch to score screen + shrink overlay height (1000ms → 1500ms)
    // Height animates from 100% → 291px; text stays centered and rides up with it
    setTimeout(() => {
      this.showScreen("score");
      overlay.style.transition = "height 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
      overlay.style.height = "291px";
    }, 1000);

    // Phase 4: Fade out overlay, reveal banner beneath (1500ms → 1700ms)
    setTimeout(() => {
      overlay.style.transition = "opacity 0.2s ease";
      overlay.style.opacity = "0";
    }, 1520);

    // Phase 5: Remove overlay
    setTimeout(() => {
      overlay.remove();
    }, 1730);
  }

  updateCountdown(seconds) {
    // HOME button — just keep the label clean; no countdown number shown.
    void seconds;
  }

  getLeadFormData() {
    const firstNameInput = document.getElementById("lead-first-name-input");
    const lastNameInput = document.getElementById("lead-last-name-input");

    return {
      firstName: firstNameInput ? firstNameInput.value.trim() : "",
      lastName: lastNameInput ? lastNameInput.value.trim() : "",
    };
  }

  clearLeadFormData() {
    const firstNameInput = document.getElementById("lead-first-name-input");
    const lastNameInput = document.getElementById("lead-last-name-input");

    if (firstNameInput) firstNameInput.value = "";
    if (lastNameInput) lastNameInput.value = "";

    // Reset display spans and band state
    const firstDisplay = document.getElementById("lead-firstname-display");
    const lastDisplay = document.getElementById("lead-lastname-display");
    if (firstDisplay) firstDisplay.textContent = "";
    if (lastDisplay) lastDisplay.textContent = "";
    ["lead-band-firstname", "lead-band-lastname"].forEach((id) => {
      const band = document.getElementById(id);
      if (band) band.classList.remove("has-value", "is-active");
    });

    this.clearLeadFormError();
  }

  showLeadFormError(message) {
    const errorEl = document.getElementById("lead-form-error");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  clearLeadFormError() {
    const errorEl = document.getElementById("lead-form-error");
    if (!errorEl) return;
    errorEl.classList.add("hidden");
  }

  resetLeadFormBands() {
    const ids = [
      "lead-info-banner",
      "lead-band-firstname",
      "lead-band-lastname",
      "touch-keyboard",
      "lead-form-lower",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = "";
    });

    const actions = document.getElementById("lead-actions");
    if (actions) {
      actions.style.transition = "";
      actions.style.transform = "";
    }
  }

  showLeadFormWithOverlay() {
    this.resetLeadFormBands();

    const overlay = document.createElement("div");
    overlay.className = "game-over-overlay";
    overlay.innerHTML = '<span class="game-over-overlay-text">YOUR INFO</span>';
    document.body.appendChild(overlay);

    // Phase 1: Slide in from the right (0 → 400ms)
    overlay.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = "transform 0.4s ease-out";
        overlay.style.transform = "translateX(0)";
      });
    });

    // Phase 2: Hold full-screen (400ms → 1000ms)

    // Phase 3: Show lead form underneath + shrink overlay to banner height (1000ms → 1500ms)
    setTimeout(() => {
      this.hideAllScreens();
      const leadScreen = document.getElementById("screen-lead-form");
      if (leadScreen) {
        leadScreen.classList.remove("hidden");
        this.currentScreen = "lead-form";
        this.currentScreenEl = leadScreen;
      }
      const bannerEl = document.getElementById("lead-info-banner");
      const bannerHeight = bannerEl ? bannerEl.offsetHeight : 291;
      overlay.style.transition = "height 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
      overlay.style.height = bannerHeight + "px";
    }, 1000);

    // Phase 4: Fade out overlay, reveal banner beneath (1500ms → 1720ms)
    setTimeout(() => {
      overlay.style.transition = "opacity 0.2s ease";
      overlay.style.opacity = "0";
    }, 1520);

    // Phase 5: Remove overlay + focus first field
    setTimeout(() => {
      overlay.remove();
      const firstNameInput = document.getElementById("lead-first-name-input");
      if (firstNameInput) firstNameInput.focus({ preventScroll: true });
    }, 1730);
  }

  showIdleWarning() {
    this.showScreen("idle-warning");
  }

  hideIdleWarning() {
    const screen = document.getElementById("screen-idle-warning");
    if (screen && this.currentScreen !== "idle-warning") {
      screen.classList.add("hidden");
    }
  }

  updateIdleCountdown(seconds) {
    const countdownEl = document.getElementById("idle-countdown-value");
    if (countdownEl) {
      countdownEl.textContent = String(seconds);
    }
  }

  hideEnterNameButton() {
    // Backward-compatible no-op.
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = UIController;
}
