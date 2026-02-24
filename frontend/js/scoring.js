/** Scoring system and reaction time calculations. */

class ScoringSystem {
  constructor() {
    this.speedBonusRatio = 0.6;
  }

  /**
   * Calculate hit score based on reaction time.
   * @param {number} reactionTime - Reaction time in seconds
   * @returns {object} Score breakdown
   */
  calculateHitScore(reactionTime) {
    const maxTime = CONFIG.game.maxReactionTime;
    const minTime = CONFIG.game.minReactionTime;
    const baseHitScore = CONFIG.game.hitScore || 300;

    const normalizedTime = Math.max(0, Math.min(1, (maxTime - reactionTime) / (maxTime - minTime)));
    const speedBonus = Math.floor(baseHitScore * this.speedBonusRatio * normalizedTime);
    const totalScore = baseHitScore + speedBonus;

    return {
      hit: baseHitScore,
      speed: speedBonus,
      total: totalScore
    };
  }

  /**
   * Get feedback message based on reaction time.
   * @param {number} reactionTime - Reaction time in seconds
   * @returns {string} Feedback message
   */
  getFeedback(reactionTime) {
    if (reactionTime < 0.2) {
      return "That was impressive!";
    } else if (reactionTime < 0.3) {
      return "Great reaction!";
    } else if (reactionTime < 0.5) {
      return "Good job!";
    } else if (reactionTime < 1.0) {
      return "Not bad!";
    } else if (reactionTime < 2.0) {
      return "You can do it faster.";
    } else {
      return "Try to react faster next time.";
    }
  }

}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScoringSystem;
}
