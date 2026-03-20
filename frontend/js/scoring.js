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
  /**
   * Return the reaction tier for a given average reaction time.
   * @param {number} avgReactionSec
   * @returns {{ tier: { sec, label }, index: number }}
   */
  getRating(avgReactionSec) {
    const tiers = CONFIG.score.reactionTiers;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (avgReactionSec >= tiers[i].sec) return { tier: tiers[i], index: i };
    }
    return { tier: tiers[0], index: 0 };
  }

  /**
   * Return the summary one-liner based on avg reaction time and mistake count.
   * @param {number} avgReactionSec
   * @param {number} mistakeCount
   * @returns {string}
   */
  getSummaryLine(avgReactionSec, mistakeCount) {
    const { index } = this.getRating(avgReactionSec);
    const { fastMaxIdx, averageMaxIdx } = CONFIG.score.speedBuckets;
    const speed = index <= fastMaxIdx ? 'fast'
                : index <= averageMaxIdx ? 'average' : 'slow';
    const mistakes = mistakeCount <= CONFIG.score.mistakesLowMaxCount ? 'low' : 'high';
    const match = CONFIG.score.summaryOneLiners.find(
      l => l.speed === speed && l.mistakes === mistakes
    );
    if (!match) return '';
    const lines = match.lines;
    return lines[Math.floor(Math.random() * lines.length)];
  }

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
