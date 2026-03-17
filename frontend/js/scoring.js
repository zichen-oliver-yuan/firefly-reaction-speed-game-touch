/** Scoring system and reaction time calculations. */

class ScoringSystem {
  constructor() {
    this.minScore = 30;
    this.maxScore = 500;
    this.fastTime = 0.3;   // at or below this → max score
    this.exponent = 2.5;   // exponential curve steepness
  }

  /**
   * Calculate hit score based on reaction time (exponential curve).
   * Returns 50 for slow reactions, up to 1000 for ≤0.3s.
   * @param {number} reactionTime - Reaction time in seconds
   * @returns {object} Score breakdown
   */
  calculateHitScore(reactionTime) {
    const maxTime = CONFIG.game.maxReactionTime;
    const normalized = Math.max(0, Math.min(1,
      (maxTime - reactionTime) / (maxTime - this.fastTime)
    ));
    const baseScore = Math.round(
      this.minScore + (this.maxScore - this.minScore) * Math.pow(normalized, this.exponent)
    );

    return {
      base: baseScore,
      total: baseScore
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
