const Database = require('better-sqlite3');
const path = require('path');

// In production, DB_PATH points at the persistent disk's mount path (e.g.
// /data/crm.db) so the database survives deploys and restarts. Locally, it
// falls back to a file right next to this script.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'crm.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// --- Schema ---------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  birthday TEXT,              -- stored as MM-DD
  howYouKnowThem TEXT,
  referralSource TEXT,
  temperature TEXT DEFAULT 'Warm',   -- Hot | Warm | Cold | Needs Follow-up
  recurrenceDays INTEGER DEFAULT 90, -- how often this relationship should be touched
  lastContactedBy TEXT,       -- display name of whoever logged the most recent interaction
  lastContactedByEmail TEXT,  -- email of that person (used for reminder delivery)
  lastContactedAt TEXT,       -- ISO date of most recent interaction
  nextReminderAt TEXT,        -- ISO date the next reminder is due
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,
  authorName TEXT NOT NULL,
  authorEmail TEXT,
  type TEXT NOT NULL,         -- call | email | coffee | event | message | other
  note TEXT,
  occurredAt TEXT NOT NULL,
  FOREIGN KEY (contactId) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS reminder_log (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,
  sentTo TEXT,
  channel TEXT,               -- teams | email | sms
  sentAt TEXT NOT NULL,
  FOREIGN KEY (contactId) REFERENCES contacts(id)
);
`);

// Safe migration: add an "editedAt" column to interactions if it doesn't
// already exist. Lets us track whether a logged interaction was edited after
// the fact, without breaking any database that was already running.
const interactionColumns = db.prepare("PRAGMA table_info(interactions)").all();
const hasEditedAt = interactionColumns.some((col) => col.name === 'editedAt');
if (!hasEditedAt) {
  db.exec('ALTER TABLE interactions ADD COLUMN editedAt TEXT');
}

module.exports = db;
