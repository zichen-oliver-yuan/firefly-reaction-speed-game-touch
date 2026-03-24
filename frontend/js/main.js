/** Main application entry point (touch display mode). */

document.addEventListener('DOMContentLoaded', () => {
  // ── PWA: register service worker for offline caching ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ── Kiosk: enter immersive fullscreen on first touch (Android) ──
  function requestFullscreen() {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rfs) rfs.call(el).catch(() => {});
  }
  document.addEventListener('pointerdown', requestFullscreen, { once: true });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      document.addEventListener('pointerdown', requestFullscreen, { once: true });
    }
  });

  // ── Kiosk: block touchmove except on scrollable areas ──
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.leaderboard-list, .lead-band-lastname.search-mode, .returning-search-results')) return;
    e.preventDefault();
  }, { passive: false });

  const runtimeConfig = (typeof window !== 'undefined' && window.CONFIG)
    || (typeof CONFIG !== 'undefined' ? CONFIG : null)
    || {};
  const params = new URLSearchParams(window.location.search);
  window.isRecordingMode = params.get('record') === '1';
  if (window.isRecordingMode && document.body) {
    document.body.classList.add('recording-mode');
  }

  // ?video=1 in the URL overrides the config flag (either direction).
  const videoParam = params.get('video');
  const useVideoAttract = videoParam !== null
    ? videoParam === '1'
    : !!(runtimeConfig && runtimeConfig.ui && runtimeConfig.ui.useVideoAttract);
  const configDisableDomAttractBands = !!(runtimeConfig && runtimeConfig.ui && runtimeConfig.ui.disableDomAttractBands);
  const disableDomAttractBands = useVideoAttract || configDisableDomAttractBands;

  window.useVideoAttract = useVideoAttract;
  window.disableDomAttractBands = disableDomAttractBands;

  if (document.body) {
    document.body.classList.toggle('use-video-attract', useVideoAttract);
    document.body.classList.toggle('no-dom-attract', disableDomAttractBands);
  }

  window.setAttractVideoMode = (enabled) => {
    const next = !!enabled;
    window.useVideoAttract = next;
    if (next) {
      window.disableDomAttractBands = true;
    } else {
      window.disableDomAttractBands = configDisableDomAttractBands;
    }
    if (document.body) {
      document.body.classList.toggle('use-video-attract', next);
      document.body.classList.toggle('no-dom-attract', window.disableDomAttractBands);
    }
    if (window.ui && window.game && window.game.state === window.GameState.DEMO && window.ui.currentScreen === 'demo') {
      window.ui.startAttractCycle();
    }
    console.log(`[attract] video mode: ${next ? 'ON' : 'OFF'} (DOM bands: ${window.disableDomAttractBands ? 'OFF' : 'ON'})`);
  };

  window.setDomAttractEnabled = (enabled) => {
    const next = !!enabled;
    window.disableDomAttractBands = !next;
    if (document.body) {
      document.body.classList.toggle('no-dom-attract', !next);
    }
    if (!next && window.ui) {
      window.ui.stopAttractCycle();
    } else if (next && window.ui && window.game && window.game.state === window.GameState.DEMO && window.ui.currentScreen === 'demo' && !window.useVideoAttract) {
      window.ui.startAttractCycle();
    }
    console.log(`[attract] DOM bands: ${next ? 'ON' : 'OFF'}`);
  };

  window.setIncandescentMode = (enabled) => {
    if (window.ui) {
      window.ui.setIncandescentMode(enabled);
    }
    console.log(`[game] incandescent mode: ${enabled ? 'ON' : 'OFF'}`);
  };

  window.setSoundEffects = (enabled) => {
    if (window.game && window.game.sound) {
      window.game.sound.setEnabled(enabled);
    }
  };

  window.ui = new UIController();
  window.game = new Game();

  setupEventHandlers();
  setupTouchKeyboard();

  window.game.init();
});

function setupTouchKeyboard() {
  const keyboardContainer = document.getElementById('touch-keyboard');
  const firstNameInput = document.getElementById('lead-first-name-input');
  const lastNameInput = document.getElementById('lead-last-name-input');

  if (!keyboardContainer || !firstNameInput || !lastNameInput) return;

  window.touchKeyboard = new TouchKeyboard(firstNameInput);
  window.touchKeyboard.init(keyboardContainer);

  // Maps each input to its band and display span
  const fields = [
    { input: firstNameInput, bandId: 'lead-band-firstname', displayId: 'lead-firstname-display' },
    { input: lastNameInput,  bandId: 'lead-band-lastname',  displayId: 'lead-lastname-display'  },
  ];

  const setActiveField = (targetInput) => {
    if (window.touchKeyboard) {
      window.touchKeyboard.input = targetInput;
    }
    fields.forEach(({ input, bandId }) => {
      if (!bandId) return;
      const band = document.getElementById(bandId);
      if (band) band.classList.toggle('is-active', input === targetInput);
    });
    const end = targetInput.value.length;
    if (typeof targetInput.setSelectionRange === 'function') {
      targetInput.setSelectionRange(end, end);
    }
    targetInput.focus({ preventScroll: true });
  };

  const updateFieldDisplay = (targetInput) => {
    const field = fields.find((f) => f.input === targetInput);
    if (!field || !field.displayId || !field.bandId) return;
    const displayEl = document.getElementById(field.displayId);
    if (displayEl) displayEl.textContent = targetInput.value;
    const band = document.getElementById(field.bandId);
    if (band) band.classList.toggle('has-value', targetInput.value.length > 0);
  };

  // Tap on a band to activate its input
  fields.forEach(({ input, bandId }) => {
    if (!bandId) return;
    const band = document.getElementById(bandId);
    if (!band) return;
    band.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setActiveField(input);
    });
  });

  const bindInput = (input) => {
    input.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setActiveField(input);
    });

    input.addEventListener('focus', () => {
      setActiveField(input);
    });

    input.addEventListener('input', () => {
      updateFieldDisplay(input);
      if (window.game) {
        window.game.handleUserAction();
      }
      if (window.ui) {
        window.ui.clearLeadFormError();
        // Filter search results in returning-player mode
        if (window.ui.returningPlayerMode && input === firstNameInput) {
          window.ui.filterReturningPlayerResults(input.value);
        }
      }
    });
  };

  bindInput(firstNameInput);
  bindInput(lastNameInput);
}

function setupEventHandlers() {
  let leadSubmitInFlight = false;
  let leadFormSkipPressesRemaining = null;

  const bindPress = (element, handler) => {
    if (!element) return;
    let lastPressTs = 0;
    let active = false;
    let downRect = null;  // rect captured before scale shrink

    element.addEventListener('pointerdown', (event) => {
      const now = Date.now();
      if (now - lastPressTs < 280) return;
      event.preventDefault();
      // Capture rect BEFORE .pressing shrinks the element
      downRect = element.getBoundingClientRect();
      active = true;
      element.classList.add('pressing');
      element.setPointerCapture(event.pointerId);
    });

    element.addEventListener('pointerup', (event) => {
      element.classList.remove('pressing');
      if (!active) return;
      active = false;
      lastPressTs = Date.now();
      const rect = downRect || element.getBoundingClientRect();
      downRect = null;
      if (event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom) {
        handler(event);
      }
    });

    element.addEventListener('pointermove', (event) => {
      if (!active) return;
      const rect = downRect || element.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                     event.clientY >= rect.top && event.clientY <= rect.bottom;
      element.classList.toggle('pressing', inside);
    });

    element.addEventListener('pointercancel', () => {
      active = false;
      downRect = null;
      element.classList.remove('pressing');
    });
  };

  const demoStartBtn = document.getElementById('demo-start-btn');
  bindPress(demoStartBtn, () => {
    if (window.game) {
      window.game.sound.playNavNext();
      window.game.resetGame();
      window.game.setState(window.GameState.TIP_PAGE);
    }
  });

  const tipBackBtn = document.getElementById('tip-back-btn');
  bindPress(tipBackBtn, () => {
    if (window.game) {
      window.game.sound.playNavBack();
      window.game.setState(window.GameState.DEMO);
    }
  });

  const tipReadyBtn = document.getElementById('tip-ready-btn');
  bindPress(tipReadyBtn, () => {
    if (window.game) {
      window.game.sound.playNavNext();
      window.game.setState(window.GameState.PRE_GAME_COUNTDOWN);
    }
  });

  const scoreDoneBtn = document.getElementById('score-done-btn');

  bindPress(scoreDoneBtn, () => {
    if (window.game && window.ui) {
      window.game.sound.stopGameOver();
      window.game.sound.playNavNext();
      leadFormSkipPressesRemaining = null;
      window.ui.clearLeadFormError();
      window.game.setState(window.GameState.LEAD_FORM);
      // Show "PLAYED BEFORE?" if there are leaderboard entries
      const cached = window.game.getCachedRemoteLeaderboard(1000);
      window.ui.showReturningPlayerBtn(cached);
    }
  });

  const leadBackBtn = document.getElementById('lead-back-btn');
  bindPress(leadBackBtn, () => {
    if (window.game) {
      window.game.sound.playNavBack();
      window.game.setState(window.GameState.SHOW_SCORE);
    }
  });

  const leadSubmitBtn = document.getElementById('lead-submit-btn');

  const goToLeaderboardWithoutPlayer = () => {
    leadFormSkipPressesRemaining = null;
    const cachedRemoteLeaderboard = window.game.getCachedRemoteLeaderboard(1000);
    window.game.setState(window.GameState.SHOW_LEADERBOARD);
    if (cachedRemoteLeaderboard.length > 0) {
      window.ui.showLeaderboard(cachedRemoteLeaderboard, '', null);
    } else {
      window.ui.showLeaderboardLoading();
    }
    window.game.startLeaderboardCountdown();
    window.game.handleUserAction();

    window.game.refreshRemoteLeaderboardInBackground(1000).then((remoteLeaderboard) => {
      const stillOnLeaderboard = window.game
        && window.game.state === window.GameState.SHOW_LEADERBOARD;
      if (!stillOnLeaderboard) return;
      if (remoteLeaderboard && remoteLeaderboard.length > 0) {
        window.ui.showLeaderboard(remoteLeaderboard, '', null);
      } else if (cachedRemoteLeaderboard.length === 0) {
        window.ui.showLeaderboardError('NO SCORES YET');
      }
    });
  };

  bindPress(leadSubmitBtn, () => {
    if (!window.game || !window.ui) return;
    window.game.sound.playNavNext();
    if (window.game.state !== window.GameState.LEAD_FORM) return;
    if (leadSubmitInFlight) return;

    // Exit search mode if still active (user pressed NEXT while searching)
    if (window.ui.returningPlayerMode) {
      window.ui.exitReturningPlayerMode();
    }

    const data = window.ui.getLeadFormData();
    const firstNameEmpty = !data.firstName;
    const lastNameEmpty = !data.lastName;

    if (firstNameEmpty && lastNameEmpty) {
      if (leadFormSkipPressesRemaining === null) {
        leadFormSkipPressesRemaining = 3;
      } else {
        leadFormSkipPressesRemaining = Math.max(leadFormSkipPressesRemaining - 1, 0);
      }

      if (leadFormSkipPressesRemaining > 0) {
        const suffix = leadFormSkipPressesRemaining === 1 ? '' : 's';
        window.ui.showLeadFormError(`Please enter your first and last name for prize contact. If you wish not to participate in the competition, press NEXT ${leadFormSkipPressesRemaining} more time${suffix} to continue.`);
        return;
      }

      goToLeaderboardWithoutPlayer();
      return;
    }

    if (firstNameEmpty || lastNameEmpty) {
      leadFormSkipPressesRemaining = null;
      window.ui.showLeadFormError('Please enter your first and last name.');
      return;
    }

    leadFormSkipPressesRemaining = null;
    leadSubmitInFlight = true;
    try {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      window.game.playerName = fullName;
      window.game.playerFirstName = data.firstName.trim();
      window.game.playerLastName = data.lastName.trim();

      const playerData = window.game.buildPlayerData();
      const cachedRemoteLeaderboard = window.game.getCachedRemoteLeaderboard(1000);
      const isReturning = !!window.game.returningPlayerName;

      // Returning player: if new score is not higher, skip save and show existing entry
      if (isReturning && cachedRemoteLeaderboard.length > 0) {
        const returningLower = window.game.returningPlayerName.trim().toLowerCase();
        const existingEntry = cachedRemoteLeaderboard.find(
          (e) => (e.name || '').trim().toLowerCase() === returningLower
        );
        if (existingEntry && Number(existingEntry.score) >= playerData.totalScore) {
          // Existing score is equal or higher — show leaderboard with their old entry
          const fakePlacement = window.game.getPlayerPlacementAgainstLeaderboard(
            { totalScore: existingEntry.score }, cachedRemoteLeaderboard
          );
          const fakeSummary = {
            playerData: { name: existingEntry.name, totalScore: existingEntry.score },
            placement: fakePlacement,
            pendingSync: false
          };
          window.game.setState(window.GameState.SHOW_LEADERBOARD);
          window.ui.showLeaderboard(cachedRemoteLeaderboard, existingEntry.name, fakeSummary);
          window.game.startLeaderboardCountdown();
          window.game.handleUserAction();
          return;
        }
      }

      const placement = cachedRemoteLeaderboard.length > 0
        ? window.game.getPlayerPlacementAgainstLeaderboard(playerData, cachedRemoteLeaderboard)
        : window.game.getPlayerPlacement(playerData);
      const playerSummary = {
        playerData,
        placement,
        pendingSync: true
      };
      window.game.setState(window.GameState.SHOW_LEADERBOARD);
      if (cachedRemoteLeaderboard.length > 0) {
        window.ui.showLeaderboard(cachedRemoteLeaderboard, fullName, playerSummary);
      } else {
        window.ui.showLeaderboardLoading();
      }
      window.game.startLeaderboardCountdown();
      window.game.handleUserAction();

      window.game.saveScoreInBackground(playerData).catch((error) => {
        console.error('Background save failed:', error);
      });

      window.game.refreshRemoteLeaderboardInBackground(1000).then((remoteLeaderboard) => {
        const stillOnLeaderboard = window.game
          && window.game.state === window.GameState.SHOW_LEADERBOARD;
        if (!stillOnLeaderboard) return;

        playerSummary.pendingSync = window.game.isScorePending(playerData.scoreId);
        if (remoteLeaderboard && remoteLeaderboard.length > 0) {
          playerSummary.placement = window.game.getPlayerPlacementAgainstLeaderboard(playerData, remoteLeaderboard);
          window.ui.showLeaderboard(remoteLeaderboard, fullName, playerSummary);
        } else if (cachedRemoteLeaderboard.length === 0) {
          window.ui.showLeaderboardError('NO SCORES YET');
        }
      });
    } catch (error) {
      console.error('[lead-submit] Failed to submit score:', error);
      goToLeaderboardWithoutPlayer();
    } finally {
      leadSubmitInFlight = false;
    }
  });

  const playAgainBtn = document.getElementById('play-again-btn');
  const leaderboardDoneBtn = document.getElementById('leaderboard-done-btn');

  bindPress(playAgainBtn, () => {
    if (window.game) {
      window.game.sound.playNavNext();
      window.game.playAgain();
    }
  });

  bindPress(leaderboardDoneBtn, () => {
    if (window.game) {
      window.game.sound.playNavNext();
      window.game.sound.stopGameOver();
      window.game.clearIdleTimer();
      window.game.clearIdleWarning();
      window.game.setState(window.GameState.DEMO);
    }
  });

  // ─── Returning-player search ───────────────────────────────────
  const returningPlayerBtn = document.getElementById('returning-player-btn');
  bindPress(returningPlayerBtn, () => {
    if (!window.ui || !window.game) return;
    window.game.handleUserAction();
    if (window.ui.returningPlayerMode) {
      window.ui.exitReturningPlayerMode();
    } else {
      const cached = window.game.getCachedRemoteLeaderboard(1000);
      window.ui.enterReturningPlayerMode(cached);
    }
  });

  // Tap on a search result to select the returning player.
  // Use pointerup + movement threshold so touch scrolling still works.
  const lastBand = document.getElementById('lead-band-lastname');
  if (lastBand) {
    let searchPointerStart = null;
    lastBand.addEventListener('pointerdown', (e) => {
      const result = e.target.closest('.returning-search-result');
      if (!result) { searchPointerStart = null; return; }
      searchPointerStart = { x: e.clientX, y: e.clientY, result };
      result.classList.add('pressing');
    });
    lastBand.addEventListener('pointermove', (e) => {
      if (!searchPointerStart) return;
      const dx = e.clientX - searchPointerStart.x;
      const dy = e.clientY - searchPointerStart.y;
      if (dx * dx + dy * dy > 100) { // 10px threshold
        searchPointerStart.result.classList.remove('pressing');
        searchPointerStart = null;
      }
    });
    const finishSearch = () => {
      if (!searchPointerStart) return;
      const result = searchPointerStart.result;
      result.classList.remove('pressing');
      searchPointerStart = null;
      const name = result.getAttribute('data-name');
      if (name && window.ui && window.game) {
        window.game.sound.playKeyClick();
        window.ui.selectReturningPlayer(name);
        window.game.returningPlayerName = name;
        window.game.handleUserAction();
      }
    };
    lastBand.addEventListener('pointerup', finishSearch);
    lastBand.addEventListener('pointercancel', () => {
      if (searchPointerStart) {
        searchPointerStart.result.classList.remove('pressing');
        searchPointerStart = null;
      }
    });
  }

  const resumeBtn = document.getElementById('resume-btn');
  bindPress(resumeBtn, () => {
    if (window.game) {
      window.game.resumeFromIdle();
    }
  });

  const gameGrid = document.getElementById('button-grid');
  if (gameGrid) {
    gameGrid.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.game-button');
      if (button && window.game) {
        event.preventDefault();
        const index = Number(button.dataset.index);
        if (Number.isInteger(index)) {
          window.game.handleGridButtonPress(index, 'grid:pointerdown');
        }
      }
    });
  }

  document.addEventListener('click', () => {
    if (window.game) {
      window.game.handleUserAction();
    }
  });

  document.addEventListener('keydown', () => {
    if (window.game) {
      window.game.handleUserAction();
    }
  });

  document.addEventListener('touchstart', () => {
    if (window.game) {
      window.game.handleUserAction();
    }
  });
}
