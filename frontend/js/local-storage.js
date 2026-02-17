/** Local storage backup for game scores and leaderboard. */

class LocalStorageBackup {
  constructor() {
    this.storageKey = 'firefly_game_scores';
    this.maxEntries = 1000; // Limit to prevent storage overflow
  }

  /**
   * Save player score to local storage.
   * @param {object} playerData - Player data {name, id, score, reactionTimes, timestamp}
   * @returns {Promise} Promise that resolves when data is saved
   */
  async savePlayerScore(playerData) {
    try {
      const scores = this.getAllScores();
      
      // Add new score
      scores.push({
        timestamp: playerData.timestamp || new Date().toISOString(),
        name: playerData.name || 'Unknown',
        id: playerData.id || '',
        totalScore: playerData.totalScore || 0,
        averageReactionTime: playerData.averageReactionTime || 0,
        bestReactionTime: playerData.bestReactionTime || 0,
        reactionTimes: playerData.reactionTimes || [],
        rounds: playerData.rounds || 5
      });

      // Keep only the most recent entries
      if (scores.length > this.maxEntries) {
        scores.splice(0, scores.length - this.maxEntries);
      }

      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(scores));
      
      console.log('Score saved to local storage');
      return true;
    } catch (error) {
      console.error('Error saving to local storage:', error);
      // Handle quota exceeded error
      if (error.name === 'QuotaExceededError') {
        console.warn('Local storage quota exceeded - clearing old entries');
        this.clearOldEntries(500); // Keep only 500 most recent
        return this.savePlayerScore(playerData); // Retry
      }
      return false;
    }
  }

  /**
   * Get all scores from local storage.
   * @returns {Array} Array of score objects
   */
  getAllScores() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading from local storage:', error);
      return [];
    }
  }

  /**
   * Get leaderboard from local storage.
   * @param {number} limit - Number of top scores to retrieve
   * @returns {Array} Sorted leaderboard array
   */
  getLeaderboard(limit = 10) {
    try {
      const scores = this.getAllScores();
      
      // Sort by score (descending) and limit
      const leaderboard = scores
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit)
        .map((entry, index) => ({
          rank: index + 1,
          timestamp: entry.timestamp || '',
          name: entry.name || 'Unknown',
          id: entry.id || '',
          score: entry.totalScore || 0,
          avgReaction: entry.averageReactionTime || 0,
          bestReaction: entry.bestReactionTime || 0
        }));

      return leaderboard;
    } catch (error) {
      console.error('Error getting leaderboard from local storage:', error);
      return [];
    }
  }

  /**
   * Clear old entries to free up space.
   * @param {number} keepCount - Number of recent entries to keep
   */
  clearOldEntries(keepCount = 500) {
    try {
      const scores = this.getAllScores();
      const sorted = scores.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA; // Most recent first
      });
      
      const kept = sorted.slice(0, keepCount);
      localStorage.setItem(this.storageKey, JSON.stringify(kept));
      console.log(`Cleared old entries, kept ${kept.length} most recent`);
    } catch (error) {
      console.error('Error clearing old entries:', error);
    }
  }

  /**
   * Export all scores as JSON string.
   * @returns {string} JSON string of all scores
   */
  exportScores() {
    const scores = this.getAllScores();
    return JSON.stringify(scores, null, 2);
  }

  /**
   * Export scores as CSV string.
   * @returns {string} CSV string
   */
  exportScoresCSV() {
    const scores = this.getAllScores();
    if (scores.length === 0) return '';

    // CSV header
    const headers = ['Timestamp', 'Name', 'ID', 'Score', 'Avg Reaction', 'Best Reaction', 'Rounds'];
    let csv = headers.join(',') + '\n';

    // CSV rows
    scores.forEach(score => {
      const row = [
        score.timestamp || '',
        `"${(score.name || 'Unknown').replace(/"/g, '""')}"`, // Escape quotes
        score.id || '',
        score.totalScore || 0,
        score.averageReactionTime || 0,
        score.bestReactionTime || 0,
        score.rounds || 5
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Clear all stored scores.
   */
  clearAll() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('All scores cleared from local storage');
    } catch (error) {
      console.error('Error clearing local storage:', error);
    }
  }

  /**
   * Get storage statistics.
   * @returns {object} Storage stats
   */
  getStats() {
    const scores = this.getAllScores();
    return {
      totalEntries: scores.length,
      storageSize: JSON.stringify(scores).length,
      oldestEntry: scores.length > 0 ? scores[0].timestamp : null,
      newestEntry: scores.length > 0 ? scores[scores.length - 1].timestamp : null
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalStorageBackup;
}
