const CONFIG = {
  googleSheets: {
    apiKey: '',
    clientId: '',
    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    spreadsheetId: '',
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
  },
  game: {
    rounds: 5,
    minReactionTime: 0.1,
    maxReactionTime: 3.0,
    comboThreshold: 0.3,
    minWaitTime: 1.0,
    maxWaitTime: 5.0,
    idleTimeout: 20000,
    idleWarningThresholdSeconds: 20,
    idleWarningCountdownSeconds: 20,
    leaderboardCountdownEnabled: true,
    leaderboardCountdownSeconds: 20
  }
};
