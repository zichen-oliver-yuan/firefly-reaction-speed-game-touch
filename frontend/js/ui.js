/** UI controller for touch-first gameplay. */

class UIController {
  constructor() {
    this.currentScreen = null;
    this.tutorialStep = 0;
    this.tutorialSteps = [
      {
        title: 'How this works',
        content: 'Find out your reaction speed with this mini game.'
      },
      {
        title: 'Game mechanics',
        content: 'After a random delay, one button lights up. Tap it as fast as you can.'
      },
      {
        title: 'Scoring',
        content: 'Faster reactions and streaks give higher scores.'
      }
    ];
  }

  updateState(state) {
    this.hideAllScreens();

    switch (state) {
      case 'demo':
        this.showScreen('demo');
        break;
      case 'welcome':
        this.showScreen('welcome');
        break;
      case 'tutorial':
        this.showScreen('tutorial');
        this.updateTutorialStep(0);
        break;
      case 'game_start':
      case 'game_play':
        this.showScreen('game');
        this.initializeButtonGrid();
        break;
      case 'game_end':
      case 'show_score':
        this.showScreen('score');
        break;
      case 'show_leaderboard':
        this.showScreen('leaderboard');
        break;
      case 'name_entry':
        this.showScreen('name-entry');
        break;
      case 'idle_warning':
        this.showScreen('idle-warning');
        break;
      default:
        this.showScreen('demo');
    }
  }

  hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach((screen) => {
      screen.classList.add('hidden');
    });
  }

  showScreen(screenId) {
    this.hideAllScreens();
    const screen = document.getElementById(`screen-${screenId}`);
    if (screen) {
      screen.classList.remove('hidden');
      this.currentScreen = screenId;
    }
  }

  initializeButtonGrid() {
    const grid = document.getElementById('button-grid');
    if (!grid) return;

    if (grid.children.length === 25) {
      return;
    }

    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
      const button = document.createElement('div');
      button.className = 'game-button';
      button.dataset.index = i;
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', `Button ${i + 1}`);
      grid.appendChild(button);
    }
  }

  lightButton(buttonIndex) {
    const buttons = document.querySelectorAll('.game-button');
    buttons.forEach((btn) => {
      btn.classList.remove('lit', 'clickable');
      btn.style.background = '#e0e0e0';
    });

    if (buttons[buttonIndex]) {
      buttons[buttonIndex].classList.add('lit', 'clickable');
      buttons[buttonIndex].style.background = '#fff';
    }
  }

  clearLitButton() {
    const buttons = document.querySelectorAll('.game-button');
    buttons.forEach((btn) => {
      btn.classList.remove('lit', 'clickable');
      btn.style.background = '#e0e0e0';
    });
  }

  showWaitingScreen(currentRound, totalRounds) {
    this.showScreen('game');

    const roundEl = document.getElementById('current-round');
    const totalEl = document.getElementById('total-rounds');
    const waitingEl = document.getElementById('waiting-message');

    if (roundEl) roundEl.textContent = currentRound;
    if (totalEl) totalEl.textContent = totalRounds;
    if (waitingEl) {
      waitingEl.textContent = 'Wait for the button...';
      waitingEl.style.display = 'block';
    }

    this.clearLitButton();
  }

  showRoundSuccess(currentRound, totalRounds, totalScore, reactionTime, scoreBreakdown, feedback) {
    const scoreEl = document.getElementById('current-score');
    if (scoreEl) scoreEl.textContent = totalScore;

    this.showScreen('feedback');

    const roundEl = document.getElementById('feedback-round');
    const totalEl = document.getElementById('feedback-total');
    const scoreValueEl = document.getElementById('feedback-score-value');
    const reactionScoreEl = document.getElementById('reaction-score');
    const comboScoreEl = document.getElementById('combo-score');
    const reactionTimeEl = document.getElementById('reaction-time-value');
    const messageEl = document.getElementById('feedback-message');

    if (roundEl) roundEl.textContent = currentRound;
    if (totalEl) totalEl.textContent = totalRounds;
    if (scoreValueEl) scoreValueEl.textContent = totalScore;
    if (reactionScoreEl) reactionScoreEl.textContent = `+${scoreBreakdown.reaction}`;
    if (comboScoreEl) comboScoreEl.textContent = `+${scoreBreakdown.combo}`;
    if (reactionTimeEl) reactionTimeEl.textContent = reactionTime.toFixed(3);
    if (messageEl) messageEl.textContent = feedback;

    const successEl = document.getElementById('feedback-success');
    const timeoutEl = document.getElementById('feedback-timeout');
    if (successEl) successEl.classList.remove('hidden');
    if (timeoutEl) timeoutEl.classList.add('hidden');
  }

  showWrongButton() {
    const waitingEl = document.getElementById('waiting-message');
    if (waitingEl) {
      waitingEl.textContent = 'Wrong button - try the lit one';
      setTimeout(() => {
        waitingEl.textContent = 'Wait for the button...';
      }, 600);
    }
  }

  showRoundTimeout(currentRound, totalRounds) {
    this.showScreen('feedback');

    const roundEl = document.getElementById('feedback-round');
    const totalEl = document.getElementById('feedback-total');
    const timeoutEl = document.getElementById('feedback-timeout');
    const successEl = document.getElementById('feedback-success');

    if (roundEl) roundEl.textContent = currentRound;
    if (totalEl) totalEl.textContent = totalRounds;
    if (timeoutEl) timeoutEl.classList.remove('hidden');
    if (successEl) successEl.classList.add('hidden');
  }

  showGameEnd(totalScore, avgReaction, bestReaction) {
    this.showScreen('score');

    const finalScoreEl = document.getElementById('final-score');
    const avgEl = document.getElementById('avg-reaction');
    const bestEl = document.getElementById('best-reaction');

    if (finalScoreEl) finalScoreEl.textContent = totalScore;
    if (avgEl) avgEl.textContent = avgReaction.toFixed(3);
    if (bestEl) bestEl.textContent = bestReaction.toFixed(3);
  }

  updateTutorialStep(step) {
    this.tutorialStep = step;
    const stepEl = document.getElementById('tutorial-step');
    if (!stepEl) return;

    if (step < this.tutorialSteps.length) {
      const stepData = this.tutorialSteps[step];
      stepEl.innerHTML = `<h2>${stepData.title}</h2><p>${stepData.content}</p>`;
    }

    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');

    if (prevBtn) {
      prevBtn.style.display = step > 0 ? 'inline-block' : 'none';
    }
    if (nextBtn) {
      nextBtn.style.display = step < this.tutorialSteps.length - 1 ? 'inline-block' : 'inline-block';
      nextBtn.textContent = step === this.tutorialSteps.length - 1 ? 'finish ↓' : 'next ↓';
    }
  }

  nextTutorialStep() {
    if (this.tutorialStep < this.tutorialSteps.length - 1) {
      this.updateTutorialStep(this.tutorialStep + 1);
    } else if (window.game) {
      window.game.finishTutorial();
    }
  }

  prevTutorialStep() {
    if (this.tutorialStep > 0) {
      this.updateTutorialStep(this.tutorialStep - 1);
    }
  }

  showLeaderboard(leaderboard, playerName = 'Unknown') {
    const listEl = document.getElementById('leaderboard-list');
    const nameDisplayEl = document.getElementById('display-player-name');

    if (!listEl) return;
    if (nameDisplayEl) {
      nameDisplayEl.textContent = playerName;
    }

    listEl.innerHTML = '';

    if (!leaderboard || leaderboard.length === 0) {
      listEl.innerHTML = '<div style="padding: 2rem; color: #666;">No scores yet</div>';
      return;
    }

    leaderboard.forEach((entry) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'leaderboard-entry';
      entryEl.innerHTML = `
        <div>
          <span class="leaderboard-rank">#${entry.rank}</span>
          <span>${entry.name}</span>
        </div>
        <div>${entry.score}</div>
      `;
      listEl.appendChild(entryEl);
    });
  }

  updateCountdown(seconds) {
    const countdownEl = document.getElementById('countdown-value');
    if (countdownEl) {
      countdownEl.textContent = seconds;
    }
  }

  hideEnterNameButton() {
    const enterNameBtn = document.getElementById('enter-name-btn');
    if (enterNameBtn) {
      enterNameBtn.style.display = 'none';
    }
  }

  showEnterNameButton() {
    const enterNameBtn = document.getElementById('enter-name-btn');
    if (enterNameBtn) {
      enterNameBtn.style.display = 'inline-block';
    }
  }

  getNameInput() {
    const inputEl = document.getElementById('name-input');
    return inputEl ? inputEl.value.trim() : '';
  }

  showIdleWarning() {
    this.showScreen('idle-warning');
  }

  hideIdleWarning() {
    const screen = document.getElementById('screen-idle-warning');
    if (screen) {
      screen.classList.add('hidden');
    }
  }

  updateIdleCountdown(seconds) {
    const countdownEl = document.getElementById('idle-countdown-value');
    if (countdownEl) {
      countdownEl.textContent = seconds;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}
