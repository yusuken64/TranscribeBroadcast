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
      timestamp TEXT NOT NULL,
      duration REAL NOT NULL,
      transcript TEXT NOT NULL,
      segment_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

eventBus.onTranscript((event) => {
  const {
    id,
    timestamp,
    duration,
    transcript,
    segmentUrl,
  } = event;

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
    [
      id,
      timestamp,
      duration,
      transcript,
      segmentUrl,
    ],
    (err) => {
      if (err) {
        console.error('Failed to insert transcript:', err);
        return;
      }

      console.log(`Saved transcript ${id}`);
    }
  );
});

module.exports = db;