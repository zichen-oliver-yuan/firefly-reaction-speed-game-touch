/** Local storage backup for game scores and leaderboard. */

class LocalStorageBackup {
  constructor() {
    this.storageKey = 'firefly_game_scores';
    this.outboxKey = 'firefly_score_outbox_v1';
    this.remoteLeaderboardCacheKey = 'firefly_remote_leaderboard_cache_v1';
    this.maxEntries = 1000; // Limit to prevent storage overflow
    this.retryBackoffMs = [2000, 5000, 15000, 60000, 300000];
  }

  /**
   * Save player score to local storage.
   * @param {object} playerData - Player data {name, id, score, reactionTimes, timestamp}
   * @returns {Promise} Promise that resolves when data is saved
   */
  async savePlayerScore(playerData) {
    try {
      const scores = this.getAllScores();
      const nextEntry = {
        scoreId: playerData.scoreId || '',
        timestamp: playerData.timestamp || new Date().toISOString(),
        name: playerData.name || 'Unknown',
        firstName: (playerData.firstName || '').trim(),
        lastName: (playerData.lastName || '').trim(),
        id: playerData.id || '',
        totalScore: playerData.totalScore || 0,
        averageReactionTime: playerData.averageReactionTime || 0,
        bestReactionTime: playerData.bestReactionTime || 0,
        reactionTimes: playerData.reactionTimes || [],
        rounds: playerData.rounds || 5
      };

      const hasScoreId = !!nextEntry.scoreId;
      const existingIndex = hasScoreId
        ? scores.findIndex((entry) => entry.scoreId && entry.scoreId === nextEntry.scoreId)
        : -1;

      if (existingIndex >= 0) {
        scores[existingIndex] = { ...scores[existingIndex], ...nextEntry };
      } else {
        scores.push(nextEntry);
      }

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

  getOutboxEntries() {
    try {
      const data = localStorage.getItem(this.outboxKey);
      const entries = data ? JSON.parse(data) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      console.error('Error reading outbox from local storage:', error);
      return [];
    }
  }

  setOutboxEntries(entries) {
    try {
      localStorage.setItem(this.outboxKey, JSON.stringify(entries));
      return true;
    } catch (error) {
      console.error('Error writing outbox to local storage:', error);
      return false;
    }
  }

  enqueueScore(payload) {
    try {
      const scoreId = (payload && payload.scoreId) ? String(payload.scoreId) : '';
      if (!scoreId) return false;

      const entries = this.getOutboxEntries();
      const now = Date.now();
      const existingIndex = entries.findIndex((entry) => entry.scoreId === scoreId);

      if (existingIndex >= 0) {
        const existing = entries[existingIndex];
        if (existing.status === 'acked') {
          return true;
        }
        entries[existingIndex] = {
          ...existing,
          payload,
          status: 'pending',
          nextRetryAt: Math.min(existing.nextRetryAt || now, now)
        };
      } else {
        entries.push({
          scoreId,
          payload,
          status: 'pending',
          retryCount: 0,
          lastAttemptAt: null,
          nextRetryAt: now,
          lastError: ''
        });
      }

      return this.setOutboxEntries(entries);
    } catch (error) {
      console.error('Error enqueueing score:', error);
      return false;
    }
  }

  getPendingScores(now = Date.now()) {
    const entries = this.getOutboxEntries();
    return entries
      .filter((entry) => entry.status === 'pending' && (entry.nextRetryAt || 0) <= now)
      .sort((a, b) => {
        const aTime = a.nextRetryAt || 0;
        const bTime = b.nextRetryAt || 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.scoreId).localeCompare(String(b.scoreId));
      });
  }

  markOutboxAttempt(scoreId) {
    const entries = this.getOutboxEntries();
    const idx = entries.findIndex((entry) => entry.scoreId === scoreId);
    if (idx < 0) return false;
    entries[idx].lastAttemptAt = Date.now();
    return this.setOutboxEntries(entries);
  }

  markAcked(scoreId, serverTimestamp = '') {
    const entries = this.getOutboxEntries();
    const idx = entries.findIndex((entry) => entry.scoreId === scoreId);
    if (idx < 0) return false;
    entries[idx].status = 'acked';
    entries[idx].ackedAt = Date.now();
    entries[idx].serverTimestamp = serverTimestamp || '';
    entries[idx].lastError = '';
    return this.setOutboxEntries(entries);
  }

  scheduleRetry(scoreId, errorMessage = 'sync_failed') {
    const entries = this.getOutboxEntries();
    const idx = entries.findIndex((entry) => entry.scoreId === scoreId);
    if (idx < 0) return false;

    const currentRetry = Number(entries[idx].retryCount) || 0;
    const nextRetry = currentRetry + 1;
    const delayIdx = Math.min(nextRetry - 1, this.retryBackoffMs.length - 1);
    const delayMs = this.retryBackoffMs[delayIdx];

    entries[idx].status = 'pending';
    entries[idx].retryCount = nextRetry;
    entries[idx].lastError = String(errorMessage || 'sync_failed');
    entries[idx].nextRetryAt = Date.now() + delayMs;
    return this.setOutboxEntries(entries);
  }

  hasPendingScores() {
    const entries = this.getOutboxEntries();
    return entries.some((entry) => entry.status === 'pending');
  }

  isScorePending(scoreId) {
    if (!scoreId) return false;
    const entries = this.getOutboxEntries();
    const found = entries.find((entry) => entry.scoreId === scoreId);
    return !!found && found.status === 'pending';
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

  getCachedRemoteLeaderboard(limit = 10) {
    try {
      const raw = localStorage.getItem(this.remoteLeaderboardCacheKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed && parsed.leaderboard) ? parsed.leaderboard : [];
      const normalized = rows
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          rank: Number(entry.rank) || 0,
          timestamp: entry.timestamp || '',
          name: entry.name || 'Unknown',
          score: Number(entry.score) || 0,
          avgReaction: Number(entry.avgReaction) || 0,
          bestReaction: Number(entry.bestReaction) || 0
        }));

      if (!Number.isFinite(limit) || limit <= 0) {
        return normalized;
      }
      return normalized.slice(0, limit);
    } catch (error) {
      console.error('Error reading remote leaderboard cache:', error);
      return [];
    }
  }

  setCachedRemoteLeaderboard(leaderboard) {
    try {
      const rows = Array.isArray(leaderboard) ? leaderboard : [];
      const payload = {
        updatedAt: new Date().toISOString(),
        leaderboard: rows
      };
      localStorage.setItem(this.remoteLeaderboardCacheKey, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('Error writing remote leaderboard cache:', error);
      return false;
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
      localStorage.removeItem(this.outboxKey);
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
    const outbox = this.getOutboxEntries();
    return {
      totalEntries: scores.length,
      pendingSyncEntries: outbox.filter((entry) => entry.status === 'pending').length,
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
