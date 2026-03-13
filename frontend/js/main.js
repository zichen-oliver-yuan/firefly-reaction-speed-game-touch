/** Main application entry point (touch display mode). */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  window.isRecordingMode = params.get('record') === '1';
  if (window.isRecordingMode && document.body) {
    document.body.classList.add('recording-mode');
  }

  // ?video=1 in the URL overrides the config flag (either direction).
  const videoParam = params.get('video');
  const useVideoAttract = videoParam !== null
    ? videoParam === '1'
    : !!(window.CONFIG && window.CONFIG.ui && window.CONFIG.ui.useVideoAttract);
  const disableDomAttractBands = !!(window.CONFIG && window.CONFIG.ui && window.CONFIG.ui.disableDomAttractBands);

  window.useVideoAttract = useVideoAttract;
  window.disableDomAttractBands = disableDomAttractBands;

  if (document.body) {
    document.body.classList.toggle('use-video-attract', useVideoAttract);
    document.body.classList.toggle('no-dom-attract', disableDomAttractBands);
  }

  window.setAttractVideoMode = (enabled) => {
    const next = !!enabled;
    window.useVideoAttract = next;
    if (document.body) {
      document.body.classList.toggle('use-video-attract', next);
    }
    // Restart the cycle so it picks up the new mode (video vs DOM bands).
    if (window.ui && window.game && window.game.state === window.GameState.DEMO && window.ui.currentScreen === 'demo') {
      window.ui.startAttractCycle();
    }
    console.log(`[attract] video mode: ${next ? 'ON' : 'OFF'}`);
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

    const run = (event) => {
      const now = Date.now();
      if (now - lastPressTs < 280) return;
      lastPressTs = now;
      if (event && typeof event.preventDefault === 'function' && event.cancelable) {
        event.preventDefault();
      }
      handler(event);
    };

    element.addEventListener('pointerdown', run);
    element.addEventListener('click', run);
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      run(event);
    });
  };

  const demoStartBtn = document.getElementById('demo-start-btn');
  bindPress(demoStartBtn, () => {
    if (window.game) {
      window.game.resetGame();
      window.game.setState(window.GameState.PRE_GAME_COUNTDOWN);
    }
  });

  const scoreDoneBtn = document.getElementById('score-done-btn');

  bindPress(scoreDoneBtn, () => {
    if (window.game && window.ui) {
      leadFormSkipPressesRemaining = null;
      window.ui.clearLeadFormError();
      window.game.setState(window.GameState.LEAD_FORM);
    }
  });

  const leadSubmitBtn = document.getElementById('lead-submit-btn');
  const leadBackBtn = document.getElementById('lead-back-btn');

  bindPress(leadBackBtn, () => {
    if (window.game) {
      window.game.setState(window.GameState.SHOW_SCORE, { direction: 'back' });
    }
  });

  bindPress(leadSubmitBtn, async () => {
    if (!window.game || !window.ui) return;
    if (leadSubmitInFlight) return;

    const data = window.ui.getLeadFormData();
    const firstNameEmpty = !data.firstName;
    const lastNameEmpty = !data.lastName;
    if (firstNameEmpty || lastNameEmpty) {
      if (!(firstNameEmpty && lastNameEmpty)) {
        leadFormSkipPressesRemaining = null;
        window.ui.showLeadFormError('Please enter your first and last name.');
        return;
      }

      if (leadFormSkipPressesRemaining === null) {
        leadFormSkipPressesRemaining = 4;
      } else {
        leadFormSkipPressesRemaining = Math.max(leadFormSkipPressesRemaining - 1, 0);
      }

      if (leadFormSkipPressesRemaining > 0) {
        const suffix = leadFormSkipPressesRemaining === 1 ? '' : 's';
        window.ui.showLeadFormError(`Please enter your first and last name for prize contact. If you wish not to participate in the competition, press NEXT ${leadFormSkipPressesRemaining} more time${suffix} to continue.`);
        return;
      }

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
        const stillShowingLeaderboard = window.game
          && window.game.state === window.GameState.SHOW_LEADERBOARD;
        if (!stillShowingLeaderboard) return;

        if (remoteLeaderboard && remoteLeaderboard.length > 0) {
          window.ui.showLeaderboard(remoteLeaderboard, '', null);
          return;
        }

        if (cachedRemoteLeaderboard.length === 0) {
          window.ui.showLeaderboardError('NO SCORES YET');
        }
      });
      return;
    }

    leadFormSkipPressesRemaining = null;
    leadSubmitInFlight = true;
    try {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      window.game.playerName = fullName;
      window.game.playerFirstName = data.firstName.trim();
      window.game.playerLastName = data.lastName.trim();
      window.game.playerEmail = '';
      window.game.playerCompany = '';
      window.game.newsletterOptIn = false;

      const playerData = window.game.buildPlayerData();
      const cachedRemoteLeaderboard = window.game.getCachedRemoteLeaderboard(1000);
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
        const stillShowingLeaderboard = window.game
          && window.game.state === window.GameState.SHOW_LEADERBOARD;
        if (!stillShowingLeaderboard) return;

        playerSummary.pendingSync = window.game.isScorePending(playerData.scoreId);
        if (remoteLeaderboard && remoteLeaderboard.length > 0) {
          playerSummary.placement = window.game.getPlayerPlacementAgainstLeaderboard(playerData, remoteLeaderboard);
          window.ui.showLeaderboard(remoteLeaderboard, fullName, playerSummary);
          return;
        }

        if (cachedRemoteLeaderboard.length === 0) {
          window.ui.showLeaderboardError('NO SCORES YET');
        }
      });
    } finally {
      leadSubmitInFlight = false;
    }
  });

  const playAgainBtn = document.getElementById('play-again-btn');
  const leaderboardDoneBtn = document.getElementById('leaderboard-done-btn');

  bindPress(playAgainBtn, () => {
    if (window.game) {
      window.game.playAgain();
    }
  });

  bindPress(leaderboardDoneBtn, () => {
    if (window.game) {
      window.game.clearIdleTimer();
      window.game.clearIdleWarning();
      window.game.setState(window.GameState.DEMO);
    }
  });

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
