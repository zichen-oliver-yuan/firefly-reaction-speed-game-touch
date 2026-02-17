/** Main application entry point (touch display mode). */

document.addEventListener('DOMContentLoaded', () => {
  window.ui = new UIController();
  window.game = new Game();

  setupEventHandlers();

  const nameInput = document.getElementById('name-input');
  const keyboardContainer = document.getElementById('touch-keyboard');
  if (nameInput && keyboardContainer) {
    window.touchKeyboard = new TouchKeyboard(nameInput);
    window.touchKeyboard.init(keyboardContainer);
  }

  window.game.init();
});

function setupEventHandlers() {
  const demoStartBtn = document.getElementById('demo-start-btn');
  if (demoStartBtn) {
    demoStartBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.resetGame();
        window.game.setState(window.GameState.WELCOME);
      }
    });
  }

  const tutorialYesBtn = document.getElementById('tutorial-yes');
  const tutorialNoBtn = document.getElementById('tutorial-no');

  if (tutorialYesBtn) {
    tutorialYesBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.setState(window.GameState.TUTORIAL);
      }
    });
  }

  if (tutorialNoBtn) {
    tutorialNoBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.skipTutorial();
      }
    });
  }

  const tutorialPrevBtn = document.getElementById('tutorial-prev');
  const tutorialNextBtn = document.getElementById('tutorial-next');
  const tutorialSkipBtn = document.getElementById('tutorial-skip');

  if (tutorialPrevBtn) {
    tutorialPrevBtn.addEventListener('click', () => {
      if (window.ui) {
        window.ui.prevTutorialStep();
      }
    });
  }

  if (tutorialNextBtn) {
    tutorialNextBtn.addEventListener('click', () => {
      if (window.ui) {
        window.ui.nextTutorialStep();
      }
    });
  }

  if (tutorialSkipBtn) {
    tutorialSkipBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.skipTutorial();
      }
    });
  }

  const scorePlayAgainBtn = document.getElementById('score-play-again-btn');
  const scoreDoneBtn = document.getElementById('score-done-btn');

  if (scorePlayAgainBtn) {
    scorePlayAgainBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.playAgain();
      }
    });
  }

  if (scoreDoneBtn) {
    scoreDoneBtn.addEventListener('click', async () => {
      if (!window.game || !window.ui) return;
      const leaderboard = await window.game.getLeaderboard();
      window.ui.showLeaderboard(leaderboard, window.game.playerName || 'Unknown');
      window.game.setState(window.GameState.SHOW_LEADERBOARD);
      window.game.startLeaderboardCountdown();
    });
  }

  const playAgainBtn = document.getElementById('play-again-btn');
  const enterNameBtn = document.getElementById('enter-name-btn');
  const leaderboardDoneBtn = document.getElementById('leaderboard-done-btn');

  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.playAgain();
      }
    });
  }

  if (enterNameBtn) {
    enterNameBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.setState(window.GameState.NAME_ENTRY);
      }
    });
  }

  if (leaderboardDoneBtn) {
    leaderboardDoneBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.clearIdleTimer();
        window.game.clearIdleWarning();
        window.game.setState(window.GameState.DEMO);
      }
    });
  }

  const modifyNameBtn = document.getElementById('modify-name-btn');
  if (modifyNameBtn) {
    modifyNameBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.setState(window.GameState.NAME_ENTRY);
      }
    });
  }

  const confirmNameBtn = document.getElementById('confirm-name-btn');
  const cancelNameBtn = document.getElementById('cancel-name-btn');

  if (confirmNameBtn) {
    confirmNameBtn.addEventListener('click', async () => {
      if (!window.game || !window.ui) return;
      const name = window.ui.getNameInput();
      if (!name) return;

      window.game.playerName = name;
      await window.game.saveScore();
      const leaderboard = await window.game.getLeaderboard();
      window.ui.showLeaderboard(leaderboard, name);
      window.game.setState(window.GameState.SHOW_LEADERBOARD);
      window.game.startLeaderboardCountdown();
      window.game.handleUserAction();
    });
  }

  if (cancelNameBtn) {
    cancelNameBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.setState(window.GameState.SHOW_LEADERBOARD);
      }
    });
  }

  const resumeBtn = document.getElementById('resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      if (window.game) {
        window.game.resumeFromIdle();
      }
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.game-button');
    if (button && window.game) {
      const index = Number(button.dataset.index);
      if (Number.isInteger(index)) {
        window.game.handleGridButtonPress(index);
      }
    }

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
