/** UI controller for touch-first gameplay. */

class UIController {
  constructor() {
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
    this.leaderboardAutoScrollInterval = null;
    this.leaderboardAutoScrollStepPx = 0.35;
    this.leaderboardAutoScrollTickMs = 40;
    this.leaderboardAutoScrollResumeDelayMs = 3500;
    this.leaderboardAutoScrollDirectionByList = {};
    this.lastTimeValue = null;
    this.lastScoreValue = null;

    // Attract cycle timers (multi-step: reveal → grow → scroll → grid → lb → repeat)
    this.attractTimers    = [];
    this.attractLbVisible = false;

    // ── Phase timing (ms from cycle start) ──
    this.attractReveal1Ms = 1500;   // Phase 1: magenta slides up
    this.attractReveal2Ms = 2500;   // Phase 2: lime slides up
    this.attractGrowMs    = 3800;   // Phase 3: text grows + scrolls simultaneously
    this.attractGridMs    = 9500;   // Phase 4: zoom-out (all 12 bands)
    this.attractLbShowMs  = 14000;  // Leaderboard slides up
    this.attractLbHideMs  = 24000;  // Leaderboard hides → restart cycle

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
      { id: 'attract-track-0', text: 'PLAY TO WIN!', dir: 'ltr', speed: 7 },
      { id: 'attract-track-1', text: '$1,000',       dir: 'rtl', speed: 5 },
      { id: 'attract-track-2', text: 'CASH',         dir: 'ltr', speed: 9 },
    ];

    // Extra 9 bands (tiny slivers below fold in Phase 3, grow to 1/12 in Phase 4)
    this.attractExtraBandConfigs = [
      { id: 'attract-track-3',  text: 'PLAY TO WIN!', dir: 'rtl', speed: 6   },
      { id: 'attract-track-4',  text: '$1,000',        dir: 'ltr', speed: 8   },
      { id: 'attract-track-5',  text: 'CASH',          dir: 'rtl', speed: 4.5 },
      { id: 'attract-track-6',  text: 'PLAY TO WIN!', dir: 'ltr', speed: 7   },
      { id: 'attract-track-7',  text: '$1,000',        dir: 'rtl', speed: 5   },
      { id: 'attract-track-8',  text: 'CASH',          dir: 'ltr', speed: 9   },
      { id: 'attract-track-9',  text: 'PLAY TO WIN!', dir: 'rtl', speed: 6   },
      { id: 'attract-track-10', text: '$1,000',        dir: 'ltr', speed: 8   },
      { id: 'attract-track-11', text: 'CASH',          dir: 'rtl', speed: 4.5 },
    ];

    this.initializeCountdownGrid();
    this.setupLedResizeHandler();
    this.setupLeaderboardUX();
  }

  updateState(state, nav = {}) {
    if (state !== 'demo') {
      this.stopDemoRefresh();
      this.stopAttractCycle();
    }

    switch (state) {
      case 'demo':
        this.showScreen('demo', nav.direction);
        this.clearLeadFormData();
        this.startDemoRefresh();
        this.startAttractCycle();
        break;
      case 'countdown':
        this.showScreen('countdown', nav.direction);
        this.stopAttractCycle();
        break;
      case 'game_start':
      case 'game_play':
        this.showScreen('game', nav.direction);
        this.initializeButtonGrid();
        break;
      case 'show_score':
        this.showScreen('score', nav.direction);
        break;
      case 'game_end':
        break;
      case 'lead_form':
        this.hideAllScreens();
        {
          const leadScreen = document.getElementById('screen-lead-form');
          if (leadScreen) {
            leadScreen.classList.remove('hidden');
            this.currentScreen = 'lead-form';
            this.currentScreenEl = leadScreen;
          }
        }
        this.clearLeadFormError();
        this.resetLeadFormBands();
        requestAnimationFrame(() => this.animateLeadFormIn());
        break;
      case 'show_leaderboard':
        this.showScreen('leaderboard', nav.direction);
        break;
      case 'idle_warning':
        this.showScreen('idle-warning', nav.direction);
        break;
      default:
        this.showScreen('demo', nav.direction);
        this.startDemoRefresh();
    }
  }

  hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach((screen) => {
      screen.classList.add('hidden');
      screen.classList.remove('fade-enter', 'fade-exit');
      screen.style.opacity = '';
      screen.style.transition = '';
      this.clearContentMotion(screen);
    });
  }

  getContentMotionNodes(screen) {
    if (!screen) return [];
    return Array.from(screen.querySelectorAll('.screen-main, .bottom-cta-wrap'));
  }

  setContentMotion(screen, translatePct, withTransition) {
    const nodes = this.getContentMotionNodes(screen);
    nodes.forEach((node) => {
      node.style.transition = withTransition
        ? `transform ${this.transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : 'none';
      node.style.transform = `translateX(${translatePct}%)`;
    });
  }

  clearContentMotion(screen) {
    const nodes = this.getContentMotionNodes(screen);
    nodes.forEach((node) => {
      node.style.transition = '';
      node.style.transform = '';
    });
  }

  showScreen(screenId, direction = 'forward') {
    const nextScreen = document.getElementById(`screen-${screenId}`);
    if (!nextScreen) return;

    this.settlePendingTransition();

    const previous = this.currentScreenEl;
    if (!previous || previous === nextScreen) {
      this.hideAllScreens();
      nextScreen.classList.remove('hidden');
      this.currentScreen = screenId;
      this.currentScreenEl = nextScreen;
      console.log(`[UI] screen loaded: ${screenId}`);
      this.refreshLedMarquee();
      this.updateLeaderboardUX();
      return;
    }

    this.transitionFromEl = previous;
    this.transitionToEl = nextScreen;
    nextScreen.classList.remove('hidden');
    const isBack = direction === 'back';
    const enterFrom = isBack ? -14 : 14;
    const exitTo = isBack ? 14 : -14;

    nextScreen.style.opacity = '0';
    previous.style.opacity = '1';
    nextScreen.style.transition = `opacity ${this.transitionMs}ms ease`;
    previous.style.transition = `opacity ${this.transitionMs}ms ease`;

    this.setContentMotion(nextScreen, enterFrom, false);
    this.setContentMotion(previous, 0, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.setContentMotion(nextScreen, 0, true);
        this.setContentMotion(previous, exitTo, true);
        nextScreen.style.opacity = '1';
        previous.style.opacity = '0';
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
      ? this.transitionToEl.id.replace('screen-', '')
      : (this.currentScreen || 'demo');
    this.commitTransition(resolvedScreenId);
  }

  commitTransition(screenId) {
    if (this.transitionFromEl) {
      this.transitionFromEl.classList.add('hidden');
      this.transitionFromEl.classList.remove('fade-enter', 'fade-exit');
      this.transitionFromEl.style.opacity = '';
      this.transitionFromEl.style.transition = '';
      this.clearContentMotion(this.transitionFromEl);
    }
    if (this.transitionToEl) {
      this.transitionToEl.classList.remove('fade-enter', 'fade-exit');
      this.transitionToEl.classList.remove('hidden');
      this.transitionToEl.style.opacity = '';
      this.transitionToEl.style.transition = '';
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
    const backTopBtn = document.getElementById('leaderboard-back-top-btn');
    if (backTopBtn) {
      backTopBtn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      });
      backTopBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const list = this.getActiveLeaderboardList();
        if (list) {
          list.scrollTo({ top: 0, behavior: 'smooth' });
        }
        this.markLeaderboardInteraction();
      });
    }

    const bindList = (list) => {
      if (!list || list.dataset.uxBound === '1') return;
      list.dataset.uxBound = '1';

      list.addEventListener('pointerdown', () => this.markLeaderboardInteraction(), { passive: true });
      list.addEventListener('touchstart', () => this.markLeaderboardInteraction(), { passive: true });
      list.addEventListener('wheel', () => this.markLeaderboardInteraction(), { passive: true });
      list.addEventListener('scroll', () => this.updateBackTopButtonVisibility(), { passive: true });
    };

    bindList(document.getElementById('demo-leaderboard-list'));
    bindList(document.getElementById('leaderboard-list'));
  }

  updateLeaderboardUX() {
    this.updateBackTopButtonVisibility();
    this.startLeaderboardAutoScroll();
  }

  getActiveLeaderboardList() {
    if (this.currentScreen === 'demo') {
      return document.getElementById('demo-leaderboard-list');
    }
    if (this.currentScreen === 'leaderboard') {
      return document.getElementById('leaderboard-list');
    }
    return null;
  }

  markLeaderboardInteraction() {
    this.lastLeaderboardInteractionTs = Date.now();
    this.updateBackTopButtonVisibility();
  }

  updateBackTopButtonVisibility() {
    const button = document.getElementById('leaderboard-back-top-btn');
    if (!button) return;

    // Never show on game-end leaderboard (HOME button handles that) or demo screen.
    if (this.currentScreen === 'leaderboard' || this.currentScreen === 'demo') {
      button.classList.add('hidden');
      return;
    }

    const list = this.getActiveLeaderboardList();
    if (!list) {
      button.classList.add('hidden');
      return;
    }

    const shouldShow = list.scrollTop > 120;
    button.classList.toggle('hidden', !shouldShow);
  }

  startLeaderboardAutoScroll() {
    if (this.leaderboardAutoScrollInterval) {
      clearInterval(this.leaderboardAutoScrollInterval);
      this.leaderboardAutoScrollInterval = null;
    }

    this.leaderboardAutoScrollInterval = setInterval(() => {
      const list = this.getActiveLeaderboardList();
      if (!list) return;
      if (list.scrollHeight <= list.clientHeight + 2) return;
      if (Date.now() - this.lastLeaderboardInteractionTs < this.leaderboardAutoScrollResumeDelayMs) return;

      const listKey = list.id || 'default';
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      let direction = this.leaderboardAutoScrollDirectionByList[listKey] ?? 1;

      const atBottom = list.scrollTop >= maxScrollTop - 2;
      const atTop = list.scrollTop <= 2;

      if (atBottom) direction = -1;
      if (atTop) direction = 1;

      this.leaderboardAutoScrollDirectionByList[listKey] = direction;
      const nextTop = list.scrollTop + (this.leaderboardAutoScrollStepPx * direction);
      list.scrollTop = Math.max(0, Math.min(maxScrollTop, nextTop));
      this.updateBackTopButtonVisibility();
    }, this.leaderboardAutoScrollTickMs);
  }

  setupLedResizeHandler() {
    this.onResize = () => this.refreshLedMarquee();
    window.addEventListener('resize', this.onResize);
  }

  refreshLedMarquee() {
    const subtitleEls = document.querySelectorAll('.led-row-sub .led-subtitle');
    subtitleEls.forEach((el) => {
      const row = el.closest('.led-row-sub');
      if (!row) return;

      if (!el.dataset.baseText) {
        el.dataset.baseText = (el.textContent || '').trim();
      }
      const baseText = el.dataset.baseText || '';
      const marqueeSig = `${baseText}|${row.clientWidth}`;
      if (el.dataset.marqueeSig === marqueeSig) {
        return;
      }

      el.classList.remove('is-marquee');
      el.style.removeProperty('--marquee-duration');
      el.textContent = baseText;

      if (el.scrollWidth <= row.clientWidth - 24) {
        el.dataset.marqueeSig = marqueeSig;
        return;
      }

      const pxPerSecond = 90;
      const loopDistance = el.scrollWidth + 84;
      const duration = Math.max(6, Number((loopDistance / pxPerSecond).toFixed(2)));
      el.style.setProperty('--marquee-duration', `${duration}s`);
      el.innerHTML = `
        <span class="led-marquee-track">
          <span class="led-marquee-copy">${baseText}</span>
          <span class="led-marquee-copy" aria-hidden="true">${baseText}</span>
        </span>
      `;
      el.classList.add('is-marquee');
      el.dataset.marqueeSig = marqueeSig;
    });
  }

  initializeCountdownGrid() {
    // countdown-grid removed in new design — no-op kept for safety
  }

  /** Show or hide the demo leaderboard panel. */
  setDemoLeaderboardVisible(visible) {
    const panel = document.getElementById('demo-lb-panel');
    if (!panel) return;
    this.attractLbVisible = visible;
    panel.classList.toggle('visible', visible);
  }

  /**
   * Reset attract to Phase 0 instantly (no transition flash of colour bands).
   * Rebuilds each band track back to a single seed item.
   */
  resetAttractPhase() {
    console.log('[attract] Phase 0 – reset');
    const bands = document.getElementById('attract-bands');
    if (bands) {
      // Disable transitions FIRST so no in-between state is ever rendered.
      // (Previously scale was cleared before class removal, causing a one-frame
      // flash where attract-growing + scale(1) made all 12 bands visible.)
      bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = 'none'; });
      // Cancel container WAAPI, then remove all classes and inline scale atomically.
      bands.getAnimations().forEach(a => a.cancel());
      bands.classList.remove('attract-phase-1', 'attract-phase-2', 'attract-growing', 'attract-scrolling', 'attract-phase4');
      bands.style.scale = '';
      // Reflow NOW — committed state is clean Phase 0 (no grow, no scale).
      void bands.offsetHeight;
      // Re-enable transitions on the next paint.
      requestAnimationFrame(() => {
        bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = ''; });
      });
    }

    const resetTrack = (id, text) => {
      const track = document.getElementById(id);
      if (!track) return;
      // If track was wrapped in a scaler, unwrap it back into the band
      const scaler = track.closest('.attract-track-scaler');
      if (scaler) {
        scaler.parentNode.insertBefore(track, scaler);
        scaler.remove();
      }
      track.style.animation      = '';
      track.style.transform      = '';
      track.style.justifyContent = '';
      track.style.width          = '';
      track.style.removeProperty('--marquee-dist');
      track.innerHTML = '';
      const s = document.createElement('span');
      s.className   = 'attract-item';
      s.textContent = text;
      track.appendChild(s);
    };

    // Rebuild each original track with a single seed item (small font-size)
    this.attractBandConfigs.forEach(({ id, text }) => resetTrack(id, text));
    // Reset extra band tracks to a single seed item
    this.attractExtraBandConfigs.forEach(({ id, text }) => resetTrack(id, text));
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
  startAttractScroll() {
    try {
    const bands = document.getElementById('attract-bands');
    if (!bands) { console.error('[attract] startAttractScroll: #attract-bands not found'); return; }

    const allConfigs = [...this.attractBandConfigs, ...this.attractExtraBandConfigs];
    const totalH = bands.getBoundingClientRect().height;
    console.log(`[attract] startAttractScroll: totalH=${totalH}, classes="${bands.className}"`);
    if (totalH === 0) { console.error('[attract] startAttractScroll: totalH is 0, aborting'); return; }

    // Phase 3 uses container scale(4) on .attract-bands so the top 3 of 12 equal
    // bands visually fill the screen.  Font-size is set to the Phase 4 DOM value
    // (totalH/12 × 0.9); container scale makes it appear 4× larger in Phase 3.
    //   visual Phase 3 font = containerScale × largeFontSize = (totalH/3) × 0.9 ✓
    const containerScale = 4; // 12 total bands / 3 visible in Phase 3
    const largeFontSize = totalH / 12 * 0.9;

    // Capture current (Phase 2) visual font size BEFORE we override anything.
    // initialScale compensates for container scale so Phase 2→3 grow animation
    // starts at the Phase 2 visual size:
    //   visual_start = containerScale × initialScale × largeFontSize = currentSmallFontSize
    //   → initialScale = currentSmallFontSize / (largeFontSize × containerScale)
    //                   = currentSmallFontSize / (totalH/3 × 0.9)   (same formula as before)
    const firstSeed = document.getElementById(allConfigs[0].id)?.querySelector('.attract-item');
    const currentSmallFontSize = firstSeed ? parseFloat(getComputedStyle(firstSeed).fontSize) : 32;
    const initialScale = currentSmallFontSize / (largeFontSize * containerScale);
    console.log(`[attract] startAttractScroll: largeFontSize=${largeFontSize.toFixed(1)}, currentSmallFontSize=${currentSmallFontSize}, initialScale=${initialScale.toFixed(3)}, containerScale=${containerScale}`);

    // 1. Measure seed item widths at the LARGE font size.
    //    Temporarily set font-size on seeds to get accurate widths.
    const seeds = allConfigs.map(({ id }) => {
      const track = document.getElementById(id);
      const seed = track?.querySelector('.attract-item');
      if (seed) seed.style.fontSize = `${largeFontSize}px`;
      return { track, seed };
    });
    void bands.offsetHeight; // flush font-size change for accurate measurement

    const measurements = seeds.map(({ track, seed }) => ({
      itemW: seed?.getBoundingClientRect().width ?? 0,
      bandW: track?.closest('.attract-band')?.getBoundingClientRect().width ?? 1080,
    }));

    // 2. Build each track with copies at large font size, wrap in scaler, start scrolling.
    //    originalScalers: rows 0-2 — get WAAPI grow animation (initialScale → 1).
    //    Extra bands (rows 3-11): scaler set to scale(1) immediately. They are
    //    off-screen during Phase 3 (container scale 4 pushes them below viewport)
    //    so no visible artifact, and they are ready when Phase 4 reveals them.
    const originalScalers = [];
    allConfigs.forEach(({ id, text, dir, speed }, i) => {
      const isExtra = i >= this.attractBandConfigs.length;
      const track = document.getElementById(id);
      if (!track) { console.error(`[attract] startAttractScroll: track #${id} not found`); return; }

      const { itemW, bandW } = measurements[i];
      if (!itemW) { console.error(`[attract] startAttractScroll: band ${i} (#${id}) itemW=0, skipping`); return; }

      // Each half of the -50% loop needs to span at least the viewport width.
      const copies = Math.max(4, Math.ceil((bandW * 1.5) / itemW) + 2);

      track.innerHTML = '';
      for (let j = 0; j < copies * 2; j++) {
        const s = document.createElement('span');
        s.className = 'attract-item';
        s.style.fontSize = `${largeFontSize}px`;
        s.textContent = text;
        track.appendChild(s);
      }

      track.style.justifyContent = 'flex-start';
      track.style.width = 'max-content';

      // Wrap track in a scaler div (scale on wrapper, translateX marquee on track).
      const band = track.closest('.attract-band');
      let scaler = track.closest('.attract-track-scaler');
      if (!scaler) {
        scaler = document.createElement('div');
        scaler.className = 'attract-track-scaler';
        // Originals: snap to Phase 2 visual size; WAAPI will grow to scale(1).
        // Extras: pin to scale(1) — they are off-screen (container scale(4) pushes
        // them below the viewport) so text:band ratio is correct when revealed.
        scaler.style.scale = isExtra ? '1' : String(initialScale);
        band.insertBefore(scaler, track);
        scaler.appendChild(track);
      }
      if (!isExtra) originalScalers.push(scaler);

      const dur = speed * this.phase4SpeedScale;
      const animName = dir === 'ltr' ? 'attractScrollLTR' : 'attractScrollRTL';
      track.style.animation = `${animName} ${dur}s linear infinite`;
    });

    // 3. Snap to Phase 3 layout without any CSS flex-grow transition.
    //    .attract-band has `transition: flex-grow 0.9s` which, if allowed to run,
    //    would animate flex-grows from Phase 2 values (~1.05–1.10) while the
    //    container is at scale(4) — making originals appear ~4/3× viewport height
    //    and visually breaking Phase 3.  Suppressing it mirrors resetAttractPhase().
    //    container scale(4) × DOM band height(1/12) = visual band height(1/3) so
    //    the snap is invisible: bands appear the same size as in Phase 2. ✓
    bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = 'none'; });
    // Defensive: cancel any lingering container WAAPI before applying Phase 3 scale.
    // A fill:forwards zoom from a previous cycle could override the inline scale='4',
    // keeping the container at scale(1) and making all 12 bands visible.
    const lingeringAnims = bands.getAnimations();
    if (lingeringAnims.length) {
      console.warn(`[attract] startAttractScroll: cancelling ${lingeringAnims.length} lingering container animation(s)`);
      lingeringAnims.forEach(a => a.cancel());
    }
    bands.style.scale = String(containerScale);
    bands.classList.add('attract-growing');

    // 4. Force layout — commits all changes as one rendered frame.
    void bands.offsetHeight;

    // Re-enable flex-grow transitions for Phase 3→4 (the attract-phase4 class
    // doesn't change flex-grow here, but restoring the rule keeps CSS consistent).
    requestAnimationFrame(() => {
      bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = ''; });
    });

    // 5. WAAPI grow on original bands only — fires immediately, no batching issues,
    //    works in background tabs. Explicit keyframes guarantee the start value.
    //    Extra band scalers stay at 1 (already correct) — no WAAPI needed.
    console.log(`[attract] startAttractScroll: WAAPI grow on ${originalScalers.length} original scalers (initialScale=${initialScale.toFixed(3)})`);
    originalScalers.forEach(s => {
      const anim = s.animate(
        [{ scale: String(initialScale) }, { scale: '1' }],
        { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );
      anim.addEventListener('cancel', () => console.warn('[attract] scaler grow animation cancelled'));
      anim.addEventListener('finish', () => console.log('[attract] scaler grow animation finished'));
    });
    console.log(`[attract] startAttractScroll: done, bands.className="${bands.className}", bands.style.scale="${bands.style.scale}"`);
    } catch (err) { console.error('[attract] startAttractScroll threw:', err); }
  }

  /**
   * Phase 4: zoom-out — the .attract-bands container animates scale(4 → 1).
   *
   * All 12 bands already have flex-grow:1 (equal DOM height = totalH/12) and
   * their scalers at scale(1) (text at 90% of DOM band height).  The container
   * was at scale(4) during Phase 3, showing only the top 3 bands. Animating
   * the container to scale(1) reveals all 12 bands proportionally — a true
   * zoom-out with zero layout recalculation per frame (compositor-only).
   *
   *   text:band ratio throughout = (largeFontSize × scaler(1)) / (totalH/12)
   *                               = (totalH/12 × 0.9) / (totalH/12) = 0.9 ✓
   */
  showAttractPhase4() {
    const bands = document.getElementById('attract-bands');
    if (!bands) { console.error('[attract] showAttractPhase4: #attract-bands not found'); return; }
    console.log(`[attract] showAttractPhase4: bands.className="${bands.className}", bands.style.scale="${bands.style.scale}"`);

    // Cancel any lingering grow WAAPI on individual scalers so they stay at scale(1).
    bands.querySelectorAll('.attract-track-scaler').forEach(scaler => {
      scaler.getAnimations().forEach(a => a.cancel());
      scaler.style.scale = '1';
    });

    // Cancel any prior container animation (defensive — shouldn't exist at this point).
    const priorAnims = bands.getAnimations();
    if (priorAnims.length) console.warn(`[attract] showAttractPhase4: cancelling ${priorAnims.length} unexpected container animation(s)`);
    priorAnims.forEach(a => a.cancel());

    void bands.offsetHeight; // commit scaler cleanup before starting container WAAPI

    // WAAPI zoom-out on the container: scale(4 → 1) over 0.9 s (compositor-only).
    // fill:'none' so the animation does NOT linger after it ends — otherwise the
    // fill:forwards effect (scale:'1') overrides the inline bands.style.scale='4'
    // set in Phase 3 of the NEXT cycle, causing all 12 bands to appear at scale(1).
    // The 'finish' handler commits the final state as an inline style instead.
    const zoomAnim = bands.animate(
      [{ scale: '4' }, { scale: '1' }],
      { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none' }
    );
    zoomAnim.addEventListener('cancel', () => console.warn('[attract] container zoom-out animation cancelled'));
    zoomAnim.addEventListener('finish', () => {
      console.log('[attract] container zoom-out animation finished – committing scale:1');
      // Commit final value as inline style so the WAAPI can safely go idle.
      bands.style.scale = '1';
    });

    bands.classList.remove('attract-phase-1', 'attract-phase-2', 'attract-growing', 'attract-scrolling');
    bands.classList.add('attract-phase4');
    console.log(`[attract] showAttractPhase4: done, bands.className="${bands.className}"`);
  }

  /** Start the multi-step attract cycle. */
  startAttractCycle() {
    this._cycleId = ((this._cycleId ?? 0) + 1);
    console.log(`[attract] Cycle ${this._cycleId} start`);
    this.stopAttractCycle();
    this.resetAttractPhase();
    this.setDemoLeaderboardVisible(false);

    const cycleId = this._cycleId;
    const at = (delay, fn) => {
      const t = setTimeout(fn, delay);
      this.attractTimers.push(t);
    };

    const bands = document.getElementById('attract-bands');

    // Phase 1 – magenta slides up
    at(this.attractReveal1Ms, () => {
      console.log(`[attract] Cycle ${cycleId} – Phase 1`);
      if (bands) bands.classList.add('attract-phase-1');
    });

    // Phase 2 – lime slides up
    at(this.attractReveal2Ms, () => {
      console.log(`[attract] Cycle ${cycleId} – Phase 2`);
      if (bands) bands.classList.add('attract-phase-2');
    });

    // Phase 3 – text grows AND scrolls simultaneously
    at(this.attractGrowMs, () => {
      console.log(`[attract] Cycle ${cycleId} – Phase 3 (startAttractScroll)`);
      this.startAttractScroll();
    });

    // Phase 4 – zoom-out: bands compress to 1/12 height, extra rows rise into view
    at(this.attractGridMs, () => {
      console.log(`[attract] Cycle ${cycleId} – Phase 4 (showAttractPhase4)`);
      this.showAttractPhase4();
    });

    // Leaderboard slides up over grid
    at(this.attractLbShowMs, () => {
      console.log(`[attract] Cycle ${cycleId} – Leaderboard show`);
      this.setDemoLeaderboardVisible(true);
    });

    // Leaderboard hides → restart cycle
    at(this.attractLbHideMs, () => {
      console.log(`[attract] Cycle ${cycleId} – Leaderboard hide, restarting`);
      this.setDemoLeaderboardVisible(false);
      this.startAttractCycle();
    });
  }

  stopAttractCycle() {
    this.attractTimers.forEach(t => clearTimeout(t));
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
    const bands = document.getElementById('attract-bands');
    if (!bands) return;

    switch (phaseName) {
      case 'phase1':
        bands.classList.add('attract-phase-1');
        break;

      case 'phase2':
        bands.classList.add('attract-phase-1', 'attract-phase-2');
        break;

      case 'phase3':
        // Phase 3: 3 large bands, scrolling, container at scale(4)
        bands.classList.add('attract-phase-1', 'attract-phase-2', 'attract-growing');
        bands.style.scale = '4';
        // Schedule track building in next moment to let layout settle
        setTimeout(() => {
          this.startAttractScroll();
        }, 50);
        break;

      case 'phase4':
        // Phase 4: 12-band grid, container zoom-out animation
        bands.classList.add('attract-phase-1', 'attract-phase-2', 'attract-growing');
        bands.style.scale = '4';
        // Build tracks first
        setTimeout(() => {
          this.startAttractScroll();
          // Then trigger Phase 4 after Phase 3 would normally end (0.9s grow + margin)
          setTimeout(() => {
            this.showAttractPhase4();
          }, 1100);
        }, 50);
        break;

      case 'leaderboard':
        // Leaderboard: grid visible + leaderboard panel up
        bands.classList.add('attract-phase-1', 'attract-phase-2', 'attract-phase4');
        bands.style.scale = '1';
        this.setDemoLeaderboardVisible(true);
        break;

      default:
        console.warn(`[debug] Unknown phase: ${phaseName}. Valid: phase1, phase2, phase3, phase4, leaderboard`);
    }
  }

  initializeButtonGrid() {
    const grid = document.getElementById('button-grid');
    if (!grid) return;
    if (grid.children.length === 54) return;

    grid.innerHTML = '';
    for (let i = 0; i < 54; i++) {
      const button = document.createElement('div');
      button.className = 'game-button';
      button.dataset.index = i;
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', `Button ${i + 1}`);
      grid.appendChild(button);
    }
  }

  /** Flash the MISSED! overlay for a short duration. */
  showMissedOverlay(durationMs = 700) {
    const el = document.getElementById('missed-overlay');
    if (!el) return;
    el.classList.remove('hidden');
    clearTimeout(this._missedOverlayTimeout);
    this._missedOverlayTimeout = setTimeout(() => {
      el.classList.add('hidden');
    }, durationMs);
  }

  hideMissedOverlay() {
    const el = document.getElementById('missed-overlay');
    if (el) el.classList.add('hidden');
  }

  updateTutorialStep() {
    const stepEl = document.getElementById('tutorial-step');
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

    const shouldRefresh = !this.demoLoadedOnce
      || !window.game
      || typeof window.game.shouldRefreshDemoLeaderboard !== 'function'
      || window.game.shouldRefreshDemoLeaderboard();

    if (!shouldRefresh) {
      return;
    }

    await this.renderDemoLeaderboard().catch(() => {});
    this.demoLoadedOnce = true;
    if (window.game && typeof window.game.markDemoLeaderboardRendered === 'function') {
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
    const listEl = document.getElementById('demo-leaderboard-list');
    if (!listEl) return;

    const hasGame = !!window.game;
    const hasCacheGetter = hasGame && typeof window.game.getCachedRemoteLeaderboard === 'function';
    const cachedLeaderboard = hasCacheGetter ? window.game.getCachedRemoteLeaderboard(1000) : [];

    if (cachedLeaderboard.length > 0) {
      this.renderLeaderboardRows(listEl, cachedLeaderboard, null, false);
    } else {
      this.renderLoadingRow(listEl, 'LOADING...');
    }

    const canFetchRemote = typeof navigator === 'undefined' || navigator.onLine;
    if (!canFetchRemote || !window.game || typeof window.game.getRemoteLeaderboard !== 'function') {
      if (cachedLeaderboard.length === 0) {
        this.renderLoadingRow(listEl, 'OFFLINE');
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

  renderLoadingRow(listEl, text = 'LOADING...') {
    listEl.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'leaderboard-entry';
    row.innerHTML = `<span>${text}</span>`;
    listEl.appendChild(row);
    this.updateBackTopButtonVisibility();
  }

  renderLeaderboardRows(listEl, leaderboard, playerSummary = null, includePtsSuffix = true) {
    listEl.innerHTML = '';

    if (!leaderboard || leaderboard.length === 0) {
      if (playerSummary && playerSummary.playerData) {
        const row = document.createElement('div');
        row.className = 'leaderboard-entry player-highlight';
        row.innerHTML = `
          <span>${playerSummary.placement ? '#' + playerSummary.placement.rank : '-'}</span>
          <span class="leaderboard-name">${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
          <span class="leaderboard-score">${playerSummary.playerData.totalScore || 0}${includePtsSuffix ? 'PTS' : ''}</span>
        `;
        listEl.appendChild(row);
      } else {
        const empty = document.createElement('div');
        empty.className = 'leaderboard-entry leaderboard-message';
        empty.textContent = 'PLAY TO JOIN THE LEADERBOARD!';
        listEl.appendChild(empty);
      }
      this.updateBackTopButtonVisibility();
      return;
    }

    const hasPlayer = !!(playerSummary && playerSummary.playerData);
    const placementRank = hasPlayer && playerSummary.placement
      ? Number(playerSummary.placement.rank) || 1
      : 1;

    // If the player's entry already exists in the fetched leaderboard (score was synced
    // before this render), highlight it in-place instead of injecting a duplicate row.
    const playerScore = hasPlayer ? Number(playerSummary.playerData.totalScore) : null;
    const playerName  = hasPlayer ? (playerSummary.playerData.name || '').trim().toLowerCase() : null;
    const playerAlreadyInList = hasPlayer && leaderboard.some(
      e => Number(e.score) === playerScore && (e.name || '').trim().toLowerCase() === playerName
    );

    const insertIndex = Math.max(0, Math.min(leaderboard.length, placementRank - 1));
    let playerInserted = playerAlreadyInList;

    // Build rows array first so we can tag near-player rows after the fact.
    const rowEls = [];

    leaderboard.forEach((entry, index) => {
      if (hasPlayer && !playerAlreadyInList && !playerInserted && index === insertIndex) {
        const playerRow = document.createElement('div');
        playerRow.className = 'leaderboard-entry player-highlight';
        playerRow.innerHTML = `
          <span>${playerSummary.placement ? '#' + playerSummary.placement.rank : '-'}</span>
          <span class="leaderboard-name">${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
          <span class="leaderboard-score">${playerSummary.playerData.totalScore || 0}${includePtsSuffix ? 'PTS' : ''}</span>
        `;
        rowEls.push(playerRow);
        playerInserted = true;
      }

      const isPlayerEntry = playerAlreadyInList
        && Number(entry.score) === playerScore
        && (entry.name || '').trim().toLowerCase() === playerName;
      const row = document.createElement('div');
      row.className = 'leaderboard-entry' + (isPlayerEntry ? ' player-highlight' : '');
      row.innerHTML = `
        <span>${entry.rank || '-'}</span>
        <span class="leaderboard-name">${this.toDisplayName(entry.name)}</span>
        <span class="leaderboard-score">${entry.score || 0}${includePtsSuffix ? 'PTS' : ''}</span>
      `;
      rowEls.push(row);
    });

    if (hasPlayer && !playerInserted) {
      const playerRow = document.createElement('div');
      playerRow.className = 'leaderboard-entry player-highlight';
      playerRow.innerHTML = `
        <span>${playerSummary.placement ? '#' + playerSummary.placement.rank : '-'}</span>
        <span class="leaderboard-name">${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
        <span class="leaderboard-score">${playerSummary.playerData.totalScore || 0}${includePtsSuffix ? 'PTS' : ''}</span>
      `;
      rowEls.push(playerRow);
    }

    if (!hasPlayer) {
      const endMessage = document.createElement('div');
      endMessage.className = 'leaderboard-entry leaderboard-message';
      endMessage.textContent = 'PLAY TO JOIN THE LEADERBOARD!';
      rowEls.push(endMessage);
    }

    // Tag the rows immediately adjacent to the player-highlight as near-player
    // so they get a slightly higher opacity in the dark theme.
    const playerIdx = rowEls.findIndex(r => r.classList.contains('player-highlight'));
    if (playerIdx !== -1) {
      if (rowEls[playerIdx - 1]) rowEls[playerIdx - 1].classList.add('near-player');
      if (rowEls[playerIdx + 1]) rowEls[playerIdx + 1].classList.add('near-player');
    }

    rowEls.forEach(r => listEl.appendChild(r));

    if (listEl.id === 'demo-leaderboard-list') {
      requestAnimationFrame(() => this.shrinkLeaderboardNamesToFit(listEl));
    }

    this.updateBackTopButtonVisibility();
  }

  /** Shrink name font size when it overflows to keep each row on one line. */
  shrinkLeaderboardNamesToFit(listEl) {
    const rows = listEl.querySelectorAll('.leaderboard-entry:not(.leaderboard-message)');
    rows.forEach((row) => {
      const nameEl = row.querySelector('.leaderboard-name');
      if (!nameEl) return;

      const computed = getComputedStyle(nameEl);
      let fontSize = parseFloat(computed.fontSize);
      const minFontSize = 24;
      const step = 4;

      nameEl.style.fontSize = fontSize + 'px';
      while (nameEl.scrollWidth > nameEl.clientWidth && fontSize > minFontSize) {
        fontSize = Math.max(minFontSize, fontSize - step);
        nameEl.style.fontSize = fontSize + 'px';
      }
    });
  }

  showLeaderboard(leaderboard, playerName = 'Unknown', playerSummary = null) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    this.renderLeaderboardRows(listEl, leaderboard, playerSummary, true);

    const highlightRow = listEl.querySelector('.player-highlight');
    if (highlightRow) {
      const targetTop = Math.max(0, highlightRow.offsetTop - ((listEl.clientHeight - highlightRow.clientHeight) / 2));
      listEl.scrollTop = targetTop;
      this.updateBackTopButtonVisibility();
    }

    void playerName;
  }

  toDisplayName(name) {
    const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Unknown';
    const parts = cleaned.split(' ');
    if (parts.length < 2) return parts[0];
    const first = parts[0];
    const lastInitial = (parts[parts.length - 1] || '').charAt(0).toUpperCase();
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }

  showLeaderboardLoading() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    this.renderLoadingRow(listEl, 'LOADING...');
  }

  showLeaderboardError(message = 'UNABLE TO LOAD LEADERBOARD') {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    this.renderLoadingRow(listEl, message);
  }

  emitPressEffect(buttonIndex) {
    const buttons = document.querySelectorAll('#button-grid .game-button');
    const button = buttons[buttonIndex];
    if (!button) return;

    button.classList.remove('pressed');
    void button.offsetWidth; // force reflow so re-adding 'pressed' re-triggers transition
    button.classList.add('pressed');

    // Remove press state after animation completes; also clean up any lingering lit classes.
    clearTimeout(this._pressEffectTimeout);
    this._pressEffectTimeout = setTimeout(() => {
      button.classList.remove('pressed', 'lit', 'lit-red');
    }, 200);
  }

  /**
   * Light a specific grid button and start the grow animation.
   * @param {number} buttonIndex  - which cell to highlight
   * @param {string} type         - 'good' | 'red'
   * @param {number} growDurationMs - how long the cells take to fill (= reaction window)
   */
  lightButton(buttonIndex, type = 'good', growDurationMs = 1000) {
    const grid = document.getElementById('button-grid');
    const buttons = document.querySelectorAll('#button-grid .game-button');

    // Clear any previous state
    clearTimeout(this._pressEffectTimeout);
    buttons.forEach((btn) => btn.classList.remove('lit', 'lit-red', 'pressed'));

    // Mark target button
    if (buttons[buttonIndex]) {
      buttons[buttonIndex].classList.add(type === 'red' ? 'lit-red' : 'lit');
    }

    this.hideMissedOverlay();

    // Set duration and reset to scale(0) (no transition) before starting grow
    if (grid) {
      grid.classList.remove('grid-growing');
      grid.style.setProperty('--grow-duration', `${growDurationMs}ms`);
    }

    // Double rAF: ensures the scale(0) state is painted before grow begins
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (grid) grid.classList.add('grid-growing');
      });
    });
  }

  clearLitButton() {
    const grid = document.getElementById('button-grid');
    const buttons = document.querySelectorAll('#button-grid .game-button');

    // Leave 'pressed' class on the tapped button — emitPressEffect owns its cleanup
    buttons.forEach((btn) => {
      if (!btn.classList.contains('pressed')) {
        btn.classList.remove('lit', 'lit-red');
      }
    });

    // Removing grid-growing snaps all cells to scale(0) instantly (transition: 0ms default)
    if (grid) grid.classList.remove('grid-growing');
  }

  prepareGameScreen() {
    this.showScreen('game');
    this.clearLitButton();
    this.hideMissedOverlay();
    this.showGameStatus('START!!', 'good');
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

    const rollClass = delta >= 0 ? 'odometer-roll-up' : 'odometer-roll-down';
    const tintClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : '';

    el.classList.remove('delta-up', 'delta-down');
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
    this.animateOdometer('time-left', value);
    this.lastTimeValue = value;
  }

  updateGameStats(hits, misses, wrongWhacks) {
    // Intentionally hidden in the new screenshot-aligned HUD.
    void hits;
    void misses;
    void wrongWhacks;
  }

  showGameStatus(message, tone = '') {
    const waitingEl = document.getElementById('waiting-message');
    if (!waitingEl) return;
    waitingEl.textContent = message;
    waitingEl.dataset.baseText = message;
    waitingEl.classList.remove('judgement-fast', 'judgement-good', 'judgement-slow', 'judgement-bad');
    if (tone) {
      waitingEl.classList.add(`judgement-${tone}`);
    }
    this.refreshLedMarquee();
  }

  updateScore(score) {
    const numeric = Number(score) || 0;
    this.animateOdometer('current-score', numeric);
    this.lastScoreValue = numeric;
  }

  animateScoreBreakdown(items = []) {
    if (!items || items.length === 0) return;
    const delta = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    if (delta < 0) {
      this.showGameStatus('YOU MISSED!', 'bad');
    } else if (delta > 0) {
      this.showGameStatus('NICE HIT!', 'good');
    }
  }

  animateTimeBreakdown(items = []) {
    void items;
  }

  updatePreGameCountdown(seconds) {
    const display = document.getElementById('countdown-display');
    const numEl   = document.getElementById('pre-game-countdown-value');
    if (!display || !numEl) return;

    const val = Math.max(0, seconds);

    // Swap background colour class
    const colourMap = { 3: 'cd-teal', 2: 'cd-magenta', 1: 'cd-lime' };
    display.classList.remove('cd-teal', 'cd-magenta', 'cd-lime');
    display.classList.add(colourMap[val] || 'cd-teal');

    // Re-trigger pop-in animation by replacing the element clone
    const clone = numEl.cloneNode(true);
    clone.textContent = val > 0 ? String(val) : '';
    numEl.replaceWith(clone);
  }

  showGameEnd(totalScore, avgReaction, bestReaction) {
    // Populate results before the screen is revealed
    const finalScoreEl = document.getElementById('final-score');
    const avgReactionEl = document.getElementById('avg-reaction');
    if (finalScoreEl) {
      finalScoreEl.textContent = Number(totalScore || 0).toLocaleString();
    }
    if (avgReactionEl) {
      avgReactionEl.textContent = `${Number(avgReaction || 0).toFixed(3)}sec`;
    }

    // Create the lime-green GAME OVER overlay (position: fixed, covers everything)
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.innerHTML = '<span class="game-over-overlay-text">GAME OVER</span>';
    document.body.appendChild(overlay);

    // Phase 1: Slide in from the right (0 → 400ms)
    overlay.style.transform = 'translateX(100%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'transform 0.4s ease-out';
        overlay.style.transform = 'translateX(0)';
      });
    });

    // Phase 2: Hold full-screen for 0.6s (400ms → 1000ms)

    // Phase 3: Switch to score screen + shrink overlay height (1000ms → 1500ms)
    // Height animates from 100% → 291px; text stays centered and rides up with it
    setTimeout(() => {
      this.showScreen('score');
      overlay.style.transition = 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      overlay.style.height = '291px';
    }, 1000);

    // Phase 4: Fade out overlay, reveal banner beneath (1500ms → 1700ms)
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.2s ease';
      overlay.style.opacity = '0';
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
    const firstNameInput = document.getElementById('lead-first-name-input');
    const lastNameInput = document.getElementById('lead-last-name-input');

    return {
      firstName: firstNameInput ? firstNameInput.value.trim() : '',
      lastName: lastNameInput ? lastNameInput.value.trim() : '',
    };
  }

  clearLeadFormData() {
    const firstNameInput = document.getElementById('lead-first-name-input');
    const lastNameInput = document.getElementById('lead-last-name-input');

    if (firstNameInput) firstNameInput.value = '';
    if (lastNameInput) lastNameInput.value = '';

    // Reset display spans and band state
    const firstDisplay = document.getElementById('lead-firstname-display');
    const lastDisplay = document.getElementById('lead-lastname-display');
    if (firstDisplay) firstDisplay.textContent = '';
    if (lastDisplay) lastDisplay.textContent = '';
    ['lead-band-firstname', 'lead-band-lastname'].forEach((id) => {
      const band = document.getElementById(id);
      if (band) band.classList.remove('has-value', 'is-active');
    });

    this.clearLeadFormError();
  }

  showLeadFormError(message) {
    const errorEl = document.getElementById('lead-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  clearLeadFormError() {
    const errorEl = document.getElementById('lead-form-error');
    if (!errorEl) return;
    errorEl.classList.add('hidden');
  }

  resetLeadFormBands() {
    const ids = ['lead-info-banner', 'lead-band-firstname', 'lead-band-lastname',
      'lead-form-lower', 'touch-keyboard', 'lead-actions'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = 'none';
      el.style.transform = 'translateX(100%)';
    });
  }

  animateLeadFormIn() {
    const ids = ['lead-info-banner', 'lead-band-firstname', 'lead-band-lastname',
      'lead-form-lower', 'touch-keyboard', 'lead-actions'];
    const stagger = 70; // ms between each element
    const duration = 320;
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      setTimeout(() => {
        el.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = 'translateX(0)';
      }, i * stagger);
    });
    // Auto-activate first name field after animation settles
    const totalDelay = (ids.length - 1) * stagger + duration + 40;
    setTimeout(() => {
      const firstNameInput = document.getElementById('lead-first-name-input');
      if (firstNameInput) firstNameInput.focus({ preventScroll: true });
    }, totalDelay);
  }

  showIdleWarning() {
    this.showScreen('idle-warning');
  }

  hideIdleWarning() {
    const screen = document.getElementById('screen-idle-warning');
    if (screen && this.currentScreen !== 'idle-warning') {
      screen.classList.add('hidden');
    }
  }

  updateIdleCountdown(seconds) {
    const countdownEl = document.getElementById('idle-countdown-value');
    if (countdownEl) {
      countdownEl.textContent = String(seconds);
    }
  }

  hideEnterNameButton() {
    // Backward-compatible no-op.
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}
