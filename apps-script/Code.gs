/**
 * Firefly Reaction Speed Game - Google Apps Script endpoint.
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Set Script Property:
 * - FIREFLY_SHARED_TOKEN=<same token as frontend config>
 */

const SHEET_NAME = 'Scores';
const SOURCE_VALUE = 'reaction-speed-game';
const MAX_REACTION_TIMES = 200;
const MAX_NAME_LENGTH = 60;
const MAX_FIRST_NAME_LENGTH = 40;
const MAX_LAST_NAME_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;
const MAX_COMPANY_LENGTH = 80;
const HEADERS = [
  'scoreId',
  'timestamp',
  'sessionId',
  'name',
  'firstName',
  'lastName',
  'email',
  'company',
  'newsletterOptIn',
  'totalScore',
  'averageReactionTime',
  'bestReactionTime',
  'reactionTimesJson',
  'rounds',
  'source'
];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = String(body.token || getHeader(e, 'x-firefly-token') || '');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('FIREFLY_SHARED_TOKEN');
    if (!expectedToken || token !== expectedToken) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    const action = body.action;
    const payload = body.payload || {};

    ensureScoreSheetHeaders();

    if (action === 'submitScore') {
      return handleSubmitScore(payload);
    }
    if (action === 'getLeaderboard') {
      return handleGetLeaderboard(payload);
    }
    if (action === 'syncStatus') {
      return handleSyncStatus(payload);
    }
    if (action === 'seedFakeData') {
      return handleSeedFakeData(payload);
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || 'Internal error' });
  }
}

function handleSubmitScore(payload) {
  const scoreId = normalizeString(payload.scoreId, 128);
  const timestamp = normalizeTimestamp(payload.timestamp);
  const sessionId = normalizeString(payload.sessionId, 128);
  const firstNameRaw = normalizeString(payload.firstName, MAX_FIRST_NAME_LENGTH);
  const lastNameRaw = normalizeString(payload.lastName, MAX_LAST_NAME_LENGTH);
  const fallbackName = normalizeString(payload.name, MAX_NAME_LENGTH);
  const firstName = firstNameRaw || getFirstNameFromFullName(fallbackName);
  const lastName = lastNameRaw || getLastNameFromFullName(fallbackName);
  const name = normalizeString((firstName + ' ' + lastName).trim() || fallbackName, MAX_NAME_LENGTH);
  const email = normalizeEmail(payload.email);
  const company = normalizeString(payload.company, MAX_COMPANY_LENGTH);
  const newsletterOptIn = normalizeConsent(payload.newsletterOptIn);
  const totalScore = toNumber(payload.totalScore);
  const averageReactionTime = toNumber(payload.averageReactionTime);
  const bestReactionTime = toNumber(payload.bestReactionTime);
  const reactionTimes = normalizeReactionTimes(payload.reactionTimes);
  const rounds = toInt(payload.rounds);

  if (!scoreId || !timestamp || !name || !email) {
    return jsonResponse({ ok: false, error: 'Missing required fields' });
  }

  const sheet = getScoresSheet();
  const header = getHeaderRow(sheet);
  const scoreIdCol = getColumnIndex(header, 'scoreid', 0) + 1;

  if (scoreExists(sheet, scoreIdCol, scoreId)) {
    return jsonResponse({
      ok: true,
      status: 'duplicate',
      scoreId,
      serverTimestamp: new Date().toISOString()
    });
  }

  const row = new Array(Math.max(sheet.getLastColumn(), HEADERS.length)).fill('');
  const colMap = getColumnMap(header);
  row[colMap.scoreId] = scoreId;
  row[colMap.timestamp] = timestamp;
  row[colMap.sessionId] = sessionId;
  row[colMap.name] = name;
  row[colMap.firstName] = firstName;
  row[colMap.lastName] = lastName;
  row[colMap.email] = email;
  row[colMap.company] = company;
  row[colMap.newsletterOptIn] = newsletterOptIn;
  row[colMap.totalScore] = totalScore;
  row[colMap.averageReactionTime] = averageReactionTime;
  row[colMap.bestReactionTime] = bestReactionTime;
  row[colMap.reactionTimesJson] = JSON.stringify(reactionTimes);
  row[colMap.rounds] = rounds;
  row[colMap.source] = SOURCE_VALUE;

  sheet.appendRow(row);

  return jsonResponse({
    ok: true,
    status: 'inserted',
    scoreId,
    serverTimestamp: new Date().toISOString()
  });
}

function handleGetLeaderboard(payload) {
  const limitRaw = toInt(payload.limit);
  const limit = Math.max(1, Math.min(5000, limitRaw || 1000));
  const sheet = getLeaderboardSheet(payload);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return jsonResponse({ ok: true, leaderboard: [] });
  }

  const header = values[0].map(function (v) { return String(v || '').trim().toLowerCase(); });
  const colMap = getColumnMap(header);

  const rows = values.slice(1);
  const sorted = rows
    .map(function (row) {
      return {
        timestamp: row[colMap.timestamp] || '',
        name: row[colMap.name] || 'Unknown',
        score: toNumber(row[colMap.totalScore]),
        avgReaction: toNumber(row[colMap.averageReactionTime]),
        bestReaction: toNumber(row[colMap.bestReactionTime])
      };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, limit)
    .map(function (entry, index) {
      return {
        rank: index + 1,
        timestamp: entry.timestamp,
        name: entry.name,
        score: entry.score,
        avgReaction: entry.avgReaction,
        bestReaction: entry.bestReaction
      };
    });

  return jsonResponse({ ok: true, leaderboard: sorted });
}

function getLeaderboardSheet(payload) {
  const requested = normalizeString(payload && payload.table, 64).toLowerCase();
  if (requested === 'fake') {
    const fake = getSheetByName('Scores_Fake');
    if (fake) return fake;
  }

  const scores = getScoresSheet();
  if (scores.getLastRow() > 1) {
    return scores;
  }

  const fakeFallback = getSheetByName('Scores_Fake');
  if (fakeFallback && fakeFallback.getLastRow() > 1) {
    return fakeFallback;
  }

  return scores;
}

function handleSyncStatus(payload) {
  const requested = Array.isArray(payload.scoreIds) ? payload.scoreIds : [];
  if (requested.length === 0) {
    return jsonResponse({ ok: true, ackedScoreIds: [] });
  }

  const normalizedRequested = requested
    .map(function (id) { return normalizeString(id, 128); })
    .filter(function (id) { return !!id; });

  if (normalizedRequested.length === 0) {
    return jsonResponse({ ok: true, ackedScoreIds: [] });
  }

  const sheet = getScoresSheet();
  const header = getHeaderRow(sheet);
  const scoreIdCol = getColumnIndex(header, 'scoreid', 0) + 1;
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return jsonResponse({ ok: true, ackedScoreIds: [] });
  }

  const values = sheet.getRange(2, scoreIdCol, lastRow - 1, 1).getValues();
  const existing = {};
  values.forEach(function (row) {
    const id = normalizeString(row[0], 128);
    if (id) existing[id] = true;
  });

  const acked = normalizedRequested.filter(function (id) {
    return !!existing[id];
  });

  return jsonResponse({ ok: true, ackedScoreIds: acked });
}

function handleSeedFakeData(payload) {
  const count = Math.max(10, Math.min(500, toInt(payload.count || 120)));
  const target = normalizeString(payload.target, 64).toLowerCase();

  if (target === 'scores') {
    seedScoresWithFakeData(count);
    return jsonResponse({ ok: true, status: 'seeded_scores', count: count });
  }

  seedFakeLeaderboardTable(count);
  return jsonResponse({ ok: true, status: 'seeded_fake_table', count: count, sheetName: 'Scores_Fake' });
}

function seedFakeLeaderboardTable(count) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Scores_Fake';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.appendRow(HEADERS);

  const rows = generateFakeRows(count);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
}

function seedScoresWithFakeData(count) {
  ensureScoreSheetHeaders();
  const sheet = getScoresSheet();
  const header = getHeaderRow(sheet);
  const colMap = getColumnMap(header);
  const rows = generateFakeRows(count);
  if (rows.length === 0) return;

  const maxCols = Math.max(sheet.getLastColumn(), HEADERS.length);
  const out = rows.map(function (fakeRow) {
    const row = new Array(maxCols).fill('');
    row[colMap.scoreId] = fakeRow[0];
    row[colMap.timestamp] = fakeRow[1];
    row[colMap.sessionId] = fakeRow[2];
    row[colMap.name] = fakeRow[3];
    row[colMap.firstName] = fakeRow[4];
    row[colMap.lastName] = fakeRow[5];
    row[colMap.email] = fakeRow[6];
    row[colMap.company] = fakeRow[7];
    row[colMap.newsletterOptIn] = fakeRow[8];
    row[colMap.totalScore] = fakeRow[9];
    row[colMap.averageReactionTime] = fakeRow[10];
    row[colMap.bestReactionTime] = fakeRow[11];
    row[colMap.reactionTimesJson] = fakeRow[12];
    row[colMap.rounds] = fakeRow[13];
    row[colMap.source] = fakeRow[14];
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, maxCols).setValues(out);
}

function generateFakeRows(count) {
  var firstNames = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Hayden', 'Skyler'];
  var lastNames = ['Lee', 'Chen', 'Patel', 'Nguyen', 'Garcia', 'Kim', 'Johnson', 'Brown', 'Miller', 'Davis'];
  var companies = ['Firefly Labs', 'NovaTech', 'BlueOrbit', 'Peak Systems', 'BrightOps', 'Vertex AI', 'Orbitron', 'Pinecone', 'Luma', 'Aster'];

  var rows = [];
  for (var i = 0; i < count; i += 1) {
    var first = firstNames[i % firstNames.length];
    var last = lastNames[(i * 3) % lastNames.length];
    var name = first + ' ' + last;
    var email = (first + '.' + last + (i + 1) + '@example.com').toLowerCase();
    var company = companies[(i * 7) % companies.length];
    var score = Math.max(500, 18000 - (i * 97));
    var avg = Number((0.18 + ((i % 17) * 0.012)).toFixed(3));
    var best = Number(Math.max(0.11, avg - 0.06).toFixed(3));
    var now = new Date();
    now.setMinutes(now.getMinutes() - i);
    var timestamp = now.toISOString();
    var scoreId = 'fake_score_' + (i + 1);
    var sessionId = 'fake_session_' + (i + 1);
    var rounds = 25;
    var reactionTimes = [best, avg, Number((avg + 0.04).toFixed(3))];

    rows.push([
      scoreId,
      timestamp,
      sessionId,
      name,
      first,
      last,
      email,
      company,
      (i % 3 === 0) ? 'Yes' : 'No',
      score,
      avg,
      best,
      JSON.stringify(reactionTimes),
      rounds,
      'fake_seed'
    ]);
  }
  return rows;
}

function ensureScoreSheetHeaders() {
  const sheet = getScoresSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }

  let header = getHeaderRow(sheet);
  if (getColumnIndex(header, 'scoreid', -1) === -1) {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue('scoreId');
    header = getHeaderRow(sheet);
  }

  if (sheet.getLastColumn() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), HEADERS.length - sheet.getLastColumn());
  }

  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  for (var i = 0; i < HEADERS.length; i += 1) {
    const currentValue = String(current[i] || '').trim();
    if (!currentValue) {
      sheet.getRange(1, i + 1).setValue(HEADERS[i]);
    }
  }
}

function getHeaderRow(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map(function (v) { return String(v || '').trim().toLowerCase(); });
}

function getColumnMap(header) {
  return {
    scoreId: getColumnIndex(header, 'scoreid', 0),
    timestamp: getColumnIndex(header, 'timestamp', 1),
    sessionId: getColumnIndex(header, 'sessionid', 2),
    name: getColumnIndex(header, 'name', 3),
    firstName: getColumnIndex(header, 'firstname', 4),
    lastName: getColumnIndex(header, 'lastname', 5),
    email: getColumnIndex(header, 'email', 6),
    company: getColumnIndex(header, 'company', 7),
    newsletterOptIn: getColumnIndex(header, 'newsletteroptin', 8),
    totalScore: getColumnIndex(header, 'totalscore', 9),
    averageReactionTime: getColumnIndex(header, 'averagereactiontime', 10),
    bestReactionTime: getColumnIndex(header, 'bestreactiontime', 11),
    reactionTimesJson: getColumnIndex(header, 'reactiontimesjson', 12),
    rounds: getColumnIndex(header, 'rounds', 13),
    source: getColumnIndex(header, 'source', 14)
  };
}

function getFirstNameFromFullName(fullName) {
  var cleaned = normalizeString(fullName, MAX_NAME_LENGTH);
  if (!cleaned) return '';
  var parts = cleaned.split(/\s+/);
  return normalizeString(parts[0] || '', MAX_FIRST_NAME_LENGTH);
}

function getLastNameFromFullName(fullName) {
  var cleaned = normalizeString(fullName, MAX_NAME_LENGTH);
  if (!cleaned) return '';
  var parts = cleaned.split(/\s+/);
  if (parts.length < 2) return '';
  return normalizeString(parts.slice(1).join(' '), MAX_LAST_NAME_LENGTH);
}

function getColumnIndex(header, key, fallback) {
  const idx = header.indexOf(String(key || '').toLowerCase());
  return idx >= 0 ? idx : fallback;
}

function scoreExists(sheet, scoreIdCol, scoreId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const values = sheet.getRange(2, scoreIdCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === scoreId) {
      return true;
    }
  }
  return false;
}

function getScoresSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function getSheetByName(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function normalizeConsent(value) {
  const text = String(value || '').toLowerCase();
  if (value === true || text === 'yes' || text === 'true' || text === '1') {
    return 'Yes';
  }
  return 'No';
}

function normalizeEmail(value) {
  const email = normalizeString(value, MAX_EMAIL_LENGTH).toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return valid ? email : '';
}

function normalizeString(value, maxLength) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}

function normalizeTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (isNaN(date.getTime())) return '';
  return date.toISOString();
}

function normalizeReactionTimes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_REACTION_TIMES)
    .map(function (v) { return toNumber(v); })
    .filter(function (v) { return v >= 0; });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getHeader(e, headerName) {
  const lower = String(headerName || '').toLowerCase();
  const headers = (e && e.headers) || {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
      return String(headers[key] || '');
    }
  }
  return '';
}
