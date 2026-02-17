/** Scoring system and reaction time calculations. */

class ScoringSystem {
  constructor() {
    this.baseScore = 1000;
    this.comboMultiplier = 1.0;
    this.comboBonus = 20;
    this.maxCombo = 10;
  }

  /**
   * Calculate score based on reaction time.
   * @param {number} reactionTime - Reaction time in seconds
   * @param {number} comboCount - Current combo count
   * @returns {object} Score breakdown
   */
  calculateScore(reactionTime, comboCount = 0) {
    const maxTime = CONFIG.game.maxReactionTime;
    const minTime = CONFIG.game.minReactionTime;
    
    // Normalize reaction time (faster = higher score)
    const normalizedTime = Math.max(0, Math.min(1, (maxTime - reactionTime) / (maxTime - minTime)));
    
    // Base reaction score (0-1000 points)
    const reactionScore = Math.floor(normalizedTime * this.baseScore);
    
    // Combo bonus
    const combo = Math.min(comboCount, this.maxCombo);
    const comboScore = combo > 0 ? combo * this.comboBonus : 0;
    
    // Total score
    const totalScore = reactionScore + comboScore;
    
    return {
      reaction: reactionScore,
      combo: comboScore,
      total: totalScore,
      comboCount: combo
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

  /**
   * Check if reaction qualifies for combo bonus.
   * @param {number} reactionTime - Reaction time in seconds
   * @returns {boolean} True if qualifies for combo
   */
  qualifiesForCombo(reactionTime) {
    return reactionTime <= CONFIG.game.comboThreshold;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScoringSystem;
}
