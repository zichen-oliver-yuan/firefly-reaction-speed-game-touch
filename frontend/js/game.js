/** Touch-first game state machine and gameplay logic. */

window.GameState = {
  DEMO: 'demo',
  WELCOME: 'welcome',
  TUTORIAL: 'tutorial',
  GAME_START: 'game_start',
  GAME_PLAY: 'game_play',
  GAME_END: 'game_end',
  SHOW_SCORE: 'show_score',
  SHOW_LEADERBOARD: 'show_leaderboard',
  NAME_ENTRY: 'name_entry',
  IDLE_WARNING: 'idle_warning'
};

class Game {
  constructor() {
    this.state = window.GameState.DEMO;
    this.rounds = CONFIG.game.rounds;
    this.currentRound = 0;
    this.score = 0;
    this.comboCount = 0;
    this.reactionTimes = [];
    this.currentReactionStart = null;
    this.waitingForButton = false;
    this.targetButtonIndex = null;
    this.reactionTimeout = null;

    this.playerName = '';
    this.playerId = null;

    this.idleTimer = null;
    this.countdownInterval = null;
    this.idleWarningTimer = null;
    this.idleCountdownInterval = null;
    this.lastUserAction = Date.now();

    this.scoring = new ScoringSystem();
    this.sheets = new SheetsClient();
    this.localStorage = new LocalStorageBackup();

    this.handleUserAction = this.handleUserAction.bind(this);
  }

  async init() {
    this.sheets.init().catch(() => {
      console.log('Google Sheets API unavailable; continuing with local leaderboard.');
    });

    this.setState(window.GameState.DEMO);
  }

  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.onStateEnter(newState, oldState);

    if (window.ui) {
      window.ui.updateState(newState);
    }
  }

  onStateEnter(newState) {
    this.clearIdleTimer();
    this.clearIdleWarning();

    if (newState !== window.GameState.DEMO) {
      this.lastUserAction = Date.now();
    }

    if (newState === window.GameState.GAME_START) {
      this.startGame();
    }

    if (newState === window.GameState.GAME_END) {
      this.endGame();
    }

    if (newState === window.GameState.NAME_ENTRY || newState === window.GameState.SHOW_LEADERBOARD) {
      this.startIdleDetection();
    }
  }

  resetGame() {
    this.currentRound = 0;
    this.score = 0;
    this.comboCount = 0;
    this.reactionTimes = [];
    this.playerId = null;
    this.clearReactionTimeout();
    this.waitingForButton = false;
    this.targetButtonIndex = null;
    this.currentReactionStart = null;
  }

  startGame() {
    this.resetGame();
    this.currentRound = 1;
    this.setState(window.GameState.GAME_PLAY);
    if (window.ui) {
      window.ui.showWaitingScreen(this.currentRound, this.rounds);
    }
    this.startRound();
  }

  startRound() {
    this.waitingForButton = true;
    const waitTime = CONFIG.game.minWaitTime +
      Math.random() * (CONFIG.game.maxWaitTime - CONFIG.game.minWaitTime);

    setTimeout(() => {
      if (this.waitingForButton && this.state === window.GameState.GAME_PLAY) {
        this.lightRandomButton();
      }
    }, waitTime * 1000);
  }

  lightRandomButton() {
    this.targetButtonIndex = Math.floor(Math.random() * 25);
    this.currentReactionStart = performance.now();

    if (window.ui) {
      window.ui.lightButton(this.targetButtonIndex);
    }

    this.clearReactionTimeout();
    this.reactionTimeout = setTimeout(() => {
      this.handleTimeout();
    }, CONFIG.game.maxReactionTime * 1000);
  }

  clearReactionTimeout() {
    if (this.reactionTimeout) {
      clearTimeout(this.reactionTimeout);
      this.reactionTimeout = null;
    }
  }

  handleGridButtonPress(buttonIndex) {
    this.lastUserAction = Date.now();

    if (this.state !== window.GameState.GAME_PLAY) {
      return;
    }

    if (this.waitingForButton && buttonIndex === this.targetButtonIndex) {
      this.handleCorrectPress();
    } else if (this.waitingForButton) {
      this.handleWrongPress();
    }
  }

  handleCorrectPress() {
    if (!this.currentReactionStart) {
      return;
    }

    this.clearReactionTimeout();

    if (window.ui) {
      window.ui.clearLitButton();
    }

    const reactionTime = (performance.now() - this.currentReactionStart) / 1000;
    this.reactionTimes.push(reactionTime);

    const scoreBreakdown = this.scoring.calculateScore(reactionTime, this.comboCount);
    this.score += scoreBreakdown.total;

    if (this.scoring.qualifiesForCombo(reactionTime)) {
      this.comboCount++;
    } else {
      this.comboCount = 0;
    }

    const feedback = this.scoring.getFeedback(reactionTime);

    if (window.ui) {
      window.ui.showRoundSuccess(
        this.currentRound,
        this.rounds,
        this.score,
        reactionTime,
        scoreBreakdown,
        feedback,
        this.comboCount
      );
    }

    this.waitingForButton = false;
    this.targetButtonIndex = null;
    this.currentReactionStart = null;

    this.advanceRoundOrFinish();
  }

  handleWrongPress() {
    this.comboCount = 0;
    if (window.ui) {
      window.ui.showWrongButton();
    }
  }

  handleTimeout() {
    if (!this.waitingForButton || this.targetButtonIndex === null) {
      return;
    }

    this.clearReactionTimeout();

    if (window.ui) {
      window.ui.clearLitButton();
      window.ui.showRoundTimeout(this.currentRound, this.rounds);
    }

    this.reactionTimes.push(CONFIG.game.maxReactionTime);
    this.comboCount = 0;
    this.waitingForButton = false;
    this.targetButtonIndex = null;
    this.currentReactionStart = null;

    this.advanceRoundOrFinish();
  }

  advanceRoundOrFinish() {
    if (this.state !== window.GameState.GAME_PLAY) {
      return;
    }

    this.currentRound++;

    if (this.currentRound > this.rounds) {
      this.setState(window.GameState.GAME_END);
      return;
    }

    if (window.ui) {
      window.ui.showWaitingScreen(this.currentRound, this.rounds);
    }

    this.startRound();
  }

  async endGame() {
    this.waitingForButton = false;
    this.targetButtonIndex = null;
    this.clearReactionTimeout();

    const avgReaction = this.reactionTimes.length > 0
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : 0;
    const bestReaction = this.reactionTimes.length > 0
      ? Math.min(...this.reactionTimes)
      : 0;

    if (window.ui) {
      window.ui.showGameEnd(this.score, avgReaction, bestReaction);
    }

    setTimeout(async () => {
      this.setState(window.GameState.SHOW_SCORE);
      setTimeout(async () => {
        await this.saveScore();
        const leaderboard = await this.getLeaderboard();
        if (window.ui) {
          window.ui.showLeaderboard(leaderboard, this.playerName || 'Unknown');
        }
        this.setState(window.GameState.SHOW_LEADERBOARD);
        this.startLeaderboardCountdown();
      }, 2500);
    }, 1500);
  }

  async saveScore() {
    try {
      const avgReaction = this.reactionTimes.length > 0
        ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
        : 0;
      const bestReaction = this.reactionTimes.length > 0
        ? Math.min(...this.reactionTimes)
        : 0;

      const playerData = {
        name: this.playerName || 'Unknown',
        id: this.playerId || '',
        totalScore: this.score,
        averageReactionTime: avgReaction,
        bestReactionTime: bestReaction,
        reactionTimes: this.reactionTimes,
        rounds: this.rounds,
        timestamp: new Date().toISOString()
      };

      await Promise.allSettled([
        this.sheets.savePlayerScore(playerData),
        this.localStorage.savePlayerScore(playerData)
      ]);

      if (window.ui) {
        window.ui.hideEnterNameButton();
      }
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  }

  async getLeaderboard() {
    try {
      const sheetsLeaderboard = await this.sheets.getLeaderboard(10);
      if (sheetsLeaderboard && sheetsLeaderboard.length > 0) {
        return sheetsLeaderboard;
      }
      return this.localStorage.getLeaderboard(10);
    } catch (error) {
      console.error('Failed to get leaderboard from Sheets, using local storage:', error);
      return this.localStorage.getLeaderboard(10);
    }
  }

  playAgain() {
    this.clearIdleTimer();
    this.clearIdleWarning();
    if (window.ui) {
      window.ui.showEnterNameButton();
    }
    this.setState(window.GameState.GAME_START);
  }

  skipTutorial() {
    this.setState(window.GameState.GAME_START);
  }

  finishTutorial() {
    this.setState(window.GameState.GAME_START);
  }

  startLeaderboardCountdown() {
    if (!CONFIG.game.leaderboardCountdownEnabled) {
      const countdownEl = document.getElementById('leaderboard-countdown');
      if (countdownEl) {
        countdownEl.style.display = 'none';
      }
      return;
    }

    const countdownEl = document.getElementById('leaderboard-countdown');
    if (countdownEl) {
      countdownEl.style.display = '';
    }

    this.clearIdleTimer();
    let countdown = CONFIG.game.leaderboardCountdownSeconds;

    if (window.ui) {
      window.ui.updateCountdown(countdown);
    }

    this.countdownInterval = setInterval(() => {
      countdown--;
      if (window.ui) {
        window.ui.updateCountdown(countdown);
      }

      if (countdown <= 0) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.setState(window.GameState.DEMO);
      }
    }, 1000);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  handleUserAction() {
    this.lastUserAction = Date.now();
    this.clearIdleWarning();

    if (this.state === window.GameState.NAME_ENTRY) {
      this.startIdleTimer();
    }
  }

  startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.setState(window.GameState.DEMO);
    }, CONFIG.game.idleTimeout);
  }

  startIdleDetection() {
    this.clearIdleWarning();

    if (this.state === window.GameState.DEMO) {
      return;
    }

    if (this.idleWarningTimer) {
      clearInterval(this.idleWarningTimer);
    }

    this.idleWarningTimer = setInterval(() => {
      if (this.state === window.GameState.DEMO) {
        clearInterval(this.idleWarningTimer);
        this.idleWarningTimer = null;
        return;
      }

      const timeSinceLastAction = (Date.now() - this.lastUserAction) / 1000;
      if (timeSinceLastAction >= CONFIG.game.idleWarningThresholdSeconds) {
        clearInterval(this.idleWarningTimer);
        this.idleWarningTimer = null;
        this.showIdleWarning();
      }
    }, 1000);
  }

  showIdleWarning() {
    if (this.state === window.GameState.DEMO) {
      return;
    }

    this.clearIdleWarning();
    if (window.ui) {
      window.ui.showIdleWarning();
    }

    let countdown = CONFIG.game.idleWarningCountdownSeconds;
    if (window.ui) {
      window.ui.updateIdleCountdown(countdown);
    }

    this.idleCountdownInterval = setInterval(() => {
      countdown--;
      if (window.ui) {
        window.ui.updateIdleCountdown(countdown);
      }
      if (countdown <= 0) {
        this.clearIdleWarning();
        this.setState(window.GameState.DEMO);
      }
    }, 1000);
  }

  clearIdleWarning() {
    if (this.idleWarningTimer) {
      clearInterval(this.idleWarningTimer);
      this.idleWarningTimer = null;
    }
    if (this.idleCountdownInterval) {
      clearInterval(this.idleCountdownInterval);
      this.idleCountdownInterval = null;
    }
    if (window.ui) {
      window.ui.hideIdleWarning();
    }
  }

  resumeFromIdle() {
    this.clearIdleWarning();
    this.lastUserAction = Date.now();
    this.startIdleDetection();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game, GameState };
}
