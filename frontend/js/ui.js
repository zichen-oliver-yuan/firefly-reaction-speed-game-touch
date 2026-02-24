/** UI controller for touch-first gameplay. */

class UIController {
  constructor() {
    this.currentScreen = null;
    this.tutorialStep = 0;
    this.demoRotationInterval = null;
    this.demoRotationIndex = 0;
    this.demoRotationMs = 4500;
    this.demoSlides = [];
    this.tutorialSteps = [
      {
        title: 'How this works',
        content: 'This is Whac-A-Mole with buttons.<br><br>Buttons light up at random for a short time.<br><br>Hit the lit button before it goes dark.',
        mediaLabel: 'Animation / video placeholder'
      },
      {
        title: 'Scoring',
        content: 'Each lit button you hit earns points.<br><br>Faster hits give a speed bonus.<br><br>Misses and wrong taps cost points.',
        mediaLabel: 'Animation / video placeholder'
      }
    ];
  }

  updateState(state) {
    this.hideAllScreens();
    if (state !== 'demo') {
      this.stopDemoRotation();
    }

    switch (state) {
      case 'demo':
        this.showScreen('demo');
        this.clearLeadFormData();
        this.startDemoRotation();
        break;
      case 'welcome':
        this.showScreen('welcome');
        break;
      case 'tutorial':
        this.showScreen('tutorial');
        this.updateTutorialStep(0);
        break;
      case 'countdown':
        this.showScreen('countdown');
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
      case 'lead_form':
        this.showScreen('lead-form');
        this.clearLeadFormError();
        break;
      case 'show_leaderboard':
        this.showScreen('leaderboard');
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

  startDemoRotation() {
    this.stopDemoRotation();
    this.demoRotationIndex = 0;
    this.demoSlides = this.buildDemoSlides([], null);
    this.renderDemoSlide();

    this.loadDemoRotationData().then((data) => {
      if (this.currentScreen !== 'demo') return;
      this.demoSlides = this.buildDemoSlides(data.leaderboard, data.todayStats);
      this.renderDemoSlide();
    });

    this.demoRotationInterval = setInterval(() => {
      if (!this.demoSlides || this.demoSlides.length === 0) return;
      this.demoRotationIndex = (this.demoRotationIndex + 1) % this.demoSlides.length;
      this.renderDemoSlide();
    }, this.demoRotationMs);
  }

  stopDemoRotation() {
    if (this.demoRotationInterval) {
      clearInterval(this.demoRotationInterval);
      this.demoRotationInterval = null;
    }
  }

  async loadDemoRotationData() {
    let leaderboard = [];
    let todayStats = null;

    if (window.game) {
      if (typeof window.game.getLeaderboard === 'function') {
        leaderboard = await window.game.getLeaderboard();
      }
      if (typeof window.game.getTodayReactionStats === 'function') {
        todayStats = window.game.getTodayReactionStats();
      }
    }

    return { leaderboard: Array.isArray(leaderboard) ? leaderboard.slice(0, 10) : [], todayStats };
  }

  buildDemoSlides(leaderboard, todayStats) {
    return [
      {
        key: 'message',
        title: 'How fast can you react at moments that matter?',
        subtitle: 'Play this reaction game to find out'
      },
      {
        key: 'leaderboard',
        title: 'Top 10 Leaderboard',
        subtitle: 'Current top reaction game scores',
        leaderboard: Array.isArray(leaderboard) ? leaderboard.slice(0, 10) : []
      },
      {
        key: 'fastest',
        title: 'Fastest Reaction Today',
        subtitle: 'Best single reaction time from today',
        value: todayStats && typeof todayStats.fastestReaction === 'number'
          ? `${todayStats.fastestReaction.toFixed(3)}s`
          : 'No data yet',
        sampleCount: todayStats && typeof todayStats.totalSessions === 'number' ? todayStats.totalSessions : 0
      },
      {
        key: 'average',
        title: 'Average Reaction Today',
        subtitle: 'Average reaction time from today',
        value: todayStats && typeof todayStats.averageReaction === 'number'
          ? `${todayStats.averageReaction.toFixed(3)}s`
          : 'No data yet',
        sampleCount: todayStats && typeof todayStats.totalSessions === 'number' ? todayStats.totalSessions : 0
      }
    ];
  }

  renderDemoSlide() {
    if (!this.demoSlides || this.demoSlides.length === 0) return;

    const slide = this.demoSlides[this.demoRotationIndex % this.demoSlides.length];
    const titleEl = document.getElementById('demo-text');
    const subtitleEl = document.getElementById('demo-subtitle');
    const contentEl = document.getElementById('demo-rotator-content');
    if (!titleEl || !subtitleEl || !contentEl) return;

    titleEl.textContent = slide.title;
    subtitleEl.textContent = slide.subtitle;
    contentEl.innerHTML = '';

    contentEl.classList.remove('hidden');

    if (slide.key === 'message') {
      const placeholder = document.createElement('div');
      placeholder.className = 'demo-stat-caption';
      placeholder.textContent = 'Get ready to test your reflexes.';
      contentEl.appendChild(placeholder);
      return;
    }

    if (slide.key === 'leaderboard') {
      if (!slide.leaderboard || slide.leaderboard.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'demo-stat-caption';
        empty.textContent = 'No scores yet';
        contentEl.appendChild(empty);
        return;
      }

      const board = document.createElement('div');
      board.className = 'demo-mini-leaderboard';
      slide.leaderboard.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'demo-mini-row';
        const name = document.createElement('span');
        name.className = 'demo-mini-name';
        name.textContent = `#${entry.rank} ${entry.name || 'Unknown'}`;
        const score = document.createElement('span');
        score.textContent = String(entry.score || 0);
        row.appendChild(name);
        row.appendChild(score);
        board.appendChild(row);
      });
      contentEl.appendChild(board);
      return;
    }

    const value = document.createElement('div');
    value.className = 'demo-stat-value';
    value.textContent = slide.value;
    contentEl.appendChild(value);

    const caption = document.createElement('div');
    caption.className = 'demo-stat-caption';
    caption.textContent = slide.sampleCount > 0
      ? `${slide.sampleCount} session${slide.sampleCount > 1 ? 's' : ''} today`
      : 'Play to generate today stats';
    contentEl.appendChild(caption);
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

  emitPressEffect(buttonIndex) {
    const buttons = document.querySelectorAll('.game-button');
    const button = buttons[buttonIndex];
    if (!button) return;

    button.classList.remove('pressed');
    void button.offsetWidth;
    button.classList.add('pressed');

    setTimeout(() => {
      button.classList.remove('pressed');
    }, 430);
  }

  lightButton(buttonIndex) {
    const buttons = document.querySelectorAll('.game-button');
    buttons.forEach((btn) => btn.classList.remove('lit'));

    if (buttons[buttonIndex]) {
      buttons[buttonIndex].classList.add('lit');
    }
  }

  clearLitButton() {
    const buttons = document.querySelectorAll('.game-button');
    buttons.forEach((btn) => btn.classList.remove('lit'));
  }

  prepareGameScreen() {
    this.showScreen('game');
    const waitingEl = document.getElementById('waiting-message');
    const timeLane = document.getElementById('time-breakdown-anim');

    if (waitingEl) {
      waitingEl.textContent = 'Get ready...';
      waitingEl.classList.remove('judgement-fast', 'judgement-good', 'judgement-slow', 'judgement-bad');
    }
    if (timeLane) {
      timeLane.innerHTML = '';
    }

    this.clearLitButton();
  }

  updateTimeRemaining(seconds) {
    const timeEl = document.getElementById('time-left');
    if (timeEl) {
      timeEl.textContent = Math.max(0, seconds);
    }
  }

  updateGameStats(hits, misses, wrongWhacks) {
    const statsEl = document.getElementById('game-stats');
    if (statsEl) {
      statsEl.textContent = `Hits ${hits} | Misses ${misses} | Wrong ${wrongWhacks}`;
    }
  }

  showGameStatus(message, tone = '') {
    const waitingEl = document.getElementById('waiting-message');
    if (!waitingEl) return;
    waitingEl.textContent = message;
    waitingEl.classList.remove('judgement-fast', 'judgement-good', 'judgement-slow', 'judgement-bad');
    if (tone) {
      waitingEl.classList.add(`judgement-${tone}`);
    }
  }

  updateScore(score) {
    const scoreEl = document.getElementById('current-score');
    if (scoreEl) {
      scoreEl.textContent = score;
    }
  }

  animateScoreBreakdown(items = []) {
    const lane = document.getElementById('score-breakdown-anim');
    if (!lane) return;

    lane.innerHTML = '';
    items.forEach((item, index) => {
      const chip = document.createElement('div');
      chip.className = `score-chip ${item.type === 'bad' ? 'bad' : 'good'}`;
      const sign = item.value > 0 ? '+' : '';
      chip.textContent = `${item.label}: ${sign}${item.value}`;
      lane.appendChild(chip);

      const appearDelay = index * 140;
      setTimeout(() => chip.classList.add('show'), appearDelay);
      setTimeout(() => {
        chip.classList.remove('show');
        setTimeout(() => chip.remove(), 180);
      }, 2200 + appearDelay);
    });
  }

  animateTimeBreakdown(items = []) {
    const lane = document.getElementById('time-breakdown-anim');
    if (!lane) return;

    lane.innerHTML = '';
    items.forEach((item, index) => {
      const chip = document.createElement('div');
      chip.className = `score-chip ${item.type === 'bad' ? 'bad' : 'good'}`;
      const sign = item.value > 0 ? '+' : '';
      chip.textContent = `${item.label}: ${sign}${item.value.toFixed(2)}s`;
      lane.appendChild(chip);

      const appearDelay = index * 120;
      setTimeout(() => chip.classList.add('show'), appearDelay);
      setTimeout(() => {
        chip.classList.remove('show');
        setTimeout(() => chip.remove(), 180);
      }, 1900 + appearDelay);
    });
  }

  updatePreGameCountdown(seconds) {
    const countdownEl = document.getElementById('pre-game-countdown-value');
    if (countdownEl) {
      countdownEl.textContent = Math.max(0, seconds);
    }
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
    this.tutorialStep = Math.max(0, Math.min(step, this.tutorialSteps.length - 1));
    const stepEl = document.getElementById('tutorial-step');
    if (!stepEl) return;

    const stepData = this.tutorialSteps[this.tutorialStep];
    stepEl.innerHTML = `
      <h2>${stepData.title}</h2>
      <p>${stepData.content}</p>
      <div class="tutorial-media-placeholder">${stepData.mediaLabel || 'Animation / video placeholder'}</div>
    `;

    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');
    const skipBtn = document.getElementById('tutorial-skip');

    if (prevBtn) {
      prevBtn.style.display = this.tutorialStep > 0 ? 'inline-block' : 'none';
    }

    if (nextBtn) {
      nextBtn.style.display = 'inline-block';
      nextBtn.textContent = this.tutorialStep === this.tutorialSteps.length - 1 ? 'Ready' : 'next ↓';
    }

    if (skipBtn) {
      skipBtn.style.display = this.tutorialStep < this.tutorialSteps.length - 1 ? 'inline-block' : 'none';
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

  showLeaderboard(leaderboard, playerName = 'Unknown', playerSummary = null) {
    const listEl = document.getElementById('leaderboard-list');
    const nameDisplayEl = document.getElementById('display-player-name');
    const playerStatsEl = document.getElementById('leaderboard-player-stats');

    if (!listEl) return;
    if (nameDisplayEl) {
      nameDisplayEl.textContent = playerName;
    }
    if (playerStatsEl) {
      const hasPlacement = playerSummary && playerSummary.placement;
      if (hasPlacement) {
        const placement = playerSummary.placement;
        const syncText = playerSummary.pendingSync ? 'Sync pending' : 'Synced';
        playerStatsEl.textContent = `Rank #${placement.rank} of ${placement.totalPlayers} | Top ${placement.topPercent}% | Faster than ${placement.fasterThanCount} players | ${syncText}`;
        playerStatsEl.classList.remove('hidden');
      } else {
        playerStatsEl.classList.add('hidden');
      }
    }

    listEl.innerHTML = '';

    if (!leaderboard || leaderboard.length === 0) {
      listEl.innerHTML = '<div style="padding: 2rem; color: #666;">No scores yet</div>';
    } else {
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

    if (playerSummary && playerSummary.playerData) {
      const yourRow = document.createElement('div');
      yourRow.className = `leaderboard-entry your-score${playerSummary.pendingSync ? ' pending-sync' : ''}`;
      const placementText = playerSummary.placement
        ? `#${playerSummary.placement.rank}`
        : '-';
      yourRow.innerHTML = `
        <div>
          <span class="leaderboard-rank">${placementText}</span>
          <span>${playerName || 'Unknown'}</span>
        </div>
        <div>${playerSummary.playerData.totalScore || 0}</div>
      `;
      listEl.appendChild(yourRow);
    }
  }

  updateCountdown(seconds) {
    const countdownEl = document.getElementById('countdown-value');
    if (countdownEl) {
      countdownEl.textContent = seconds;
    }
  }

  getLeadFormData() {
    const nameInput = document.getElementById('lead-name-input');
    const emailInput = document.getElementById('lead-email-input');
    const companyInput = document.getElementById('lead-company-input');
    const consentInput = document.getElementById('lead-consent-input');
    return {
      name: nameInput ? nameInput.value.trim() : '',
      email: emailInput ? emailInput.value.trim() : '',
      company: companyInput ? companyInput.value.trim() : '',
      consent: consentInput ? consentInput.checked : false
    };
  }

  clearLeadFormData() {
    const nameInput = document.getElementById('lead-name-input');
    const emailInput = document.getElementById('lead-email-input');
    const companyInput = document.getElementById('lead-company-input');
    const consentInput = document.getElementById('lead-consent-input');
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (companyInput) companyInput.value = '';
    if (consentInput) consentInput.checked = false;
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

  hideEnterNameButton() {
    // Backward-compatible no-op.
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}
