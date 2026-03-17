const CONFIG = {
  // ─── Google Sheets / Apps Script ────────────────────────────────────────────
  googleSheets: {
    mode: "appsScript",
    appsScriptUrl:
      "https://script.google.com/macros/s/AKfycbyNtJMXcULh7-7VR0FFa6SGJ43t9uqonTCXW8JeV-KdNRPsuyNVaQRHaDCdXY3OGmdE/exec",
    sharedToken: "m6ehUrjFG1ZagN0",
    timeoutMs: 12000, // score submit timeout (ms)
    leaderboardTimeoutMs: 12000, // leaderboard fetch timeout (ms)
    syncIntervalMs: 15000, // background sync interval (ms)
  },

  // ─── UI / Attract mode ──────────────────────────────────────────────────────
  ui: {
    // When false, disables the rolling "odometer" animation for time/score and
    // falls back to a simple numeric text update.
    enableOdometer: true,
    // When true, the demo screen uses a pre-rendered video (`assets/attract-loop.mp4`)
    // as the background instead of the DOM-based attract bands animation.
    useVideoAttract: true,
    // When true, completely hide the DOM attract bands (`#attract-bands`) even if
    // video is disabled. This is useful if you only ever want the static demo shell
    // without the animated bands.
    disableDomAttractBands: true,
    // Ms to hold on the first frame between video loop replays (video attract mode).
    attractVideoHoldMs: 2000,
    // Ambient leaderboard scrolling (primarily used on the demo screen).
    ambientLeaderboardScroll: {
      enabled: true,
      demoScreenOnly: true,
      speedPxPerSecond: 80, // primary speed control for rAF scrolling
      // Legacy fallback knobs (used only when speedPxPerSecond is omitted):
      stepPxPerTick: 0.5,
      tickMs: 16,
      resumeDelayMs: 3500, // pause after user interaction before auto-scroll resumes
    },
  },

  game: {
    // ─── Session length ──────────────────────────────────────────────────────
    sessionDurationSeconds: 30, // starting countdown (seconds)
    maxSessionSeconds: 45, // hard cap — time bonuses can't exceed this

    // ─── Spawn timing (difficulty ramp: start → end over the session) ────────
    moleVisibleStartMs: 2000, // how long the target stays lit at the START
    moleVisibleEndMs: 600, // how long it stays lit at MAX difficulty
    spawnGapStartMs: 450, // gap between spawns at the START (ms)
    spawnGapEndMs: 250, // gap between spawns at MAX difficulty (ms)
    // Difficulty uses a 3-phase curve (easy → plateau → linear ramp)
    // defined in getDifficultyProgress(). No single exponent needed.

    // ─── Scoring ─────────────────────────────────────────────────────────────
    // Per-hit score uses an exponential curve: 50 (slow) → 1000 (≤0.3s)
    // Combo multiplier = consecutive hit streak (2X, 3X, 4X…)
    missPenalty: 120, // points deducted for a miss
    wrongPressPenalty: 200, // points deducted for tapping the wrong cell
    redPressPenalty: 420, // points deducted for tapping the red trap button

    // ─── Time bonuses / penalties (added to / subtracted from countdown) ─────
    timeBonusFastSec: 1, // time added for a "fast" hit (≤ fastHitThresholdSec)
    timeBonusGoodSec: 1, // time added for a "good" hit
    timeBonusSlowSec: 0, // no time added for a slow hit
    timePenaltyMissSec: 1, // time deducted for a miss
    timePenaltyWrongSec: 1, // time deducted for a wrong press
    timePenaltyRedSec: 2, // time deducted for hitting the red button

    // ─── Reaction time thresholds ────────────────────────────────────────────
    fastHitThresholdSec: 0.28, // faster than this → "fast" bonus
    goodHitThresholdSec: 0.55, // faster than this → "good" bonus (else "slow")
    minReactionTime: 0.1, // clamp floor for reaction time recording
    maxReactionTime: 1.2, // clamp ceiling — wider window so more hits earn a bonus

    // ─── Red trap button ─────────────────────────────────────────────────────
    redButtonsPerSession: 8, // fixed number of red traps per game session
    redButtonMinSpacing: 4, // minimum green spawns between reds
    redButtonMaxSpacing: 8, // maximum green spawns between reds

    // ─── Input ───────────────────────────────────────────────────────────────
    gridPressCooldownMs: 120, // ignore duplicate taps within this window (ms)

    // ─── Pre-game countdown ──────────────────────────────────────────────────
    preGameCountdownSeconds: 3,

    // ─── Inactivity / idle ───────────────────────────────────────────────────
    disableInactivityTimers: false,
    idleTimeout: 20000, // ms of no input before idle warning
    idleWarningThresholdSeconds: 20,
    idleWarningCountdownSeconds: 20,

    // ─── Leaderboard auto-advance ────────────────────────────────────────────
    leaderboardCountdownEnabled: true,
    leaderboardCountdownIdleDelayMs: 5000, // delay before countdown starts (ms)
    leaderboardCountdownSeconds: 20, // seconds until auto-return to demo
  },
};
