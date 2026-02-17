/** Google Sheets API client for leaderboard and player data. */

class SheetsClient {
  constructor() {
    this.initialized = false;
    this.signedIn = false;
    this.config = CONFIG.googleSheets;
  }

  /**
   * Initialize Google Sheets API.
   * @returns {Promise} Promise that resolves when API is loaded
   */
  async init() {
    if (this.initialized) {
      return Promise.resolve();
    }

    // Check if credentials are configured
    if (!this.config.apiKey || !this.config.clientId || !this.config.spreadsheetId) {
      console.log('Google Sheets API not configured - skipping initialization');
      return Promise.resolve(); // Resolve without error to allow game to continue
    }

    return new Promise((resolve, reject) => {
      // Load Google API client library
      if (typeof gapi === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          if (typeof gapi !== 'undefined') {
            gapi.load('client:auth2', () => {
              this.initializeGapi(resolve, reject);
            });
          } else {
            console.warn('Google API library failed to load');
            resolve(); // Resolve without error
          }
        };
        script.onerror = () => {
          console.warn('Failed to load Google API script - game will continue without Sheets integration');
          resolve(); // Resolve without error to allow game to continue
        };
        document.head.appendChild(script);
      } else {
        gapi.load('client:auth2', () => {
          this.initializeGapi(resolve, reject);
        });
      }
    });
  }

  /**
   * Initialize Google API client.
   */
  async initializeGapi(resolve, reject) {
    try {
      // Double-check credentials before initializing
      if (!this.config.apiKey || !this.config.clientId) {
        console.warn('Google Sheets API credentials missing - skipping initialization');
        resolve(); // Resolve without error
        return;
      }

      await gapi.client.init({
        apiKey: this.config.apiKey,
        clientId: this.config.clientId,
        discoveryDocs: this.config.discoveryDocs,
        scope: this.config.scopes
      });

      this.initialized = true;
      console.log('Google Sheets API initialized');
      resolve();
    } catch (error) {
      console.warn('Error initializing Google API (game will continue without Sheets):', error.message);
      // Resolve instead of reject to allow game to continue
      resolve();
    }
  }

  /**
   * Sign in to Google (required for write operations).
   * @returns {Promise} Promise that resolves when signed in
   */
  async signIn() {
    if (!this.initialized) {
      await this.init();
    }

    // Check if API is available
    if (!this.initialized || typeof gapi === 'undefined') {
      console.warn('Google Sheets API not available - cannot sign in');
      return Promise.resolve();
    }

    try {
      const authInstance = gapi.auth2.getAuthInstance();
      const user = await authInstance.signIn();
      this.signedIn = true;
      console.log('Signed in to Google:', user.getBasicProfile().getName());
      return user;
    } catch (error) {
      console.warn('Error signing in to Google:', error.message);
      // Don't throw - allow game to continue
      return Promise.resolve();
    }
  }

  /**
   * Check if user is signed in.
   * @returns {boolean} True if signed in
   */
  isSignedIn() {
    if (!this.initialized || typeof gapi === 'undefined') {
      return false;
    }

    try {
      const authInstance = gapi.auth2.getAuthInstance();
      return authInstance.isSignedIn.get();
    } catch (error) {
      return false;
    }
  }

  /**
   * Save player score to Google Sheets.
   * @param {object} playerData - Player data {name, id, score, reactionTimes, timestamp}
   * @returns {Promise} Promise that resolves when data is saved
   */
  async savePlayerScore(playerData) {
    // Check if API is configured and initialized
    if (!this.initialized || !this.config.apiKey || !this.config.spreadsheetId) {
      console.log('Google Sheets API not configured - score not saved');
      return Promise.resolve(); // Resolve without error
    }

    if (!this.isSignedIn()) {
      try {
        await this.signIn();
      } catch (error) {
        console.warn('Failed to sign in to Google Sheets - score not saved:', error.message);
        return Promise.resolve(); // Resolve without error
      }
    }

    try {
      const values = [[
        playerData.timestamp || new Date().toISOString(),
        playerData.name || 'Unknown',
        playerData.id || '',
        playerData.totalScore || 0,
        playerData.averageReactionTime || 0,
        playerData.bestReactionTime || 0,
        JSON.stringify(playerData.reactionTimes || [])
      ]];

      const response = await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: 'Scores!A:G', // Adjust range as needed
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      });

      console.log('Score saved to Google Sheets:', response);
      return response;
    } catch (error) {
      console.warn('Error saving score to Google Sheets (game continues):', error.message);
      // Don't throw - allow game to continue
      return Promise.resolve();
    }
  }

  /**
   * Get leaderboard data from Google Sheets.
   * @param {number} limit - Number of top scores to retrieve
   * @returns {Promise} Promise that resolves with leaderboard data
   */
  async getLeaderboard(limit = 10) {
    // Check if API is configured and initialized
    if (!this.initialized || !this.config.apiKey || !this.config.spreadsheetId) {
      console.log('Google Sheets API not configured - returning empty leaderboard');
      return [];
    }

    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: 'Scores!A:G' // Adjust range as needed
      });

      const rows = response.result.values || [];
      
      // Parse and sort by score (assuming score is in column D, index 3)
      const leaderboard = rows
        .slice(1) // Skip header row
        .map((row, index) => ({
          rank: index + 1,
          timestamp: row[0] || '',
          name: row[1] || 'Unknown',
          id: row[2] || '',
          score: parseFloat(row[3]) || 0,
          avgReaction: parseFloat(row[4]) || 0,
          bestReaction: parseFloat(row[5]) || 0
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return leaderboard;
    } catch (error) {
      console.warn('Error getting leaderboard (returning empty):', error.message);
      // Return empty leaderboard if API fails
      return [];
    }
  }

  /**
   * Update player name on leaderboard.
   * @param {string} playerId - Player ID
   * @param {string} newName - New player name
   * @returns {Promise} Promise that resolves when name is updated
   */
  async updatePlayerName(playerId, newName) {
    if (!this.isSignedIn()) {
      await this.signIn();
    }

    // This would require finding the row by ID and updating it
    // Implementation depends on your sheet structure
    console.log('Update player name:', playerId, newName);
    // TODO: Implement row update logic
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SheetsClient;
}
