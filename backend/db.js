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

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer TEXT,              -- the GC / developer this project is for
  status TEXT DEFAULT 'Bidding', -- Bidding | Submitted | Won | Lost | Complete
  value REAL,                 -- dollar value (nullable)
  bidDueDate TEXT,            -- ISO date (nullable)
  notes TEXT,
  createdAt TEXT NOT NULL
);

-- Many-to-many link between projects and contacts. A contact can be on many
-- projects; a project has many contacts.
CREATE TABLE IF NOT EXISTS project_contacts (
  projectId TEXT NOT NULL,
  contactId TEXT NOT NULL,
  linkedAt TEXT NOT NULL,
  PRIMARY KEY (projectId, contactId),
  FOREIGN KEY (projectId) REFERENCES projects(id),
  FOREIGN KEY (contactId) REFERENCES contacts(id)
);

-- Chronological timeline for a project: auto-logged milestones (creation +
-- every status change) and manual dated notes reps add.
CREATE TABLE IF NOT EXISTS project_events (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'created' | 'status' | 'note'
  label TEXT,                  -- the status value for 'status' events; NULL otherwise
  note TEXT,                   -- text for 'note' events
  occurredAt TEXT NOT NULL,
  authorName TEXT,
  authorEmail TEXT,
  FOREIGN KEY (projectId) REFERENCES projects(id)
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

// Safe migration: add a "visibility" column to interactions. Everything logged
// today is fully shared, so existing rows default to 'shared'. The only value
// that narrows access is 'private', currently used exclusively for emails
// ingested via the inbound-email endpoint — those are visible only to their
// author and to executives. See permissions.js and the read filters in
// server.js (canViewInteraction).
const hasVisibility = interactionColumns.some((col) => col.name === 'visibility');
if (!hasVisibility) {
  db.exec("ALTER TABLE interactions ADD COLUMN visibility TEXT DEFAULT 'shared'");
}

// Safe migration: add a "projectId" column to interactions — the optional tag
// linking a touchpoint to a specific project. NULL = untagged. Set explicitly
// when a rep picks a project, or auto-set when the contact is linked to exactly
// one project. Drives the "Tagged to this project" feed view.
const hasProjectId = interactionColumns.some((col) => col.name === 'projectId');
if (!hasProjectId) {
  db.exec('ALTER TABLE interactions ADD COLUMN projectId TEXT');
}

// Safe migration: record who created a contact ("added by"). Existing rows
// predate this and stay NULL (shown as "—" in the UI) since that history was
// never captured. New contacts are stamped at creation. System-recorded and
// read-only — not user-editable.
const contactColumns = db.prepare("PRAGMA table_info(contacts)").all();
if (!contactColumns.some((col) => col.name === 'createdBy')) {
  db.exec('ALTER TABLE contacts ADD COLUMN createdBy TEXT');
}
if (!contactColumns.some((col) => col.name === 'createdByEmail')) {
  db.exec('ALTER TABLE contacts ADD COLUMN createdByEmail TEXT');
}

// Safe migration: record who created a project ("created by"). Same pattern as
// contacts — existing rows predate this and stay NULL (shown as "—"); new
// projects are stamped at creation. System-recorded, read-only (the project
// edit endpoint's field list excludes it).
const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
if (!projectColumns.some((col) => col.name === 'createdBy')) {
  db.exec('ALTER TABLE projects ADD COLUMN createdBy TEXT');
}
if (!projectColumns.some((col) => col.name === 'createdByEmail')) {
  db.exec('ALTER TABLE projects ADD COLUMN createdByEmail TEXT');
}

// Backfill: give every existing project a 'created' timeline event (using its
// createdAt / createdBy) if it doesn't already have one. Idempotent — the
// WHERE NOT EXISTS guard means this is a no-op on every boot after the first.
const crypto = require('crypto');
const projectsMissingCreated = db.prepare(`
  SELECT p.id, p.createdAt, p.createdBy, p.createdByEmail
  FROM projects p
  WHERE NOT EXISTS (
    SELECT 1 FROM project_events e WHERE e.projectId = p.id AND e.kind = 'created'
  )
`).all();
const insertCreatedEvent = db.prepare(`
  INSERT INTO project_events (id, projectId, kind, occurredAt, authorName, authorEmail)
  VALUES (?, ?, 'created', ?, ?, ?)
`);
for (const p of projectsMissingCreated) {
  insertCreatedEvent.run(
    crypto.randomUUID(), p.id, p.createdAt || new Date().toISOString(),
    p.createdBy || null, p.createdByEmail || null
  );
}

module.exports = db;
