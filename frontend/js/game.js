/** Touch-first game state machine and gameplay logic. */

window.GameState = {
  DEMO: 'demo',
  WELCOME: 'welcome',
  TUTORIAL: 'tutorial',
  PRE_GAME_COUNTDOWN: 'countdown',
  GAME_START: 'game_start',
  GAME_PLAY: 'game_play',
  GAME_END: 'game_end',
  SHOW_SCORE: 'show_score',
  LEAD_FORM: 'lead_form',
  SHOW_LEADERBOARD: 'show_leaderboard',
  IDLE_WARNING: 'idle_warning'
};

class Game {
  constructor() {
    this.state = window.GameState.DEMO;
    this.score = 0;
    this.reactionTimes = [];
    this.currentReactionStart = null;
    this.activeMoleIndex = null;
    this.moleVisibleTimeout = null;
    this.moleSpawnTimeout = null;
    this.sessionCountdownInterval = null;
    this.sessionDurationSeconds = CONFIG.game.sessionDurationSeconds || 30;
    this.maxSessionSeconds = CONFIG.game.maxSessionSeconds || 45;
    this.timeRemainingMs = this.sessionDurationSeconds * 1000;
    this.sessionStartTs = null;
    this.lastCountdownTs = null;
    this.pendingSpawnDelayMs = 0;
    this.hits = 0;
    this.misses = 0;
    this.wrongWhacks = 0;
    this.molesSpawned = 0;
    this.preGameCountdownInterval = null;
    this.missPenalty = CONFIG.game.missPenalty || 120;
    this.wrongPressPenalty = CONFIG.game.wrongPressPenalty || 150;
    this.gridPressCooldownMs = CONFIG.game.gridPressCooldownMs || 120;
    this.lastGridPressTs = 0;
    this.timeBonusFastMs = Math.round((CONFIG.game.timeBonusFastSec || 1.2) * 1000);
    this.timeBonusGoodMs = Math.round((CONFIG.game.timeBonusGoodSec || 0.7) * 1000);
    this.timeBonusSlowMs = Math.round((CONFIG.game.timeBonusSlowSec || 0.25) * 1000);
    this.timePenaltyWrongMs = Math.round((CONFIG.game.timePenaltyWrongSec || 0.8) * 1000);
    this.timePenaltyMissMs = Math.round((CONFIG.game.timePenaltyMissSec || 1.1) * 1000);
    this.fastHitThresholdSec = CONFIG.game.fastHitThresholdSec || 0.22;
    this.goodHitThresholdSec = CONFIG.game.goodHitThresholdSec || 0.45;

    this.playerName = '';
    this.playerEmail = '';
    this.playerCompany = '';
    this.newsletterOptIn = false;
    this.playerId = null;
    this.currentScoreId = null;

    this.idleTimer = null;
    this.countdownInterval = null;
    this.idleWarningTimer = null;
    this.idleCountdownInterval = null;
    this.lastUserAction = Date.now();

    this.scoring = new ScoringSystem();
    this.sheets = new SheetsClient();
    this.localStorage = new LocalStorageBackup();
    this.syncInterval = null;
    this.syncInFlight = false;
    this.syncIntervalMs = (CONFIG.googleSheets && CONFIG.googleSheets.syncIntervalMs) || 15000;

    this.handleUserAction = this.handleUserAction.bind(this);
    this.handleOnline = this.handleOnline.bind(this);
  }

  async init() {
    this.sheets.init().catch(() => {
      console.log('Apps Script endpoint unavailable; continuing with local leaderboard.');
    });
    this.startSyncWorker();

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
    if (newState !== window.GameState.GAME_PLAY) {
      this.clearGameplayTimers();
      if (window.ui) {
        window.ui.clearLitButton();
      }
    }

    if (newState !== window.GameState.DEMO) {
      this.lastUserAction = Date.now();
    }

    if (newState === window.GameState.PRE_GAME_COUNTDOWN) {
      this.startPreGameCountdown();
    }

    if (newState === window.GameState.GAME_START) {
      this.startGame();
    }

    if (newState === window.GameState.GAME_END) {
      this.endGame();
    }

    if (newState === window.GameState.LEAD_FORM || newState === window.GameState.SHOW_LEADERBOARD) {
      this.startIdleDetection();
    }
  }

  startPreGameCountdown() {
    if (this.preGameCountdownInterval) {
      clearInterval(this.preGameCountdownInterval);
      this.preGameCountdownInterval = null;
    }

    let remaining = CONFIG.game.preGameCountdownSeconds || 5;
    if (window.ui) {
      window.ui.updatePreGameCountdown(remaining);
    }

    this.preGameCountdownInterval = setInterval(() => {
      remaining -= 1;
      if (window.ui) {
        window.ui.updatePreGameCountdown(remaining);
      }

      if (remaining <= 0) {
        clearInterval(this.preGameCountdownInterval);
        this.preGameCountdownInterval = null;
        this.setState(window.GameState.GAME_START);
      }
    }, 1000);
  }

  resetGame() {
    this.score = 0;
    this.reactionTimes = [];
    this.timeRemainingMs = this.sessionDurationSeconds * 1000;
    this.sessionStartTs = null;
    this.lastCountdownTs = null;
    this.pendingSpawnDelayMs = 0;
    this.hits = 0;
    this.misses = 0;
    this.wrongWhacks = 0;
    this.molesSpawned = 0;
    this.playerName = '';
    this.playerEmail = '';
    this.playerCompany = '';
    this.newsletterOptIn = false;
    this.playerId = null;
    this.currentScoreId = null;
    this.clearGameplayTimers();
    if (this.preGameCountdownInterval) {
      clearInterval(this.preGameCountdownInterval);
      this.preGameCountdownInterval = null;
    }
    this.activeMoleIndex = null;
    this.currentReactionStart = null;
  }

  startGame() {
    this.resetGame();
    this.sessionStartTs = performance.now();
    this.lastCountdownTs = this.sessionStartTs;
    this.setState(window.GameState.GAME_PLAY);
    if (window.ui) {
      window.ui.prepareGameScreen();
      window.ui.updateScore(this.score);
      window.ui.updateTimeRemaining(this.getDisplayTimeRemaining());
      window.ui.updateGameStats(this.hits, this.misses, this.wrongWhacks);
    }
    this.startSessionCountdown();
    this.scheduleNextMole();
  }

  randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  randomInt(min, max) {
    return Math.floor(this.randomBetween(min, max + 1));
  }

  getDebugSnapshot() {
    return {
      state: this.state,
      timeRemaining: this.getDisplayTimeRemaining(),
      timeRemainingMs: Math.round(this.timeRemainingMs),
      activeMoleIndex: this.activeMoleIndex,
      currentReactionStart: this.currentReactionStart,
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      wrongWhacks: this.wrongWhacks,
      molesSpawned: this.molesSpawned
    };
  }

  getDisplayTimeRemaining() {
    return Math.max(0, Math.ceil(this.timeRemainingMs / 1000));
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  lerp(start, end, progress) {
    return start + ((end - start) * progress);
  }

  getDifficultyProgress() {
    if (!this.sessionStartTs) return 0;
    const elapsedMs = performance.now() - this.sessionStartTs;
    const plannedDurationMs = this.sessionDurationSeconds * 1000;
    return this.clamp(elapsedMs / plannedDurationMs, 0, 1);
  }

  getCurrentSpawnGapMs() {
    const progress = this.getDifficultyProgress();
    const start = CONFIG.game.spawnGapStartMs || 900;
    const end = CONFIG.game.spawnGapEndMs || 180;
    return Math.round(this.lerp(start, end, progress));
  }

  getCurrentVisibleDurationMs() {
    const progress = this.getDifficultyProgress();
    const start = CONFIG.game.moleVisibleStartMs || 1800;
    const end = CONFIG.game.moleVisibleEndMs || 550;
    return Math.round(this.lerp(start, end, progress));
  }

  adjustTime(deltaMs, reason) {
    const beforeMs = this.timeRemainingMs;
    const maxMs = this.maxSessionSeconds * 1000;
    this.timeRemainingMs = this.clamp(this.timeRemainingMs + deltaMs, 0, maxMs);

    if (window.ui) {
      window.ui.updateTimeRemaining(this.getDisplayTimeRemaining());
    }

    console.log('[GAME][TIME_ADJUST]', {
      reason,
      deltaMs,
      beforeMs: Math.round(beforeMs),
      afterMs: Math.round(this.timeRemainingMs),
      beforeSeconds: Number((beforeMs / 1000).toFixed(3)),
      afterSeconds: Number((this.timeRemainingMs / 1000).toFixed(3)),
      maxSessionSeconds: this.maxSessionSeconds
    });

    if (this.timeRemainingMs <= 0 && this.state === window.GameState.GAME_PLAY) {
      this.finishSession();
      return true;
    }
    return false;
  }

  getHitTimeReward(reactionTime) {
    if (reactionTime <= this.fastHitThresholdSec) {
      return {
        deltaMs: this.timeBonusFastMs,
        reason: 'hit_fast',
        message: 'Fast hit!'
      };
    }
    if (reactionTime <= this.goodHitThresholdSec) {
      return {
        deltaMs: this.timeBonusGoodMs,
        reason: 'hit_good',
        message: 'Good hit!'
      };
    }
    return {
      deltaMs: this.timeBonusSlowMs,
      reason: 'hit_slow',
      message: 'Hit!'
    };
  }

  startSessionCountdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
    }

    this.sessionCountdownInterval = setInterval(() => {
      if (this.state !== window.GameState.GAME_PLAY) {
        this.clearGameplayTimers();
        return;
      }

      const now = performance.now();
      if (!this.lastCountdownTs) {
        this.lastCountdownTs = now;
        return;
      }
      const deltaMs = now - this.lastCountdownTs;
      this.lastCountdownTs = now;

      const beforeDisplay = this.getDisplayTimeRemaining();
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - deltaMs);
      const afterDisplay = this.getDisplayTimeRemaining();
      if (window.ui && beforeDisplay !== afterDisplay) {
        window.ui.updateTimeRemaining(afterDisplay);
      }

      if (this.timeRemainingMs <= 0) {
        this.finishSession();
      }
    }, 100);
  }

  scheduleNextMole() {
    if (this.state !== window.GameState.GAME_PLAY || this.timeRemainingMs <= 0) {
      return;
    }
    if (this.activeMoleIndex !== null) {
      return;
    }

    const spawnDelay = this.getCurrentSpawnGapMs();
    this.pendingSpawnDelayMs = spawnDelay;

    this.moleSpawnTimeout = setTimeout(() => {
      this.spawnMole();
    }, spawnDelay);
  }

  spawnMole() {
    if (this.state !== window.GameState.GAME_PLAY || this.timeRemainingMs <= 0) {
      return;
    }

    const nextIndex = this.randomInt(0, 24);
    this.activeMoleIndex = nextIndex;
    this.currentReactionStart = performance.now();
    this.molesSpawned += 1;
    const progress = this.getDifficultyProgress();
    const visibleDuration = this.getCurrentVisibleDurationMs();
    console.log('[GAME][DIFFICULTY_STATE]', {
      progress: Number(progress.toFixed(3)),
      chosenSpawnDelayMs: this.pendingSpawnDelayMs,
      chosenVisibleDurationMs: visibleDuration
    });
    console.log('[GAME][SPAWN_MOLE]', {
      moleIndex: this.activeMoleIndex,
      visibleRangeMs: [CONFIG.game.moleVisibleStartMs || 1800, CONFIG.game.moleVisibleEndMs || 550],
      snapshot: this.getDebugSnapshot()
    });

    if (window.ui) {
      window.ui.lightButton(this.activeMoleIndex);
      window.ui.showGameStatus('Whack the lit button!', 'good');
    }

    this.moleVisibleTimeout = setTimeout(() => {
      this.handleMiss();
    }, visibleDuration);
  }

  handleGridButtonPress(buttonIndex, source = 'unknown') {
    this.lastUserAction = Date.now();
    const now = Date.now();
    const snapshotBefore = this.getDebugSnapshot();
    console.log('[GAME][GRID_PRESS]', {
      source,
      clickedButtonIndex: buttonIndex,
      litButtonIndex: this.activeMoleIndex,
      isMatch: this.activeMoleIndex !== null && buttonIndex === this.activeMoleIndex,
      snapshotBefore
    });

    if (this.state !== window.GameState.GAME_PLAY) {
      console.log('[GAME][GRID_PRESS_IGNORED]', { reason: 'Not in GAME_PLAY', source, snapshotBefore });
      return;
    }

    if (source !== 'grid:pointerdown') {
      console.log('[GAME][GRID_PRESS_IGNORED]', {
        reason: 'Unsupported source during gameplay',
        source,
        clickedButtonIndex: buttonIndex,
        snapshotBefore
      });
      return;
    }

    const deltaMs = now - this.lastGridPressTs;
    if (deltaMs < this.gridPressCooldownMs) {
      console.log('[GAME][GRID_PRESS_DEDUPED]', {
        source,
        clickedButtonIndex: buttonIndex,
        litButtonIndex: this.activeMoleIndex,
        deltaMs,
        cooldownMs: this.gridPressCooldownMs,
        snapshotBefore
      });
      return;
    }
    this.lastGridPressTs = now;

    if (window.ui) {
      window.ui.emitPressEffect(buttonIndex);
    }

    if (this.activeMoleIndex === null) {
      console.log('[GAME][GRID_PRESS_DECISION]', {
        source,
        decision: 'wrong_press_no_active_mole',
        clickedButtonIndex: buttonIndex,
        litButtonIndex: this.activeMoleIndex,
        snapshotBefore
      });
      this.handleWrongPress();
      return;
    }

    if (buttonIndex === this.activeMoleIndex) {
      console.log('[GAME][GRID_PRESS_DECISION]', {
        source,
        decision: 'correct_press',
        clickedButtonIndex: buttonIndex,
        litButtonIndex: this.activeMoleIndex,
        snapshotBefore
      });
      this.handleCorrectPress();
    } else {
      console.log('[GAME][GRID_PRESS_DECISION]', {
        source,
        decision: 'wrong_press_wrong_index',
        clickedButtonIndex: buttonIndex,
        litButtonIndex: this.activeMoleIndex,
        snapshotBefore
      });
      this.handleWrongPress();
    }
  }

  handleCorrectPress() {
    if (!this.currentReactionStart || this.activeMoleIndex === null) {
      return;
    }

    const reactionTime = (performance.now() - this.currentReactionStart) / 1000;
    this.reactionTimes.push(reactionTime);
    this.hits += 1;

    const scoreBreakdown = this.scoring.calculateHitScore(reactionTime);
    this.score += scoreBreakdown.total;
    const timeReward = this.getHitTimeReward(reactionTime);
    this.adjustTime(timeReward.deltaMs, timeReward.reason);
    console.log('[GAME][HIT]', {
      reactionTimeSeconds: reactionTime,
      scoreBreakdown,
      timeReward,
      snapshotAfterScore: this.getDebugSnapshot()
    });

    if (window.ui) {
      window.ui.clearLitButton();
      window.ui.updateScore(this.score);
      window.ui.updateGameStats(this.hits, this.misses, this.wrongWhacks);
      window.ui.animateScoreBreakdown([
        { label: 'Hit', value: scoreBreakdown.hit, type: 'good' },
        { label: 'Speed', value: scoreBreakdown.speed, type: 'good' }
      ]);
      window.ui.animateTimeBreakdown([
        { label: 'Time', value: Number((timeReward.deltaMs / 1000).toFixed(2)), type: 'good' }
      ]);
      window.ui.showGameStatus(timeReward.message, 'good');
    }

    this.clearActiveMole();
    this.scheduleNextMole();
  }

  handleWrongPress() {
    const scoreBefore = this.score;
    this.score -= this.wrongPressPenalty;
    this.wrongWhacks += 1;
    console.log('[GAME][WRONG_PRESS]', {
      wrongPressPenalty: this.wrongPressPenalty,
      scoreBefore,
      scoreAfter: this.score,
      litButtonIndex: this.activeMoleIndex,
      snapshotAfterScore: this.getDebugSnapshot()
    });
    if (window.ui) {
      window.ui.updateScore(this.score);
      window.ui.updateGameStats(this.hits, this.misses, this.wrongWhacks);
      window.ui.animateScoreBreakdown([
        { label: 'Wrong button', value: -this.wrongPressPenalty, type: 'bad' }
      ]);
      window.ui.animateTimeBreakdown([
        { label: 'Time', value: -Number((this.timePenaltyWrongMs / 1000).toFixed(2)), type: 'bad' }
      ]);
      window.ui.showGameStatus('Wrong button', 'bad');
    }
    this.adjustTime(-this.timePenaltyWrongMs, 'wrong_press');
  }

  handleMiss() {
    if (this.activeMoleIndex === null || this.state !== window.GameState.GAME_PLAY) {
      return;
    }

    const missedMoleIndex = this.activeMoleIndex;
    const scoreBefore = this.score;
    this.score -= this.missPenalty;
    this.misses += 1;
    this.reactionTimes.push(CONFIG.game.maxReactionTime);
    console.log('[GAME][MISS]', {
      missedMoleIndex,
      missPenalty: this.missPenalty,
      scoreBefore,
      scoreAfter: this.score,
      snapshotAfterScore: this.getDebugSnapshot()
    });
    if (window.ui) {
      window.ui.clearLitButton();
      window.ui.updateScore(this.score);
      window.ui.updateGameStats(this.hits, this.misses, this.wrongWhacks);
      window.ui.animateScoreBreakdown([
        { label: 'Missed', value: -this.missPenalty, type: 'bad' }
      ]);
      window.ui.animateTimeBreakdown([
        { label: 'Time', value: -Number((this.timePenaltyMissMs / 1000).toFixed(2)), type: 'bad' }
      ]);
      window.ui.showGameStatus('Missed', 'slow');
    }
    const sessionEnded = this.adjustTime(-this.timePenaltyMissMs, 'miss');
    if (sessionEnded) return;

    this.clearActiveMole();
    this.scheduleNextMole();
  }

  clearActiveMole() {
    if (this.moleVisibleTimeout) {
      clearTimeout(this.moleVisibleTimeout);
      this.moleVisibleTimeout = null;
    }
    if (this.moleSpawnTimeout) {
      clearTimeout(this.moleSpawnTimeout);
      this.moleSpawnTimeout = null;
    }
    this.activeMoleIndex = null;
    this.currentReactionStart = null;
  }

  clearGameplayTimers() {
    this.clearActiveMole();
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
      this.sessionCountdownInterval = null;
    }
    this.lastCountdownTs = null;
  }

  finishSession() {
    this.timeRemainingMs = 0;
    this.clearGameplayTimers();
    if (window.ui) {
      window.ui.updateTimeRemaining(this.getDisplayTimeRemaining());
      window.ui.showGameStatus('Time up!', 'bad');
    }
    this.setState(window.GameState.GAME_END);
  }

  async endGame() {
    this.clearGameplayTimers();
    this.activeMoleIndex = null;

    const avgReaction = this.reactionTimes.length > 0
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : 0;
    const bestReaction = this.reactionTimes.length > 0
      ? Math.min(...this.reactionTimes)
      : 0;

    if (window.ui) {
      window.ui.showGameEnd(this.score, avgReaction, bestReaction);
    }
    this.setState(window.GameState.SHOW_SCORE);
  }

  buildPlayerData() {
    const avgReaction = this.reactionTimes.length > 0
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : 0;
    const bestReaction = this.reactionTimes.length > 0
      ? Math.min(...this.reactionTimes)
      : 0;

    if (!this.playerId) {
      this.playerId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!this.currentScoreId) {
      this.currentScoreId = this.generateScoreId();
    }

    return {
      scoreId: this.currentScoreId,
      name: this.playerName || 'Unknown',
      email: (this.playerEmail || '').trim().toLowerCase(),
      company: this.playerCompany || '',
      newsletterOptIn: this.newsletterOptIn ? 'Yes' : 'No',
      id: this.playerId,
      sessionId: this.playerId,
      totalScore: this.score,
      averageReactionTime: avgReaction,
      bestReactionTime: bestReaction,
      reactionTimes: this.reactionTimes,
      rounds: this.molesSpawned,
      timestamp: new Date().toISOString()
    };
  }

  generateScoreId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `score_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  startSyncWorker() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.processOutbox().catch((error) => {
        console.error('Outbox sync loop failed:', error);
      });
    }, this.syncIntervalMs);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }

    this.processOutbox().catch((error) => {
      console.error('Initial outbox sync failed:', error);
    });
  }

  handleOnline() {
    this.processOutbox().catch((error) => {
      console.error('Online outbox sync failed:', error);
    });
  }

  async saveScore() {
    try {
      const playerData = this.buildPlayerData();
      await this.enqueueScoreForSync(playerData, true);

      if (window.ui) {
        window.ui.hideEnterNameButton();
      }
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  }

  saveScoreInBackground(playerData = null) {
    const payload = playerData || this.buildPlayerData();
    return this.enqueueScoreForSync(payload, true);
  }

  async enqueueScoreForSync(payload, attemptNow = true) {
    try {
      await this.localStorage.savePlayerScore(payload);
      this.localStorage.enqueueScore(payload);
      if (attemptNow) {
        await this.processOutbox();
      } else {
        this.processOutbox().catch((error) => {
          console.error('Background outbox sync failed:', error);
        });
      }
      return payload;
    } catch (error) {
      console.error('Failed to enqueue score for sync:', error);
      return payload;
    }
  }

  isScorePending(scoreId) {
    return this.localStorage.isScorePending(scoreId);
  }

  async processOutbox() {
    if (this.syncInFlight) return;
    this.syncInFlight = true;

    try {
      const endpointConfigured = !!(this.sheets && this.sheets.config && this.sheets.config.appsScriptUrl);
      if (!endpointConfigured) {
        const entries = this.localStorage.getOutboxEntries();
        entries
          .filter((entry) => entry.status === 'pending')
          .forEach((entry) => this.localStorage.markAcked(entry.scoreId, 'local_only'));
        return;
      }

      let pending = this.localStorage.getPendingScores(Date.now());
      while (pending.length > 0) {
        const entry = pending[0];
        this.localStorage.markOutboxAttempt(entry.scoreId);

        const result = await this.sheets.savePlayerScore(entry.payload);
        if (result && (result.status === 'inserted' || result.status === 'duplicate')) {
          this.localStorage.markAcked(entry.scoreId, result.serverTimestamp || '');
        } else {
          this.localStorage.scheduleRetry(entry.scoreId, result && result.error ? result.error : 'sync_failed');
        }

        pending = this.localStorage.getPendingScores(Date.now());
      }
    } catch (error) {
      console.error('Outbox processing failed:', error);
    } finally {
      this.syncInFlight = false;
    }
  }

  getLocalLeaderboard(limit = 10) {
    return this.localStorage.getLeaderboard(limit);
  }

  getTodayReactionStats() {
    try {
      const allScores = this.localStorage.getAllScores();
      if (!Array.isArray(allScores) || allScores.length === 0) {
        return { fastestReaction: null, averageReaction: null, totalSessions: 0 };
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const todayEntries = allScores.filter((entry) => {
        const ts = new Date(entry.timestamp || '');
        if (Number.isNaN(ts.getTime())) return false;
        return ts >= dayStart && ts < dayEnd;
      });

      if (todayEntries.length === 0) {
        return { fastestReaction: null, averageReaction: null, totalSessions: 0 };
      }

      const bestValues = todayEntries
        .map((entry) => Number(entry.bestReactionTime))
        .filter((value) => Number.isFinite(value) && value > 0);
      const avgValues = todayEntries
        .map((entry) => Number(entry.averageReactionTime))
        .filter((value) => Number.isFinite(value) && value > 0);

      return {
        fastestReaction: bestValues.length > 0 ? Math.min(...bestValues) : null,
        averageReaction: avgValues.length > 0
          ? avgValues.reduce((sum, value) => sum + value, 0) / avgValues.length
          : null,
        totalSessions: todayEntries.length
      };
    } catch (error) {
      console.error('Failed to compute today stats:', error);
      return { fastestReaction: null, averageReaction: null, totalSessions: 0 };
    }
  }

  getPlayerPlacement(playerData) {
    try {
      const allScores = this.localStorage.getAllScores();
      const localScores = Array.isArray(allScores) ? allScores.slice() : [];
      localScores.push({
        totalScore: Number(playerData.totalScore) || 0,
        timestamp: playerData.timestamp || new Date().toISOString()
      });

      const playerScore = Number(playerData.totalScore) || 0;
      const totalPlayers = localScores.length;
      const higherScores = localScores.filter((entry) => (Number(entry.totalScore) || 0) > playerScore).length;
      const rank = higherScores + 1;
      const fasterThanCount = Math.max(0, totalPlayers - rank);
      const topPercent = Math.max(1, Math.ceil((rank / Math.max(totalPlayers, 1)) * 100));

      return { rank, totalPlayers, topPercent, fasterThanCount };
    } catch (error) {
      console.error('Failed to compute player placement:', error);
      return { rank: 1, totalPlayers: 1, topPercent: 100, fasterThanCount: 0 };
    }
  }

  async getRemoteLeaderboard(limit = 10) {
    try {
      const sheetsLeaderboard = await this.sheets.getLeaderboard(limit);
      return Array.isArray(sheetsLeaderboard) ? sheetsLeaderboard : [];
    } catch (error) {
      console.error('Failed to get remote leaderboard:', error);
      return [];
    }
  }

  async getLeaderboard() {
    try {
      const sheetsLeaderboard = await this.getRemoteLeaderboard(10);
      if (sheetsLeaderboard && sheetsLeaderboard.length > 0) {
        return sheetsLeaderboard;
      }
      return this.getLocalLeaderboard(10);
    } catch (error) {
      console.error('Failed to get leaderboard from endpoint, using local storage:', error);
      return this.getLocalLeaderboard(10);
    }
  }

  playAgain() {
    this.clearIdleTimer();
    this.clearIdleWarning();
    this.setState(window.GameState.PRE_GAME_COUNTDOWN);
  }

  skipTutorial() {
    this.setState(window.GameState.PRE_GAME_COUNTDOWN);
  }

  finishTutorial() {
    this.setState(window.GameState.PRE_GAME_COUNTDOWN);
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

    if (this.state === window.GameState.LEAD_FORM) {
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
