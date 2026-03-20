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
      'streak-1': 'assets/sounds/streak-1.wav',
      'streak-2': 'assets/sounds/streak-2.wav',
      'streak-3': 'assets/sounds/streak-3.wav',
      'streak-4': 'assets/sounds/streak-4.wav',
      'streak-5': 'assets/sounds/streak-5.wav',
      'streak-high': 'assets/sounds/streak-high.wav',
      'streak-lost': 'assets/sounds/streak-lost.wav',
      'game-over': 'assets/sounds/game-over.wav',
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
    if (comboStreak <= 5) {
      this.play(`streak-${comboStreak}`);
    } else {
      this.play('streak-high');
    }
  }

  playStreakLost() {
    this.play('streak-lost');
  }

  playGameOver() {
    this.play('game-over');
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    console.log(`[sound] effects: ${this.enabled ? 'ON' : 'OFF'}`);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundManager;
}
