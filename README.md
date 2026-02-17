# Firefly Reaction Speed Game (Touch Display Edition)

A browser-based reaction time game designed for touch displays, including Android interactive kiosks/panels.

## Architecture

- Frontend-only web app in `frontend/`
- No GPIO, no Raspberry Pi dependencies, no hardware scanner dependencies
- Optional Google Sheets leaderboard integration
- Automatic localStorage leaderboard fallback

## Setup

### 1. Configure the app

Edit `frontend/js/config.js`:

- `googleSheets.*` (optional)
- `game.*` timing and round configuration

### 2. Serve the frontend

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
5. Leaderboard and optional name entry

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

- Google Sheets integration is optional; if unavailable, scores are stored in browser localStorage.
- Best experience is full-screen kiosk mode on the display browser.

## License

MIT
