import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { chromium } from "playwright";

const ROOT_DIR = process.cwd();
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const OUTPUT_DIR = path.join(FRONTEND_DIR, "screenshots");
const VIEWPORT = { width: 1080, height: 1920 };

const CAPTURES = [
  { file: "01-demo.png", scenario: "demo", note: "Demo screen" },
  { file: "02-welcome.png", scenario: "welcome", note: "Welcome screen" },
  { file: "03-tutorial.png", scenario: "tutorial", note: "Tutorial screen" },
  { file: "04-countdown.png", scenario: "countdown", note: "Pre-game countdown" },
  { file: "05-game-base.png", scenario: "game-base", note: "Game baseline" },
  { file: "06-game-lit-green.png", scenario: "game-lit-green", note: "Game with lit green button" },
  { file: "07-game-lit-red.png", scenario: "game-lit-red", note: "Game with lit red button" },
  { file: "08-score.png", scenario: "score", note: "Score screen" },
  { file: "09-lead-form-empty.png", scenario: "lead-form-empty", note: "Lead form empty" },
  { file: "10-lead-form-keyboard.png", scenario: "lead-form-keyboard", note: "Lead form with keyboard focus" },
  { file: "11-lead-form-error.png", scenario: "lead-form-error", note: "Lead form validation error" },
  { file: "12-lead-form-filled.png", scenario: "lead-form-filled", note: "Lead form filled" },
  { file: "13-leaderboard-empty.png", scenario: "leaderboard-empty", note: "Leaderboard no entries" },
  { file: "14-leaderboard-populated.png", scenario: "leaderboard-populated", note: "Leaderboard with entries" },
  { file: "15-idle-warning.png", scenario: "idle-warning", note: "Idle warning screen" },
  { file: "16-feedback-legacy.png", scenario: "feedback", note: "Legacy feedback shell screen" }
];

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function resolveSafePath(urlPath) {
  const cleaned = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relativePath = cleaned === "/" ? "/index.html" : cleaned;
  const resolved = path.normalize(path.join(FRONTEND_DIR, relativePath));
  if (!resolved.startsWith(FRONTEND_DIR)) return null;
  return resolved;
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = resolveSafePath(req.url || "/");
      if (!filePath) {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const data = await fs.readFile(finalPath);
      res.setHeader("Content-Type", contentType(finalPath));
      res.writeHead(200);
      res.end(data);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind static server");
  }
  return { server, port: address.port };
}

async function writeManifest() {
  const lines = [
    "# UI Screenshot Index",
    "",
    "- Viewport: `1080x1920`",
    "- Source: current game UI in `frontend/`",
    "",
    "| File | Scenario | Notes |",
    "| --- | --- | --- |"
  ];

  for (const entry of CAPTURES) {
    lines.push(`| ${entry.file} | ${entry.scenario} | ${entry.note} |`);
  }

  lines.push("");
  await fs.writeFile(path.join(OUTPUT_DIR, "index.md"), lines.join("\n"), "utf8");
}

async function setupScenario(page, scenario) {
  await page.evaluate((currentScenario) => {
    const ui = window.ui;
    const game = window.game;
    if (!ui || !game) throw new Error("Game/UI not initialized");

    const stopDemo = ui.stopDemoRefresh || ui.stopDemoRotation;
    if (typeof stopDemo === "function") stopDemo.call(ui);
    if (typeof ui.hideAllScreens === "function") ui.hideAllScreens();

    if (typeof game.clearGameplayTimers === "function") game.clearGameplayTimers();
    if (typeof game.clearIdleTimer === "function") game.clearIdleTimer();
    if (typeof game.clearIdleWarning === "function") game.clearIdleWarning();
    if (game.preGameCountdownInterval) {
      clearInterval(game.preGameCountdownInterval);
      game.preGameCountdownInterval = null;
    }
    if (game.syncInterval) {
      clearInterval(game.syncInterval);
      game.syncInterval = null;
    }

    const mockBoard = [
      { rank: 1, name: "Avery", score: 1980 },
      { rank: 2, name: "Jordan", score: 1875 },
      { rank: 3, name: "Casey", score: 1760 },
      { rank: 4, name: "Taylor", score: 1702 },
      { rank: 5, name: "Morgan", score: 1670 },
      { rank: 6, name: "Riley", score: 1610 },
      { rank: 7, name: "Quinn", score: 1535 },
      { rank: 8, name: "Alex", score: 1490 },
      { rank: 9, name: "Sky", score: 1412 },
      { rank: 10, name: "Drew", score: 1366 }
    ];

    const setVal = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    };

    const renderDemoBoard = () => {
      const list = document.getElementById("demo-leaderboard-list");
      if (!list) return;
      if (typeof ui.renderLeaderboardRows === "function") {
        ui.renderLeaderboardRows(list, mockBoard, null, true);
      } else {
        list.innerHTML = "";
        mockBoard.forEach((entry) => {
          const row = document.createElement("div");
          row.className = "leaderboard-entry";
          row.innerHTML = `<span>${entry.rank}</span><span>${entry.name}</span><span>${entry.score}PTS</span>`;
          list.appendChild(row);
        });
      }
    };

    const baseGame = () => {
      ui.showScreen("game");
      if (typeof ui.initializeButtonGrid === "function") ui.initializeButtonGrid();
      if (typeof ui.clearLitButton === "function") ui.clearLitButton();
      if (typeof ui.updateTimeRemaining === "function") ui.updateTimeRemaining(24);
      if (typeof ui.updateScore === "function") ui.updateScore(420);
      if (typeof ui.showGameStatus === "function") ui.showGameStatus("START!!", "good");
    };

    switch (currentScenario) {
      case "demo":
        ui.showScreen("demo");
        renderDemoBoard();
        break;
      case "welcome":
        ui.showScreen("welcome");
        break;
      case "tutorial":
        ui.showScreen("tutorial");
        if (typeof ui.updateTutorialStep === "function") ui.updateTutorialStep();
        break;
      case "countdown":
        ui.showScreen("countdown");
        if (typeof ui.updatePreGameCountdown === "function") ui.updatePreGameCountdown(3);
        break;
      case "game-base":
        baseGame();
        break;
      case "game-lit-green":
        baseGame();
        if (typeof ui.lightButton === "function") ui.lightButton(12, "good");
        if (typeof ui.showGameStatus === "function") ui.showGameStatus("NICE HIT!", "good");
        break;
      case "game-lit-red":
        baseGame();
        if (typeof ui.lightButton === "function") ui.lightButton(8, "red");
        if (typeof ui.showGameStatus === "function") ui.showGameStatus("YOU MISSED!", "bad");
        break;
      case "score":
        if (typeof ui.showGameEnd === "function") {
          ui.showGameEnd(1280, 0.312, 0.181);
        } else {
          ui.showScreen("score");
        }
        break;
      case "lead-form-empty":
        ui.showScreen("lead-form");
        if (typeof ui.clearLeadFormData === "function") ui.clearLeadFormData();
        break;
      case "lead-form-keyboard":
        ui.showScreen("lead-form");
        if (typeof ui.clearLeadFormData === "function") ui.clearLeadFormData();
        {
          const firstName = document.getElementById("lead-first-name-input");
          if (firstName) {
            if (window.touchKeyboard) window.touchKeyboard.input = firstName;
            firstName.focus();
          }
        }
        break;
      case "lead-form-error":
        ui.showScreen("lead-form");
        if (typeof ui.clearLeadFormData === "function") ui.clearLeadFormData();
        if (typeof ui.showLeadFormError === "function") {
          ui.showLeadFormError("Please enter first name, last name, and a valid email.");
        }
        break;
      case "lead-form-filled":
        ui.showScreen("lead-form");
        setVal("lead-first-name-input", "Designer");
        setVal("lead-last-name-input", "Sample");
        setVal("lead-email-input", "designer@example.com");
        {
          const consent = document.getElementById("lead-consent-input");
          if (consent) consent.checked = true;
        }
        if (typeof ui.clearLeadFormError === "function") ui.clearLeadFormError();
        break;
      case "leaderboard-empty":
        ui.showScreen("leaderboard");
        if (typeof ui.showLeaderboard === "function") ui.showLeaderboard([], "Unknown", null);
        break;
      case "leaderboard-populated":
        ui.showScreen("leaderboard");
        if (typeof ui.showLeaderboard === "function") {
          ui.showLeaderboard(mockBoard, "You", {
            playerData: { name: "You", totalScore: 1333 },
            placement: { rank: 11, totalPlayers: 157, fasterThanCount: 146 },
            pendingSync: false
          });
        }
        break;
      case "idle-warning":
        if (typeof ui.showIdleWarning === "function") ui.showIdleWarning();
        if (typeof ui.updateIdleCountdown === "function") ui.updateIdleCountdown(12);
        break;
      case "feedback":
        ui.showScreen("feedback");
        break;
      default:
        throw new Error(`Unknown scenario: ${currentScenario}`);
    }
  }, scenario);
}

async function main() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.ui && window.game);

    await page.addStyleTag({
      content: `
        * {
          transition: none !important;
          animation: none !important;
          caret-color: transparent !important;
        }
      `
    });

    for (const capture of CAPTURES) {
      await setupScenario(page, capture.scenario);
      await page.waitForTimeout(80);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, capture.file),
        fullPage: false
      });
      console.log(`Captured ${capture.file}`);
    }

    await writeManifest();
    console.log(`\nSaved ${CAPTURES.length} screenshots to: ${OUTPUT_DIR}`);
    console.log(`Saved manifest: ${path.join(OUTPUT_DIR, "index.md")}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
