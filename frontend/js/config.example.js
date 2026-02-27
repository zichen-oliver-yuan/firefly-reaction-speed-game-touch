// Copy this file to config.js and add your Apps Script endpoint settings.

const CONFIG = {
  googleSheets: {
    mode: 'appsScript',
    appsScriptUrl: 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
    sharedToken: 'YOUR_SHARED_TOKEN_HERE',
    timeoutMs: 5000,
    leaderboardTimeoutMs: 12000,
    syncIntervalMs: 15000
  },
  game: {
    rounds: 5,
    sessionDurationSeconds: 30,
    maxSessionSeconds: 45,
    moleVisibleStartMs: 1800,
    moleVisibleEndMs: 550,
    spawnGapStartMs: 900,
    spawnGapEndMs: 180,
    difficultyRampExponent: 0.65,
    redButtonProbability: 0.18,
    timeBonusFastSec: 1.2,
    timeBonusGoodSec: 0.7,
    timeBonusSlowSec: 0.25,
    timePenaltyWrongSec: 0.8,
    timePenaltyMissSec: 1.1,
    timePenaltyRedSec: 1.4,
    fastHitThresholdSec: 0.22,
    goodHitThresholdSec: 0.45,
    hitScore: 300,
    missPenalty: 120,
    redPressPenalty: 420,
    minReactionTime: 0.1,
    maxReactionTime: 3.0,
    minWaitTime: 1.0,
    maxWaitTime: 5.0,
    preGameCountdownSeconds: 3,
    wrongPressPenalty: 150,
    gridPressCooldownMs: 120,
    disableInactivityTimers: false,
    idleTimeout: 20000,
    idleWarningThresholdSeconds: 20,
    idleWarningCountdownSeconds: 20,
    leaderboardCountdownEnabled: true,
    leaderboardCountdownIdleDelayMs: 5000,
    leaderboardCountdownSeconds: 20
  }
};
