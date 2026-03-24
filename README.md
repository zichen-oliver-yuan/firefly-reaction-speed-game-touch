# Firefly Reaction Speed Game (Touch Display Edition)

A browser-based reaction time game designed for touch displays at trade shows and kiosk setups.

## Launching at a Trade Show

Follow these steps before the game goes live for customers:

1. **Clear the browser cache** — this ensures the latest version of the game is loaded with no stale assets.
2. **Set the browser to Fullscreen mode** — the game is designed to fill the entire screen.
3. **Untick "Desktop page"** — this prevents unintentional zoom-in from touch gestures.
4. **Set the screen's PICTURE MODE to RETAIL** — press the MENU button on the display's remote, navigate to the picture settings, and select RETAIL mode for brighter, more vivid colors.
5. **Do not change the configuration once the game is properly launched.**

## Configuration

All game and scoring settings live in `frontend/js/config.js`. This includes round count, timing, difficulty curve, scoring thresholds, and UI options.

**Do not modify `config.js` once the game is properly launched at a trade show.**

## Architecture

- Frontend-only web app in `frontend/` — plain HTML, CSS, and vanilla JS (no build step)
- Hosted on Netlify with basic auth via an edge function
- Optional Google Sheets integration through Google Apps Script for centralized leaderboard
- Automatic localStorage leaderboard fallback when offline

## Project Structure

```text
frontend/
├── index.html              — all screens (attract, game, score, lead form, leaderboard)
├── manifest.json           — PWA manifest
├── sw.js                   — service worker for offline caching
├── css/
│   └── styles.css          — all styling, keyframes, transitions
├── js/
│   ├── main.js             — entry point, wires ui + game together
│   ├── game.js             — game state machine, timers, scoring
│   ├── ui.js               — all DOM/animation logic
│   ├── config.js           — runtime config (speeds, thresholds, Sheets URL)
│   ├── scoring.js          — score calculation
│   ├── sound.js            — sound effects manager
│   ├── touch-keyboard.js   — on-screen keyboard for lead form
│   ├── sheets.js           — Google Sheets sync
│   └── local-storage.js    — offline score queue
└── assets/
    ├── fonts/              — custom fonts
    ├── sounds/             — audio files
    └── SVG/                — branding assets

apps-script/Code.gs         — Google Apps Script backend
netlify/edge-functions/      — Netlify edge function for auth
```

## Google Apps Script Setup (Optional)

If you want centralized leaderboard data in Google Sheets:

1. Create a Google Sheet and open Extensions → Apps Script.
2. Paste `apps-script/Code.gs` into the script editor.
3. In Apps Script, set script property `FIREFLY_SHARED_TOKEN` to the same token used in `config.js`.
4. Deploy as Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
5. Copy the Web App URL into `googleSheets.appsScriptUrl` in `config.js`.

### Fake data for scroll testing

To generate fake leaderboard rows, call the Apps Script endpoint with action `seedFakeData`:

- `target: "fake"` creates/refreshes a `Scores_Fake` table with fake rows.
- `target: "scores"` appends fake rows into `Scores` (used by live leaderboard reads).
- `getLeaderboard` reads `Scores` by default; if `Scores` is empty, it falls back to `Scores_Fake`.

Example request body:

```json
{
  "action": "seedFakeData",
  "payload": { "target": "scores", "count": 120 },
  "token": "YOUR_SHARED_TOKEN_HERE"
}
```

## Gameplay Flow

1. Attract / demo screen (auto-loops with leaderboard)
2. Tip page
3. 5-round reaction game (configurable)
4. Score screen
5. Lead form (name, email, company; consent optional) and leaderboard

## Notes

- Google Sheets is the canonical ground truth when configured.
- The browser stores an outbox (`firefly_score_outbox_v1`) and retries unsynced scores with backoff until acknowledged.
- Score writes use immutable `scoreId` idempotency keys to prevent duplicate rows during retries/timeouts.
- Leaderboard reads prefer server data; local cache is used as offline fallback.
- Consent is optional and defaults to `No` when unchecked or missing.

## Local Development

No build step required. Serve the frontend with any static server:

```bash
cd frontend
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## Screenshot Handoff

Generate a full designer handoff screenshot pack:

```bash
npm install
npx playwright install chromium
npm run screenshots
```

Outputs are saved to `frontend/screenshots/`:

- Numbered PNG screenshots at `1080x1920`
- `index.md` mapping each file to its scenario

## License

MIT
