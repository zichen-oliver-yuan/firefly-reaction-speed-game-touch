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
        this.showScreen('lead-form', nav.direction);
        this.clearLeadFormError();
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
    const bands = document.getElementById('attract-bands');
    if (bands) {
      // Disable flex-grow transitions so bands snap instantly (no glimpse of colours)
      bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = 'none'; });
      void bands.offsetHeight; // force synchronous reflow so transition:none takes effect
      bands.classList.remove('attract-phase-1', 'attract-phase-2', 'attract-growing', 'attract-scrolling', 'attract-phase4');
      // Re-enable transitions on the next paint
      requestAnimationFrame(() => {
        bands.querySelectorAll('.attract-band').forEach(b => { b.style.transition = ''; });
      });
    }

    const resetTrack = (id, text) => {
      const track = document.getElementById(id);
      if (!track) return;
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
   * 1. Builds track copies at current (small) font size for all bands
   * 2. Starts percentage-based scroll (-50% auto-adapts as original 3 items grow)
   * 3. Adds attract-growing class → original 3 grow to fill screen,
   *    extra 9 get tiny slivers below the fold (already scrolling)
   */
  startAttractScroll() {
    const bands = document.getElementById('attract-bands');
    if (!bands) return;

    const allConfigs = [...this.attractBandConfigs, ...this.attractExtraBandConfigs];

    // 1. Measure current single items at small font
    const measurements = allConfigs.map(({ id }) => {
      const track = document.getElementById(id);
      const seed  = track?.querySelector('.attract-item');
      return {
        itemW: seed?.getBoundingClientRect().width ?? 0,
        bandW: track?.closest('.attract-band')?.getBoundingClientRect().width ?? 1080,
      };
    });

    // 2. Build each track with copies at small size and start percentage-based scroll.
    //    Using -50% keyframes means the loop adapts automatically as items grow.
    //    Speed is multiplied by attractSpeedScale so Phase 3 and Phase 4 match.
    allConfigs.forEach(({ id, text, dir, speed }, i) => {
      const track = document.getElementById(id);
      if (!track) return;

      const { itemW, bandW } = measurements[i];
      if (!itemW) return;

      // 5× band-width per half → 10× total. Ensures text always overflows the
      // screen at both large (Phase 3) AND small (Phase 4) font sizes.
      const copies = Math.max(8, Math.ceil((bandW * 5) / itemW) + 2);

      track.innerHTML = '';
      for (let j = 0; j < copies * 2; j++) {
        const s = document.createElement('span');
        s.className   = 'attract-item';
        s.textContent = text;
        track.appendChild(s);
      }

      track.style.justifyContent = 'flex-start';
      track.style.width = 'max-content';

      // Same speed scale as Phase 4 so velocity is consistent across phases
      const dur = speed * this.phase4SpeedScale;
      const animName = dir === 'ltr' ? 'attractScrollLTR' : 'attractScrollRTL';
      track.style.animation = `${animName} ${dur}s linear infinite`;
    });

    // 3. Force layout at small size, then trigger grow transition.
    //    Original 3 items transition from small → large while already scrolling.
    //    Extra 9 bands become tiny slivers below the fold, already scrolling.
    void bands.offsetHeight;
    bands.classList.add('attract-growing');
  }

  /**
   * Phase 4: zoom-out — compress all 12 bands to equal height.
   * Just switches CSS classes. The percentage-based scroll animations (-50%)
   * adapt automatically as font-size and band heights transition, so there's
   * no need to freeze, capture fractions, or restart animations.
   */
  showAttractPhase4() {
    const bands = document.getElementById('attract-bands');
    if (!bands) return;

    // Remove Phase 2/3 classes so their flex-grow / font-size rules stop.
    // Phase 4 class triggers two simultaneous 0.9s transitions:
    //   • flex-grow: 1000→1 for original bands (shrink), 0→1 for extras (grow)
    //   • font-size: large→small for original bands (synced to same easing)
    // Extra bands fade in via opacity transition on .attract-band-extra.
    bands.classList.remove('attract-phase-1', 'attract-phase-2', 'attract-growing', 'attract-scrolling');
    bands.classList.add('attract-phase4');
  }

  /** Start the multi-step attract cycle. */
  startAttractCycle() {
    this.stopAttractCycle();
    this.resetAttractPhase();
    this.setDemoLeaderboardVisible(false);

    const at = (delay, fn) => {
      const t = setTimeout(fn, delay);
      this.attractTimers.push(t);
    };

    const bands = document.getElementById('attract-bands');

    // Phase 1 – magenta slides up
    at(this.attractReveal1Ms, () => {
      if (bands) bands.classList.add('attract-phase-1');
    });

    // Phase 2 – lime slides up
    at(this.attractReveal2Ms, () => {
      if (bands) bands.classList.add('attract-phase-2');
    });

    // Phase 3 – text grows AND scrolls simultaneously
    at(this.attractGrowMs, () => {
      this.startAttractScroll();
    });

    // Phase 4 – zoom-out: bands compress to 1/12 height, extra rows rise into view
    at(this.attractGridMs, () => {
      this.showAttractPhase4();
    });

    // Leaderboard slides up over grid
    at(this.attractLbShowMs, () => {
      this.setDemoLeaderboardVisible(true);
    });

    // Leaderboard hides → restart cycle
    at(this.attractLbHideMs, () => {
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
          <span>${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
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
          <span>${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
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
        <span>${this.toDisplayName(entry.name)}</span>
        <span class="leaderboard-score">${entry.score || 0}${includePtsSuffix ? 'PTS' : ''}</span>
      `;
      rowEls.push(row);
    });

    if (hasPlayer && !playerInserted) {
      const playerRow = document.createElement('div');
      playerRow.className = 'leaderboard-entry player-highlight';
      playerRow.innerHTML = `
        <span>${playerSummary.placement ? '#' + playerSummary.placement.rank : '-'}</span>
        <span>${this.toDisplayName(playerSummary.playerData.name || 'YOU')}</span>
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
    this.updateBackTopButtonVisibility();
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
    this.showScreen('score');

    const finalScoreEl = document.getElementById('final-score');
    const bestEl = document.getElementById('best-reaction');
    const subtitleEl = document.getElementById('score-subtitle');

    if (finalScoreEl) {
      finalScoreEl.textContent = Number(totalScore || 0).toLocaleString();
    }
    if (bestEl) {
      bestEl.textContent = Number(bestReaction || 0).toFixed(3);
    }
    if (subtitleEl) {
      subtitleEl.textContent = avgReaction <= 0.3 ? 'YOU ARE SO FAST!' : 'NICE WORK!';
      subtitleEl.dataset.baseText = subtitleEl.textContent;
    }
    this.refreshLedMarquee();
  }

  updateCountdown(seconds) {
    // HOME button — just keep the label clean; no countdown number shown.
    void seconds;
  }

  getLeadFormData() {
    const firstNameInput = document.getElementById('lead-first-name-input');
    const lastNameInput = document.getElementById('lead-last-name-input');
    const emailInput = document.getElementById('lead-email-input');
    const consentInput = document.getElementById('lead-consent-input');

    return {
      firstName: firstNameInput ? firstNameInput.value.trim() : '',
      lastName: lastNameInput ? lastNameInput.value.trim() : '',
      email: emailInput ? emailInput.value.trim() : '',
      consent: consentInput ? consentInput.checked : false
    };
  }

  clearLeadFormData() {
    const firstNameInput = document.getElementById('lead-first-name-input');
    const lastNameInput = document.getElementById('lead-last-name-input');
    const emailInput = document.getElementById('lead-email-input');
    const consentInput = document.getElementById('lead-consent-input');

    if (firstNameInput) firstNameInput.value = '';
    if (lastNameInput) lastNameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (consentInput) consentInput.checked = true;
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
