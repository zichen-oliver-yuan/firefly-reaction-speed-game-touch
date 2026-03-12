# Prerendered Attract Animation Configuration

## Overview
The attract animation (Phases 1-4) is now prerendered as an H.264 MP4 video to eliminate performance bottlenecks on the Sharp PN-LM431 TV. The video runs for **10.4 seconds** at **60 FPS** in **1080x1920 portrait** resolution.

## Video Specifications

| Property | Value |
|----------|-------|
| **Resolution** | 1080×1920 (portrait) |
| **Frame Rate** | 60 FPS |
| **Duration** | 10.4 seconds (624 frames) |
| **File Size** | ~0.74 MB |
| **Codec** | H.264 (baseline profile) |
| **Color Space** | YUV 4:2:0 |
| **Output** | `frontend/assets/attract-loop.mp4` |

## Animation Timeline

```
0ms   ─────→ 1500ms      Phase 1: Magenta band slides up
1500ms ─────→ 2500ms     Phase 2: Lime band slides up
2500ms ─────→ 3800ms     Phase 2 → Phase 3 transition (padding)
3800ms ─────→ 4700ms     Phase 3: Text grow animation (900ms)
3800ms ─────→ 9500ms     Phase 3: Marquee scroll (continuous)
9500ms ─────→ 10400ms    Phase 4: Zoom-out animation (900ms)
10400ms ────→ END        Video loops
```

### Phase Timings (in `frontend/js/ui.js`)
```javascript
this.attractReveal1Ms = 1500;   // Phase 1: magenta slides up
this.attractReveal2Ms = 2500;   // Phase 2: lime slides up
this.attractGrowMs    = 3800;   // Phase 3: text grows + scrolls
this.attractGridMs    = 9500;   // Phase 4: zoom-out (scale 4→1)
```

### Animation Easing

**Flex-grow transitions (Phase 1-2):**
```css
cubic-bezier(0.22, 1, 0.36, 1)  /* Overshoot easing */
transition: 0.9s
```

**Phase 3 text grow (scale animation):**
```javascript
duration: 900ms
easing: cubic-bezier(0.22, 1, 0.36, 1)
```

**Phase 4 zoom-out (container scale):**
```javascript
duration: 900ms
easing: cubic-bezier(0.22, 1, 0.36, 1)
scale: 4 → 1
```

## To Re-render the Video

If you need to adjust animation timing or content, modify the configuration and re-run the prerender script:

```bash
node scripts/prerender-attract.mjs
```

### Adjustable Parameters in `scripts/prerender-attract.mjs`

```javascript
// Recording resolution (4K for quality)
const RECORD_WIDTH = 2160;
const RECORD_HEIGHT = 3840;

// Playback resolution (1080p portrait)
const PLAYBACK_WIDTH = 1080;
const PLAYBACK_HEIGHT = 1920;

// Frame rate (increase for smoother animation, more file size)
const FPS = 60;

// Total duration (must match Phase 4 completion time)
const DURATION_MS = 10400;
```

### Adjustable Parameters in `frontend/js/ui.js`

```javascript
// Attract cycle timings (absolute ms from cycle start)
this.attractReveal1Ms = 1500;   // Phase 1
this.attractReveal2Ms = 2500;   // Phase 2
this.attractGrowMs    = 3800;   // Phase 3
this.attractGridMs    = 9500;   // Phase 4

// Marquee scroll speed multiplier (affects Phase 3 & 4)
this.phase4SpeedScale = 2;  // Higher = slower scroll
```

### Adjustable Easing in `frontend/js/ui.js`

The easing curve is hardcoded in the `showAttractPhase4()` function:

```javascript
const zoomAnim = bands.animate(
  [{ scale: '4' }, { scale: '1' }],
  {
    duration: 900,                                    // ← Adjust Phase 4 duration
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',       // ← Adjust easing curve
    fill: 'none'
  }
);
```

## Display Settings

### On TV (1920×1080 landscape)
The 1080×1920 portrait video displays with letterboxing (black bars on sides):

```css
.attract-video {
  object-fit: contain;  /* Full portrait video visible */
  background: #000;     /* Black letterbox bars */
}
```

### Alternative: Crop to Fill Screen
If you want the video to fill the entire TV screen (cropping portrait edges):

```css
.attract-video {
  object-fit: cover;    /* Crops portrait edges to fill landscape */
}
```

## Playback in UI

The video is controlled via `frontend/js/ui.js`:

```javascript
startAttractCycle() {
  const video = document.getElementById('attract-video');

  // Play the prerendered video
  video.currentTime = 0;
  video.play();

  // Schedule leaderboard after Phase 4 (at 9500ms + buffer)
  setTimeout(() => {
    this.setDemoLeaderboardVisible(true);
  }, 10500);

  // Restart cycle after leaderboard hides
  setTimeout(() => {
    this.startAttractCycle();
  }, 24000);
}
```

## Debugging

To view specific phases during development:

```javascript
// Skip to a phase for testing (in console)
ui.debugSkipToPhase('phase1')   // Shows Phase 1
ui.debugSkipToPhase('phase2')   // Shows Phases 1-2
ui.debugSkipToPhase('phase3')   // Shows Phases 1-3
ui.debugSkipToPhase('phase4')   // Shows Phases 1-4 completed
ui.debugSkipToPhase('leaderboard')  // Shows Phase 4 + leaderboard
```

## Performance Impact

✅ **Eliminated:**
- 40+ concurrent CSS/WAAPI animations
- DOM mutations during animation playback
- Font-size unit conversions
- Marquee scroll calculations

✅ **Optimized:**
- Video plays via hardware codec
- Compositor-friendly (no layout thrashing)
- Minimal CPU/GPU load on TV

## File Structure

```
frontend/
  ├── assets/
  │   └── attract-loop.mp4          ← Prerendered video (0.74 MB)
  ├── index.html                     ← <video> element
  ├── css/styles.css                 ← .attract-video styling
  └── js/ui.js                       ← Video playback control

scripts/
  └── prerender-attract.mjs           ← Render script
```
