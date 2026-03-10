/** Main application entry point (touch display mode). */

document.addEventListener('DOMContentLoaded', () => {
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
  const emailInput = document.getElementById('lead-email-input');

  if (!keyboardContainer || !firstNameInput || !lastNameInput || !emailInput) return;

  window.touchKeyboard = new TouchKeyboard(firstNameInput);
  window.touchKeyboard.init(keyboardContainer);

  const bindInput = (input) => {
    input.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (window.touchKeyboard) {
        window.touchKeyboard.input = input;
      }
      const end = input.value.length;
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(end, end);
      }
      input.focus({ preventScroll: true });
    });

    input.addEventListener('focus', () => {
      if (window.touchKeyboard) {
        window.touchKeyboard.input = input;
      }
      const end = input.value.length;
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(end, end);
      }
    });

    input.addEventListener('input', () => {
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
  bindInput(emailInput);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function setupEventHandlers() {
  let leadSubmitInFlight = false;

  const bindPress = (element, handler) => {
    if (!element) return;
    let lastPressTs = 0;

    const run = (event) => {
      const now = Date.now();
      if (now - lastPressTs < 280) return;
      lastPressTs = now;
      event.preventDefault();
      handler(event);
    };

    // Touch kiosk flow: pointerdown only to avoid ghost click on the next screen.
    element.addEventListener('pointerdown', run);
  };

  const demoStartBtn = document.getElementById('demo-start-btn');
  bindPress(demoStartBtn, () => {
    if (window.game) {
      window.game.resetGame();
      window.game.setState(window.GameState.PRE_GAME_COUNTDOWN);
    }
  });

  const scorePlayAgainBtn = document.getElementById('score-play-again-btn');
  const scoreDoneBtn = document.getElementById('score-done-btn');

  bindPress(scorePlayAgainBtn, () => {
    if (window.game) {
      window.game.playAgain();
    }
  });

  bindPress(scoreDoneBtn, () => {
    if (window.game && window.ui) {
      window.ui.clearLeadFormError();
      window.game.setState(window.GameState.LEAD_FORM);
    }
  });

  const leadSubmitBtn = document.getElementById('lead-submit-btn');
  const leadBackBtn = document.getElementById('lead-back-btn');
  const leadConsentInput = document.getElementById('lead-consent-input');

  if (leadConsentInput) {
    leadConsentInput.addEventListener('change', () => {
      if (window.game) {
        window.game.handleUserAction();
      }
      if (window.ui) {
        window.ui.clearLeadFormError();
      }
    });
  }

  bindPress(leadBackBtn, () => {
    if (window.game) {
      window.game.setState(window.GameState.SHOW_SCORE, { direction: 'back' });
    }
  });

  bindPress(leadSubmitBtn, async () => {
    if (!window.game || !window.ui) return;
    if (leadSubmitInFlight) return;

    const data = window.ui.getLeadFormData();
    if (!data.firstName || !data.lastName || !isValidEmail(data.email)) {
      window.ui.showLeadFormError('Please enter first name, last name, and a valid email.');
      return;
    }

    leadSubmitInFlight = true;
    try {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      window.game.playerName = fullName;
      window.game.playerFirstName = data.firstName.trim();
      window.game.playerLastName = data.lastName.trim();
      window.game.playerEmail = data.email.toLowerCase();
      window.game.playerCompany = '';
      window.game.newsletterOptIn = !!data.consent;

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
