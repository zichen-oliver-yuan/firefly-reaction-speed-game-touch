/** Sound effects manager — preloads and plays game audio. */

class SoundManager {
  constructor() {
    this.enabled = !!(CONFIG.game && CONFIG.game.enableSoundEffects);
    this.sounds = {};
    this._preloaded = false;
  }

  preload() {
    if (this._preloaded) return;
    this._preloaded = true;

    const files = {
      'money-sound': 'assets/sounds/money-sound.mp3',
      'another-one': 'assets/sounds/another-one_dPvHt2Z.mp3',
      'anime-wow': 'assets/sounds/anime-wow-sound-effect.mp3',
      'slotmachine': 'assets/sounds/slotmachine.mp3',
      'fuuuuh': 'assets/sounds/fuuuuh.mp3',
      'streak-lost': 'assets/sounds/freesound_community-negative_beeps-6008.mp3',
      'mistake': 'assets/sounds/mistake-1.mp3',
      'red-avoid': 'assets/sounds/floraphonic-arcade-ui-17-229515.mp3',
      'nav-back': 'assets/sounds/floraphonic-casual-click-pop-ui-7-262127.mp3',
      'nav-next': 'assets/sounds/floraphonic-casual-click-pop-ui-2-262119.mp3',
      'key-click': 'assets/sounds/floraphonic-casual-click-pop-ui-9-262123.mp3',
      'lead-form': 'assets/sounds/eminem-my-name-is.wav',
      'countdown': 'assets/sounds/countdown.wav',
      'game-over': 'assets/sounds/Naughty By Nature - Here Comes The Money.wav',
    };

    for (const [name, src] of Object.entries(files)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      this.sounds[name] = audio;
    }
  }

  play(name) {
    if (!this.enabled) return;
    const audio = this.sounds[name];
    if (!audio) return;
    // Reset to start so rapid re-triggers overlap correctly
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay may be blocked until user interaction — silently ignore
    });
  }

  /** Play the appropriate streak sound for the given combo count. */
  playStreak(comboStreak) {
    if (comboStreak <= 0) return;
    if (comboStreak <= 4) {
      this.play('money-sound');
    } else if (comboStreak < 10) {
      // Streaks 5-9: money-sound + random pick of another-one or anime-wow
      this.play('money-sound');
      const bonus = Math.random() < 0.5 ? 'another-one' : 'anime-wow';
      this.play(bonus);
    } else {
      // Streaks 10+: money-sound + random pick, start looping slotmachine if not already
      this.play('money-sound');
      const bonus = Math.random() < 0.5 ? 'another-one' : 'anime-wow';
      this.play(bonus);
      this.startSlotmachine();
    }
  }

  /** Fade in the slotmachine loop (if not already playing). */
  startSlotmachine(fadeDurationMs = 400) {
    const audio = this.sounds['slotmachine'];
    if (!audio || this._slotmachinePlaying) return;
    this._slotmachinePlaying = true;
    this._clearSlotmachineFade();
    audio.loop = true;
    audio.volume = 0;
    audio.currentTime = 0;
    audio.play().catch(() => {});

    const steps = 15;
    const interval = fadeDurationMs / steps;
    const increment = 1 / steps;
    this._slotmachineFade = setInterval(() => {
      const next = audio.volume + increment;
      if (next >= 1) {
        clearInterval(this._slotmachineFade);
        this._slotmachineFade = null;
        audio.volume = 1;
      } else {
        audio.volume = next;
      }
    }, interval);
  }

  /** Fade out and stop the slotmachine loop. */
  stopSlotmachine(fadeDurationMs = 400) {
    const audio = this.sounds['slotmachine'];
    if (!audio || !this._slotmachinePlaying) return;
    this._clearSlotmachineFade();

    const steps = 15;
    const interval = fadeDurationMs / steps;
    const decrement = audio.volume / steps;

    this._slotmachineFade = setInterval(() => {
      const next = audio.volume - decrement;
      if (next <= 0) {
        clearInterval(this._slotmachineFade);
        this._slotmachineFade = null;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        audio.loop = false;
        this._slotmachinePlaying = false;
      } else {
        audio.volume = next;
      }
    }, interval);
  }

  _clearSlotmachineFade() {
    if (this._slotmachineFade) {
      clearInterval(this._slotmachineFade);
      this._slotmachineFade = null;
    }
  }

  playStreakLost() {
    this.play('streak-lost');
    this.stopSlotmachine();
  }

  playRedPress() {
    this.play('fuuuuh');
    this.stopSlotmachine();
  }

  playWrongPress() {
    this.play('mistake');
    this.stopSlotmachine();
  }

  playRedAvoid() {
    this.play('red-avoid');
  }

  playNavBack() {
    this.play('nav-back');
  }

  playNavNext() {
    this.play('nav-next');
  }

  playKeyClick() {
    this.play('key-click');
  }

  playLeadForm() {
    this.play('lead-form');
  }

  playCountdown() {
    this.play('countdown');
  }

  playGameOver() {
    this.stopSlotmachine();
    if (!this.enabled) return;
    const audio = this.sounds['game-over'];
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 1;
    audio.loop = false;
    audio.play().catch(() => {});
  }

  /** Fade out and stop the game-over track (called when "Done" is pressed). */
  stopGameOver(fadeDurationMs = 1000) {
    const audio = this.sounds['game-over'];
    if (!audio || audio.paused) return;

    const steps = 20;
    const interval = fadeDurationMs / steps;
    const decrement = audio.volume / steps;

    const fade = setInterval(() => {
      const next = audio.volume - decrement;
      if (next <= 0) {
        clearInterval(fade);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      } else {
        audio.volume = next;
      }
    }, interval);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    console.log(`[sound] effects: ${this.enabled ? 'ON' : 'OFF'}`);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundManager;
}
