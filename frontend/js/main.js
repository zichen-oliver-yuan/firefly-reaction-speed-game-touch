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
  const nameInput = document.getElementById('lead-name-input');
  const emailInput = document.getElementById('lead-email-input');
  const companyInput = document.getElementById('lead-company-input');
  if (!keyboardContainer || !nameInput || !emailInput || !companyInput) return;

  window.touchKeyboard = new TouchKeyboard(nameInput);
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

  bindInput(nameInput);
  bindInput(emailInput);
  bindInput(companyInput);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function setupEventHandlers() {
  let leadSubmitInFlight = false;

  const bindPress = (element, handler) => {
    if (!element) return;
    let lastPressTs = 0;
    const run = (event, prevent = true) => {
      const now = Date.now();
      if (now - lastPressTs < 280) return;
      lastPressTs = now;
      if (prevent) {
        event.preventDefault();
      }
      handler(event);
    };

    element.addEventListener('pointerdown', (event) => run(event, true));
    element.addEventListener('click', (event) => run(event, false));
  };

  const demoStartBtn = document.getElementById('demo-start-btn');
  bindPress(demoStartBtn, () => {
    if (window.game) {
      window.game.resetGame();
      window.game.setState(window.GameState.WELCOME);
    }
  });

  const tutorialYesBtn = document.getElementById('tutorial-yes');
  const tutorialNoBtn = document.getElementById('tutorial-no');

  bindPress(tutorialYesBtn, () => {
    if (window.game) {
      window.game.setState(window.GameState.TUTORIAL);
    }
  });

  bindPress(tutorialNoBtn, () => {
    if (window.game) {
      window.game.skipTutorial();
    }
  });

  const tutorialPrevBtn = document.getElementById('tutorial-prev');
  const tutorialNextBtn = document.getElementById('tutorial-next');
  const tutorialSkipBtn = document.getElementById('tutorial-skip');

  bindPress(tutorialPrevBtn, () => {
    if (window.ui) {
      window.ui.prevTutorialStep();
    }
  });

  bindPress(tutorialNextBtn, () => {
    if (window.ui) {
      window.ui.nextTutorialStep();
    }
  });

  bindPress(tutorialSkipBtn, () => {
    if (window.game) {
      window.game.skipTutorial();
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
      window.game.setState(window.GameState.SHOW_SCORE);
    }
  });

  bindPress(leadSubmitBtn, async () => {
    if (!window.game || !window.ui) return;
    if (leadSubmitInFlight) return;

    const data = window.ui.getLeadFormData();
    if (!data.name || !data.company || !isValidEmail(data.email)) {
      window.ui.showLeadFormError('Please enter name, valid email, and company.');
      return;
    }

    leadSubmitInFlight = true;
    try {
      window.game.playerName = data.name;
      window.game.playerEmail = data.email.toLowerCase();
      window.game.playerCompany = data.company;
      window.game.newsletterOptIn = !!data.consent;

      const playerData = window.game.buildPlayerData();
      const placement = window.game.getPlayerPlacement(playerData);
      const playerSummary = {
        playerData,
        placement,
        pendingSync: true
      };
      const localLeaderboard = window.game.getLocalLeaderboard(10);
      window.ui.showLeaderboard(localLeaderboard, data.name, playerSummary);
      window.game.setState(window.GameState.SHOW_LEADERBOARD);
      window.game.startLeaderboardCountdown();
      window.game.handleUserAction();

      const saveTask = window.game.saveScoreInBackground(playerData);
      let displayedLeaderboard = localLeaderboard;
      const remoteLeaderboard = await window.game.getRemoteLeaderboard(10);
      if (remoteLeaderboard && remoteLeaderboard.length > 0) {
        displayedLeaderboard = remoteLeaderboard;
        window.ui.showLeaderboard(remoteLeaderboard, data.name, playerSummary);
      }
      await saveTask;
      playerSummary.pendingSync = window.game.isScorePending(playerData.scoreId);
      window.ui.showLeaderboard(displayedLeaderboard, data.name, playerSummary);
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

  document.addEventListener('click', (event) => {
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
