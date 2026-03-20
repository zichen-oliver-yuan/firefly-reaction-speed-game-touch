/** Apps Script API client for leaderboard and player data. */

class SheetsClient {
  constructor() {
    this.initialized = false;
    this.config = CONFIG.googleSheets || {};
    this.timeoutMs = this.config.timeoutMs || 6000;
    this.leaderboardTimeoutMs = this.config.leaderboardTimeoutMs || this.timeoutMs;
    this.warnCooldownMs = 30000;
    this.lastWarnByKey = new Map();
  }

  warnWithCooldown(key, ...args) {
    const now = Date.now();
    const last = this.lastWarnByKey.get(key) || 0;
    if (now - last < this.warnCooldownMs) return;
    this.lastWarnByKey.set(key, now);
    console.warn(...args);
  }

  /**
   * Initialize Apps Script client.
   * @returns {Promise<void>} Promise that resolves after configuration check
   */
  async init() {
    if (this.initialized) {
      return Promise.resolve();
    }

    if (!this.config.appsScriptUrl) {
      console.log('Apps Script endpoint not configured - skipping initialization');
      return Promise.resolve();
    }

    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Make a request to the Apps Script endpoint.
   * @param {string} action - Endpoint action
   * @param {object} payload - Request payload
   * @returns {Promise<object|null>} Parsed response or null on failure
   */
  async request(action, payload = {}) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.initialized || !this.config.appsScriptUrl) {
      return null;
    }

    const controller = new AbortController();
    const timeoutMs = action === 'getLeaderboard' ? this.leaderboardTimeoutMs : this.timeoutMs;
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.config.appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action,
          payload,
          token: this.config.sharedToken || ''
        }),
        signal: controller.signal
      });

      const data = await response.json();
      if (!response.ok || !data || data.ok !== true) {
        this.warnWithCooldown(`bad_response:${action}`, 'Apps Script request failed:', action, data);
        return null;
      }
      return data;
    } catch (error) {
      const reason = error && error.name === 'AbortError' ? 'timed out' : error.message;
      this.warnWithCooldown(`request_error:${action}:${reason}`, `Apps Script request ${action} failed:`, reason);
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Save player score to Apps Script / Google Sheets.
   * @param {object} playerData - Player submission payload
   * @returns {Promise<object|null>} API response
   */
  async savePlayerScore(playerData) {
    const payload = {
      scoreId: playerData.scoreId || '',
      timestamp: playerData.timestamp || new Date().toISOString(),
      sessionId: playerData.sessionId || playerData.id || '',
      name: playerData.name || 'Unknown',
      firstName: (playerData.firstName || '').trim(),
      lastName: (playerData.lastName || '').trim(),
      totalScore: Number(playerData.totalScore) || 0,
      averageReactionTime: Number(playerData.averageReactionTime) || 0,
      bestReactionTime: Number(playerData.bestReactionTime) || 0,
      reactionTimes: Array.isArray(playerData.reactionTimes) ? playerData.reactionTimes : [],
      rounds: Number(playerData.rounds) || 0
    };

    const response = await this.request('submitScore', payload);
    if (!response) return null;

    // Backward compatibility: older Apps Script returned only { ok: true }.
    if (!response.status) {
      return {
        ...response,
        status: 'inserted',
        scoreId: payload.scoreId || '',
        serverTimestamp: payload.timestamp
      };
    }

    return response;
  }

  async syncStatus(scoreIds = []) {
    const response = await this.request('syncStatus', { scoreIds });
    if (!response || !Array.isArray(response.ackedScoreIds)) {
      return [];
    }
    return response.ackedScoreIds;
  }

  /**
   * Get leaderboard data from Apps Script / Google Sheets.
   * @param {number} limit - Number of top scores to retrieve
   * @returns {Promise<Array>} Leaderboard rows
   */
  async getLeaderboard(limit = 10) {
    let response = await this.request('getLeaderboard', { limit });
    if (!response) {
      response = await this.request('getLeaderboard', { limit });
    }
    const leaderboard = (response && Array.isArray(response.leaderboard))
      ? response.leaderboard : [];
    const globalAvgReactionSec = (response && response.globalAvgReactionSec > 0)
      ? response.globalAvgReactionSec : 0;
    return { leaderboard, globalAvgReactionSec };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SheetsClient;
}
