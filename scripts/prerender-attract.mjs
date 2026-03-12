#!/usr/bin/env node

/**
 * Prerender Phase 1-4 of attract animation to MP4 video.
 *
 * Captures frames at 60 FPS for 10.4 seconds (Phase 1-4 with full Phase 4 zoom completion).
 * Records at 4K (3840x2160) for quality, plays back at 1080x1920 (portrait).
 * Encodes to H.264 MP4, places output at frontend/assets/attract-loop.mp4
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const frontendDir = path.join(projectRoot, 'frontend');
const assetsDir = path.join(frontendDir, 'assets');
const outputPath = path.join(assetsDir, 'attract-loop.mp4');
const framesDir = path.join(projectRoot, '.frames-temp');

// Recording at 4K for quality (portrait orientation: 2160x3840)
const RECORD_WIDTH = 2160;
const RECORD_HEIGHT = 3840;
// Playback resolution (portrait: 1080x1920)
const PLAYBACK_WIDTH = 1080;
const PLAYBACK_HEIGHT = 1920;

const FPS = 60;
const DURATION_MS = 10400;  // Phase 1 (1500) + Phase 2 (1000) + Phase 3 (5700) + Phase 4 zoom (900)
const FRAME_COUNT = Math.ceil((DURATION_MS / 1000) * FPS);
const PORT = 9000;
const URL = `http://localhost:${PORT}`;

console.log(`🎬 Attract Animation Prerender`);
console.log(`📊 Recording: ${FPS} FPS, ${DURATION_MS}ms duration, ${FRAME_COUNT} frames`);
console.log(`📐 Record res: ${RECORD_WIDTH}x${RECORD_HEIGHT} (4K portrait)`);
console.log(`📐 Playback res: ${PLAYBACK_WIDTH}x${PLAYBACK_HEIGHT} (1080p portrait)`);

// Clean up and create frames directory
if (fs.existsSync(framesDir)) {
  execSync(`rm -rf "${framesDir}"`);
}
fs.mkdirSync(framesDir, { recursive: true });

// Ensure assets directory exists
fs.mkdirSync(assetsDir, { recursive: true });

let browser;

async function captureFrames() {
  console.log(`\n📱 Launching browser and navigating to ${URL}`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: RECORD_WIDTH, height: RECORD_HEIGHT },
    colorScheme: 'dark',
  });

  // Inject CSS to hide PLAY button and scale appropriately
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      #demo-start-btn { display: none !important; }
      body { margin: 0; padding: 0; }
      #game-container { width: 100vw; height: 100vh; }
    `;
    document.head.appendChild(style);
  });

  // Navigate to demo page
  await page.goto(`${URL}?demo=true`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#attract-bands', { timeout: 5000 });

  console.log(`✅ Page loaded\n`);

  // Wait for demo to fully load
  await page.waitForTimeout(500);

  // Start attract cycle
  console.log(`🎬 Starting attract cycle and capturing frames...`);
  await page.evaluate(() => {
    if (window.ui && typeof window.ui.startAttractCycle === 'function') {
      window.ui.startAttractCycle();
    }
  });

  // Capture frames at 60 FPS
  const frameDuration = 1000 / FPS;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const currentMs = i * frameDuration;
    const frameNum = String(i).padStart(6, '0');
    const framePath = path.join(framesDir, `frame-${frameNum}.png`);

    // Wait for next frame time
    await page.waitForTimeout(frameDuration);

    // Capture screenshot
    await page.screenshot({ path: framePath, omitBackground: false });

    // Progress indicator every 30 frames (~0.5s at 60fps)
    if ((i + 1) % 30 === 0) {
      const percent = ((i + 1) / FRAME_COUNT * 100).toFixed(1);
      const timeAtMs = (i * frameDuration).toFixed(0);
      process.stdout.write(`\r  [${percent}%] Frame ${i + 1}/${FRAME_COUNT} @ ${timeAtMs}ms`);
    }
  }

  console.log(`\n✅ ${FRAME_COUNT} frames captured\n`);

  await browser.close();
}

async function encodeToMP4() {
  console.log(`🎥 Encoding frames to H.264 MP4...`);
  console.log(`   Scaling from 4K (${RECORD_WIDTH}x${RECORD_HEIGHT}) to 1080p portrait (${PLAYBACK_WIDTH}x${PLAYBACK_HEIGHT})`);

  const inputPattern = path.join(framesDir, 'frame-%06d.png');
  // Scale filter: convert 4K portrait to 1080p portrait
  const scaleFilter = `scale=${PLAYBACK_WIDTH}:${PLAYBACK_HEIGHT}`;

  const ffmpegCmd = [
    'ffmpeg',
    '-framerate', String(FPS),
    '-i', `"${inputPattern}"`,
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',  // Higher quality for scaling
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',  // Enable fast start for streaming
    '-y',  // overwrite output file
    `"${outputPath}"`
  ].join(' ');

  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`\n✅ Video encoded: ${outputPath}`);

    const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    const duration = (DURATION_MS / 1000).toFixed(1);
    console.log(`📦 File size: ${fileSize} MB`);
    console.log(`⏱️  Duration: ${duration}s at ${FPS} FPS`);
  } catch (err) {
    console.error(`❌ ffmpeg encoding failed:`, err.message);
    throw err;
  }
}

async function cleanup() {
  console.log(`\n🧹 Cleaning up temporary frames...`);
  execSync(`rm -rf "${framesDir}"`);
  console.log(`✅ Done`);
}

async function main() {
  try {
    await captureFrames();
    await encodeToMP4();
    await cleanup();
    console.log(`\n✨ Prerender complete! Video ready at: frontend/assets/attract-loop.mp4`);
  } catch (err) {
    console.error(`\n❌ Prerender failed:`, err.message);
    if (browser) await browser.close();
    if (fs.existsSync(framesDir)) {
      execSync(`rm -rf "${framesDir}"`);
    }
    process.exit(1);
  }
}

main();
