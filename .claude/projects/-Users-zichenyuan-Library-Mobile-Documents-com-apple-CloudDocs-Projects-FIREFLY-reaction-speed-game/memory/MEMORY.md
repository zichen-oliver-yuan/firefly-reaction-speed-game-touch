# FIREFLY Reaction Speed Game - Project Memory

## Project Overview
Touch-first browser-based reaction time game for kiosk/Android display (1080x1920).
Pure frontend with optional Google Apps Script backend for score storage.

## Key Files
- `frontend/index.html` - Main entry, 8 game screens
- `frontend/js/config.js` - Game config (timing, scoring, API keys)
- `frontend/js/game.js` - State machine + gameplay (~1161 lines)
- `frontend/js/ui.js` - Screen transitions + leaderboard (~774 lines)
- `frontend/js/scoring.js` - Reaction time score calculation (56 lines)
- `frontend/js/sheets.js` - Apps Script API client (155 lines)
- `frontend/js/local-storage.js` - Offline storage + outbox queue (372 lines)
- `frontend/js/touch-keyboard.js` - Virtual keyboard for lead form (187 lines)
- `frontend/js/main.js` - Event handlers + init (257 lines)
- `frontend/css/styles.css` - Responsive styling, LED themes
- `apps-script/Code.gs` - Google Apps Script backend (501 lines)
- `scripts/capture-screenshots.mjs` - Playwright screenshot automation
- `playwright.config.js` + `package.json` - Playwright test config

## Game State Machine (game.js)
States: DEMO → WELCOME → TUTORIAL → PRE_GAME_COUNTDOWN → GAME_PLAY → SHOW_SCORE → LEAD_FORM → SHOW_LEADERBOARD → IDLE_WARNING

## Gameplay Mechanics
- 30s timed session (not round-based despite `rounds: 5` config)
- 5×5 grid of 25 buttons
- 18% red buttons (trap/penalty), 82% green (score)
- Difficulty ramps over time: spawn gap 900ms→180ms, visible 1800ms→550ms
- Difficulty curve: `progress = (elapsed/duration)^0.65`

## Scoring
- Hit: 300 base + speed bonus (max 180 = fast < 0.22s)
- Wrong press: -200 pts + 0.8s time penalty
- Red press: -420 pts + 1.4s time penalty
- Miss (timeout): -120 pts + 1.1s time penalty
- Correct hits grant time extensions (+1.2s fast, +0.7s good, +0.25s slow)

## Score Persistence (Dual-Layer)
1. localStorage immediate save (`firefly_game_scores`)
2. Outbox queue (`firefly_score_outbox_v1`) with retry backoff [2s,5s,15s,60s,300s]
3. Background 15s sync worker → Apps Script POST
4. Remote leaderboard cached after fetch

## Apps Script Backend (Code.gs)
- Deploy as Web App (Anyone access)
- Script property: `FIREFLY_SHARED_TOKEN`
- Endpoints: `submitScore`, `getLeaderboard`, `syncStatus`, `seedFakeData`
- Deduplication via `scoreId` (UUID)
- Sheet columns: scoreId, timestamp, sessionId, name, firstName, lastName, email, company, newsletterOptIn, totalScore, averageReactionTime, bestReactionTime, reactionTimesJson, rounds, source

## Tech Stack
- Vanilla JS (ES6 classes), no framework
- Custom LED font + GT America Mono
- Flexbox layout, touch-only (no mouse during game)
- Playwright for screenshot automation

## Visual Design
- `--accent: #c9ea7b` (lime green), `--danger: #ff6c6c`
- LED-style headers with marquee animation for long text
- Odometer-style number animations

## Worktree
Working on branch `claude/hardcore-easley`. Main branch: `main`.

See `architecture.md` for detailed data flow diagrams.
