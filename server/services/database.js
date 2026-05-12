const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const eventBus = require('./eventBus');

const dbPath = path.join(__dirname, '../data/transcripts.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err);
    return;
  }

  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      duration REAL NOT NULL,
      transcript TEXT NOT NULL,
      segment_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function insertTranscript({
  id,
  timestamp,
  duration,
  transcript,
  segmentUrl,
}) {
  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO transcripts (
          id,
          timestamp,
          duration,
          transcript,
          segment_url
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [id, timestamp, duration, transcript, segmentUrl],
      (err) => {
        if (err) {
          console.error('Failed to insert transcript:', err);
          return reject(err);
        }

        console.log(`Saved transcript ${id}`);
        resolve();
      }
    );
  });
}

function getTranscripts({ from, to, limit = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push(`timestamp >= ?`);
      params.push(from);
    }

    if (to) {
      conditions.push(`timestamp <= ?`);
      params.push(to);
    }

    let query = `SELECT * FROM transcripts`;

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY timestamp ASC LIMIT ?`;
    params.push(limit);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Failed to query transcripts:', err);
        return reject(err);
      }

      resolve(rows);
    });
  });
}

eventBus.onTranscript((event) => {
  const {
    id,
    timestamp,
    duration,
    transcript,
    segmentUrl,
  } = event;
  
  insertTranscript({
    id: event.id,
    timestamp: event.timestamp,
    duration: event.duration,
    transcript: event.transcript,
    segmentUrl: event.segmentUrl,
  }).catch((err) => {
    console.error('Failed to insert transcript:', err);
  });
});

module.exports = {
  db,
  insertTranscript,
  getTranscripts,
};