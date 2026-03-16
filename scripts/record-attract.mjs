/**
 * record-attract.mjs
 *
 * Captures the attract animation as an H.264 MP4 for kiosk video playback.
 *
 * Strategy — deterministic frame stepping (default):
 *   Uses Playwright's page.clock to advance JS timers by exactly 1/fps seconds per
 *   frame, and uses the Web Animations API to pause and step every CSS / WAAPI
 *   animation to the corresponding time. Each frame is then captured with
 *   page.screenshot(). Every frame is unique and exactly 1/fps seconds apart
 *   in animation time — true 60 fps regardless of machine speed.
 *
 * Usage:
 *   npm run record:attract
 *
 * Environment overrides:
 *   WIDTH=1080        Viewport width  (default: 1080)
 *   HEIGHT=1920       Viewport height (default: 1920)
 *   FPS=60            Output framerate (default: 60)
 *   DURATION=24       Recording length in seconds (default: 24)
 *   OUTPUT=...        Output file (default: frontend/assets/attract-loop.mp4)
 *   JPEG_QUALITY=90   Screenshot JPEG quality 1–100 (default: 90)
 *   CRF=18            H.264 CRF quality, lower = better (default: 18)
 *
 * Quick test:
 *   DURATION=5 OUTPUT=/tmp/attract-test.mp4 npm run record:attract
 *
 * 4K portrait:
 *   WIDTH=2160 HEIGHT=3840 npm run record:attract
 *
 * Prerequisites:
 *   npm install          (playwright already in devDependencies)
 *   brew install ffmpeg
 *
 * To enable video mode after recording:
 *   1. Uncomment the <video> element in frontend/index.html
 *   2. Set  useVideoAttract: true  in frontend/js/config.js
 */

import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT_DIR    = process.cwd();
const FRONTEND    = path.join(ROOT_DIR, "frontend");

const WIDTH        = parseInt(process.env.WIDTH        ?? "1080",  10);
const HEIGHT       = parseInt(process.env.HEIGHT       ?? "1920",  10);
const FPS          = parseInt(process.env.FPS          ?? "60",    10);
const DURATION_S   = parseFloat(process.env.DURATION   ?? "24");
const OUTPUT       = process.env.OUTPUT ?? path.join(FRONTEND, "assets", "attract-loop.mp4");
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY ?? "90",    10);
const CRF          = process.env.CRF ?? "18";

const TOTAL_FRAMES = Math.ceil(FPS * DURATION_S);
const FRAME_MS     = 1000 / FPS;

// ---------------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------------

function contentType(fp) {
  if (fp.endsWith(".html")) return "text/html; charset=utf-8";
  if (fp.endsWith(".js"))   return "application/javascript; charset=utf-8";
  if (fp.endsWith(".css"))  return "text/css; charset=utf-8";
  if (fp.endsWith(".svg"))  return "image/svg+xml";
  if (fp.endsWith(".png"))  return "image/png";
  if (fp.endsWith(".jpg") || fp.endsWith(".jpeg")) return "image/jpeg";
  if (fp.endsWith(".mp4"))  return "video/mp4";
  return "application/octet-stream";
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const cleaned  = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const relative = cleaned === "/" ? "/index.html" : cleaned;
      const resolved = path.normalize(path.join(FRONTEND, relative));
      if (!resolved.startsWith(FRONTEND)) { res.writeHead(400); res.end(); return; }
      let stat;
      try { stat = await fs.stat(resolved); } catch { res.writeHead(404); res.end(); return; }
      const final = stat.isDirectory() ? path.join(resolved, "index.html") : resolved;
      const data  = await fs.readFile(final);
      res.setHeader("Content-Type", contentType(final));
      res.writeHead(200);
      res.end(data);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Server bind failed");
  return { server, port: addr.port };
}

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

function checkFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); }
  catch { throw new Error("ffmpeg not found — install with: brew install ffmpeg"); }
}

function spawnFfmpeg({ output, fps, width, height, crf }) {
  // Input: MJPEG pipe at exactly fps (one frame per tick).
  // Output: H.264, constant fps, yuv420p, fast-start for streaming.
  return spawn("ffmpeg", [
    "-y",
    "-f",        "mjpeg",
    "-r",        String(fps),
    "-i",        "pipe:0",
    "-c:v",      "libx264",
    "-preset",   "slow",
    "-crf",      String(crf),
    "-pix_fmt",  "yuv420p",
    // Ensure dimensions are divisible by 2 (H.264 requirement).
    "-vf",       `scale=${width}:${height}:flags=lanczos`,
    "-r",        String(fps),        // output fps = input fps (no resampling needed)
    "-movflags", "+faststart",
    output,
  ], { stdio: ["pipe", "inherit", "inherit"] });
}

// ---------------------------------------------------------------------------
// Page init script — injected before page load
// ---------------------------------------------------------------------------

// Tracks all animations ever seen in the page and steps them to an explicit
// fake time so they stay in sync with page.clock ticks.
const INIT_SCRIPT = `
(function () {
  // Map<Animation, fakeTimeMs when first seen>
  var _animMap = new Map();

  window._stepAnimations = function () {
    var now = performance.now(); // patched by page.clock — returns fake time
    var anims = document.getAnimations();

    // Register new animations at the current fake time.
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      if (!_animMap.has(a)) _animMap.set(a, now);
    }

    // Pause every animation and jump it to elapsed fake time.
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      var start   = _animMap.get(a) ?? now;
      var elapsed = Math.max(0, now - start);
      try {
        a.pause();
        a.currentTime = elapsed;
      } catch (_) {}
    }

    // Prune finished / removed animations to keep the map small.
    for (var [anim] of _animMap) {
      if (!document.getAnimations().includes(anim)) _animMap.delete(anim);
    }

    return anims.length;
  };
})();
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  checkFfmpeg();
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Attract animation recorder  (deterministic 60 fps)");
  console.log(`  Resolution : ${WIDTH}×${HEIGHT}  (portrait)`);
  console.log(`  Duration   : ${DURATION_S}s  (${TOTAL_FRAMES} frames @ ${FPS}fps)`);
  console.log(`  Output     : ${OUTPUT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // -------------------------------------------------------------------------
  // Browser
  // -------------------------------------------------------------------------
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      // Screenshot-based capture is unaffected by tab throttling, but these
      // flags also help ensure rAF callbacks fire reliably.
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  const ctx = await browser.newContext({
    viewport:          { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    bypassCSP:         true,
  });

  // Inject the animation stepper before any page script runs.
  await ctx.addInitScript(INIT_SCRIPT);

  const page = await ctx.newPage();

  // -------------------------------------------------------------------------
  // Navigate
  // -------------------------------------------------------------------------
  const { server, port } = await startStaticServer();

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!(window.ui && window.game));

  // Stop any auto-started animations / timers from the real clock so they
  // don't race with our fake clock.
  await page.evaluate(() => {
    if (window.ui) window.ui.stopAttractCycle();
    if (window.ui) window.ui.stopDemoRefresh();
  });

  // -------------------------------------------------------------------------
  // Install fake clock, then trigger the attract cycle
  // -------------------------------------------------------------------------
  // page.clock.install() replaces Date, setTimeout, setInterval,
  // performance.now, requestAnimationFrame — all used by the attract cycle.
  // We install at time 0 so the cycle starts cleanly from the origin.
  await page.clock.install({ time: 0 });

  await page.evaluate(() => {
    window.isRecordingMode        = true;   // suppress leaderboard DOM overlay
    window.useVideoAttract        = false;  // run DOM animation, not video
    window.disableDomAttractBands = false;

    // Trigger the attract cycle. All setTimeout calls inside use the fake clock.
    if (window.ui) window.ui.updateState("demo");
  });

  // -------------------------------------------------------------------------
  // Frame capture loop
  // -------------------------------------------------------------------------
  console.log("  Recording…");

  const ffmpeg    = spawnFfmpeg({ output: OUTPUT, fps: FPS, width: WIDTH, height: HEIGHT, crf: CRF });
  const ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    ffmpeg.on("error", reject);
  });

  const wallStart = Date.now();

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    // 1. Advance the fake clock by one frame interval.
    //    This fires any JS setTimeout / setInterval callbacks and rAF callbacks
    //    that fall within this time window (attract phase changes, WAAPI start, etc).
    await page.clock.runFor(FRAME_MS);

    // 2. Pause and step every CSS / WAAPI animation to the current fake time.
    //    This ensures the visual state matches the fake clock position exactly.
    await page.evaluate(() => window._stepAnimations());

    // 3. Capture the frame as JPEG.
    const jpeg = await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY });

    // 4. Write to ffmpeg stdin, respecting backpressure.
    const ok = ffmpeg.stdin.write(jpeg);
    if (!ok) await new Promise((r) => ffmpeg.stdin.once("drain", r));

    // Progress log every second of video.
    if ((i + 1) % FPS === 0) {
      const videoSec = ((i + 1) / FPS).toFixed(0);
      const wallSec  = ((Date.now() - wallStart) / 1000).toFixed(0);
      process.stdout.write(
        `\r  Frame ${String(i + 1).padStart(5)}/${TOTAL_FRAMES}` +
        `  video=${videoSec}s  wall=${wallSec}s  `
      );
    }
  }

  process.stdout.write("\n");

  ffmpeg.stdin.end();
  await ffmpegDone;

  await browser.close();
  await new Promise((r) => server.close(r));

  const totalWall = ((Date.now() - wallStart) / 1000).toFixed(0);
  console.log(`  Encoded in ${totalWall}s wall time`);
  console.log("");
  console.log("  ✓ Done.");
  console.log(`  Output: ${OUTPUT}`);
  console.log("");
  console.log("  To enable video mode:");
  console.log("    1. Uncomment the <video> block in frontend/index.html");
  console.log("    2. Set  useVideoAttract: true  in frontend/js/config.js");
}

main().catch((e) => {
  console.error("\n  ERROR:", e.message ?? e);
  process.exitCode = 1;
});
