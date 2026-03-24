/**
 * Service Worker — cache-first for offline kiosk support.
 * Bump CACHE_NAME to force a full re-fetch on next deploy.
 */

const CACHE_NAME = 'firefly-game-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/scoring.js',
  '/js/touch-keyboard.js',
  '/js/sheets.js',
  '/js/local-storage.js',
  '/js/sound.js',
  '/js/game.js',
  '/js/ui.js',
  '/js/main.js',
  // Fonts
  '/assets/fonts/GT-America-Mono-Regular.ttf',
  '/assets/fonts/LED-Dot-Matrix.ttf',
  '/assets/fonts/SFTSchriftedSans-Black.otf',
  '/assets/fonts/SFTSchriftedSans-Bold.otf',
  '/assets/fonts/SFTSchriftedSans-Regular.otf',
  // SVGs
  '/assets/SVG/Firefly_Lockup_Horz_DarkBlue_RGB.svg',
  '/assets/SVG/Firefly_Symbol_DarkBlue_RGB.svg',
  // Sound effects (from sound.js preload list)
  '/assets/sounds/money-sound.mp3',
  '/assets/sounds/another-one_dPvHt2Z.mp3',
  '/assets/sounds/anime-wow-sound-effect.mp3',
  '/assets/sounds/slotmachine.mp3',
  '/assets/sounds/fuuuuh.mp3',
  '/assets/sounds/freesound_community-negative_beeps-6008.mp3',
  '/assets/sounds/mistake-1.mp3',
  '/assets/sounds/floraphonic-arcade-ui-17-229515.mp3',
  '/assets/sounds/floraphonic-casual-click-pop-ui-2-262119.mp3',
  '/assets/sounds/floraphonic-casual-click-pop-ui-7-262127.mp3',
  '/assets/sounds/floraphonic-casual-click-pop-ui-9-262123.mp3',
  '/assets/sounds/eminem-my-name-is.wav',
  '/assets/sounds/countdown.wav',
  '/assets/sounds/Naughty By Nature - Here Comes The Money.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let API calls (Google Apps Script) go to network only — never cache them
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache-first for all same-origin requests
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
