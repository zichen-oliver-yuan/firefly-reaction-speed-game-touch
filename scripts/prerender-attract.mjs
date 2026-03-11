#!/usr/bin/env node

/**
 * Prerender Phase 1-4 of attract animation to MP4 video.
 *
 * Captures frames at 30 FPS for 9.5 seconds (285 frames total),
 * encodes to H.264 MP4, places output at frontend/assets/attract-loop.mp4
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

const FPS = 30;
const DURATION_MS = 9500;  // Phase 1-4 duration
const FRAME_COUNT = Math.ceil((DURATION_MS / 1000) * FPS);
const PORT = 9000;
const URL = `http://localhost:${PORT}`;

console.log(`🎬 Attract Animation Prerender`);
console.log(`📊 ${FPS} FPS, ${DURATION_MS}ms duration, ${FRAME_COUNT} frames`);

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
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'dark',
  });

  // Navigate to demo page
  await page.goto(`${URL}?demo=true`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#attract-bands', { timeout: 5000 });

  console.log(`✅ Page loaded\n`);

  // Inject test mode to skip demo timer refresh
  await page.addInitScript(() => {
    window.PRERENDER_MODE = true;
  });

  // Wait for demo to fully load
  await page.waitForTimeout(500);

  // Start attract cycle
  console.log(`🎬 Starting attract cycle and capturing frames...`);
  await page.evaluate(() => {
    if (window.ui && typeof window.ui.startAttractCycle === 'function') {
      window.ui.startAttractCycle();
    }
  });

  // Capture frames at 30 FPS
  const frameDuration = 1000 / FPS;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const currentMs = i * frameDuration;
    const frameNum = String(i).padStart(6, '0');
    const framePath = path.join(framesDir, `frame-${frameNum}.png`);

    // Wait for next frame time
    await page.waitForTimeout(frameDuration);

    // Capture screenshot
    await page.screenshot({ path: framePath, omitBackground: false });

    // Progress indicator every 10 frames
    if ((i + 1) % 10 === 0) {
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

  const inputPattern = path.join(framesDir, 'frame-%06d.png');
  const ffmpegCmd = [
    'ffmpeg',
    '-framerate', String(FPS),
    '-i', `"${inputPattern}"`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-y',  // overwrite output file
    `"${outputPath}"`
  ].join(' ');

  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`\n✅ Video encoded: ${outputPath}`);

    const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log(`📦 File size: ${fileSize} MB`);
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
