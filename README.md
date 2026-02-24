# Firefly Reaction Speed Game (Touch Display Edition)

A browser-based reaction time game designed for touch displays, including Android interactive kiosks/panels.

## Architecture

- Frontend-only web app in `frontend/`
- No GPIO, no Raspberry Pi dependencies, no hardware scanner dependencies
- Optional Google Sheets integration through Google Apps Script
- Automatic localStorage leaderboard fallback

## Setup

### 1. Configure the app

Edit `frontend/js/config.js`:

- `googleSheets.appsScriptUrl` (optional)
- `googleSheets.sharedToken` (optional)
- `game.*` timing and round configuration

Example:

```js
googleSheets: {
  mode: 'appsScript',
  appsScriptUrl: 'https://script.google.com/macros/s/.../exec',
  sharedToken: 'replace-with-your-secret-token',
  timeoutMs: 6000
}
```

### 2. Google Apps Script setup (optional)

If you want centralized gamer info + leaderboard in Google Sheets:

1. Create a Google Sheet and open Extensions -> Apps Script.
2. Paste `apps-script/Code.gs` into the script editor.
3. In Apps Script, set script property `FIREFLY_SHARED_TOKEN` to the same token used in `config.js`.
4. Deploy as Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
5. Copy the Web App URL into `googleSheets.appsScriptUrl`.

Sheet tab `Scores` is auto-created with columns:

`scoreId, timestamp, sessionId, name, email, company, newsletterOptIn, totalScore, averageReactionTime, bestReactionTime, reactionTimesJson, rounds, source`

### 3. Serve the frontend

Use any static web server (examples):

```bash
cd frontend
python3 -m http.server 8080
```

Then open `http://localhost:8080` on your touch display browser.

## Gameplay Flow

1. Demo screen
2. Optional tutorial
3. 5-round reaction game (configurable)
4. Score screen
5. Lead form (`name`, `email`, `company`; consent optional) and leaderboard

## Project Structure

```text
reaction-speed-game/
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── game.js
│       ├── ui.js
│       ├── main.js
│       ├── touch-keyboard.js
│       ├── scoring.js
│       ├── sheets.js
│       └── local-storage.js
└── README.md
```

## Notes

- Google Sheets is the canonical ground truth when configured.
- The browser stores an outbox (`firefly_score_outbox_v1`) and retries unsynced scores with backoff until acknowledged.
- Score writes use immutable `scoreId` idempotency keys to prevent duplicate rows during retries/timeouts.
- Leaderboard reads prefer server data; local cache is used as offline fallback.
- Consent is optional and defaults to `No` when unchecked or missing.
- Best experience is full-screen kiosk mode on the display browser.

## License

MIT
