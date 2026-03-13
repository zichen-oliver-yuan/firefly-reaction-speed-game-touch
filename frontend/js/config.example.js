// Copy this file to config.js and fill in your Apps Script credentials.

const CONFIG = {

  // ─── Google Sheets / Apps Script ────────────────────────────────────────────
  googleSheets: {
    mode: 'appsScript',
    appsScriptUrl: 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
    sharedToken: 'YOUR_SHARED_TOKEN_HERE',
    timeoutMs: 12000,            // score submit timeout (ms)
    leaderboardTimeoutMs: 12000, // leaderboard fetch timeout (ms)
    syncIntervalMs: 15000        // background sync interval (ms)
  },

  // ─── UI / Attract mode ──────────────────────────────────────────────────────
  ui: {
    // When true, the demo screen uses a pre-rendered video (`assets/attract-loop.mov`)
    // as the background instead of the DOM-based attract bands animation.
    useVideoAttract: false,
    // When true, completely hide the DOM attract bands (`#attract-bands`) even if
    // video is disabled. This is useful if you only ever want the static demo shell
    // without the animated bands.
    disableDomAttractBands: false,
    // Ms to hold on the first frame between video loop replays (video attract mode).
    attractVideoHoldMs: 4000,
    // Ambient leaderboard scrolling (primarily used on the demo screen).
    ambientLeaderboardScroll: {
      enabled: true,
      demoScreenOnly: true,
      speedPxPerSecond: 18, // primary speed control for rAF scrolling
      // Legacy fallback knobs (used only when speedPxPerSecond is omitted):
      stepPxPerTick: 0.7,
      tickMs: 40,
      resumeDelayMs: 3500 // pause after user interaction before auto-scroll resumes
    }
  },

  game: {

    // ─── Session length ──────────────────────────────────────────────────────
    sessionDurationSeconds: 30, // starting countdown (seconds)
    maxSessionSeconds: 45,      // hard cap — time bonuses can't exceed this

    // ─── Spawn timing (difficulty ramp: start → end over the session) ────────
    moleVisibleStartMs: 1800,   // how long the target stays lit at the START
    moleVisibleEndMs: 550,      // how long it stays lit at MAX difficulty
    spawnGapStartMs: 900,       // gap between spawns at the START (ms)
    spawnGapEndMs: 180,         // gap between spawns at MAX difficulty (ms)
    difficultyRampExponent: 0.65, // curve shape: <1 ramps fast early, >1 ramps fast late

    // ─── Scoring ─────────────────────────────────────────────────────────────
    hitScore: 300,              // base points per successful tap
    missPenalty: 120,           // points deducted for a miss
    wrongPressPenalty: 150,     // points deducted for tapping the wrong cell
    redPressPenalty: 420,       // points deducted for tapping the red trap button

    // ─── Time bonuses / penalties (added to / subtracted from countdown) ─────
    timeBonusFastSec: 1.2,      // time added for a "fast" hit (≤ fastHitThresholdSec)
    timeBonusGoodSec: 0.7,      // time added for a "good" hit
    timeBonusSlowSec: 0.25,     // time added for a slow hit
    timePenaltyMissSec: 1.1,    // time deducted for a miss
    timePenaltyWrongSec: 0.8,   // time deducted for a wrong press
    timePenaltyRedSec: 1.4,     // time deducted for hitting the red button

    // ─── Reaction time thresholds ────────────────────────────────────────────
    fastHitThresholdSec: 0.22,  // faster than this → "fast" bonus
    goodHitThresholdSec: 0.45,  // faster than this → "good" bonus (else "slow")
    minReactionTime: 0.1,       // clamp floor for reaction time recording
    maxReactionTime: 3.0,       // clamp ceiling (used for misses)

    // ─── Red trap button ─────────────────────────────────────────────────────
    redButtonProbability: 0.18, // 0–1 chance each spawn is a red trap (18%)

    // ─── Input ───────────────────────────────────────────────────────────────
    gridPressCooldownMs: 120,   // ignore duplicate taps within this window (ms)

    // ─── Pre-game countdown ──────────────────────────────────────────────────
    preGameCountdownSeconds: 3,

    // ─── Inactivity / idle ───────────────────────────────────────────────────
    disableInactivityTimers: false,
    idleTimeout: 20000,                  // ms of no input before idle warning
    idleWarningThresholdSeconds: 20,
    idleWarningCountdownSeconds: 20,

    // ─── Leaderboard auto-advance ────────────────────────────────────────────
    leaderboardCountdownEnabled: true,
    leaderboardCountdownIdleDelayMs: 5000, // delay before countdown starts (ms)
    leaderboardCountdownSeconds: 20        // seconds until auto-return to demo
  }
};
