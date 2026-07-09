const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'crm.db'));
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

module.exports = db;
