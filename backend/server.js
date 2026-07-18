const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const db = require('./db');
const { fireReminderForContact } = require('./notifications');
const { verifyTeamsToken } = require('./auth');

const app = express();

app.use(cors({ origin: 'https://cmp-sales.vercel.app' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

function serializeContact(row) {
  return row;
}

// ---------------------------------------------------------------------------
// GET /api/me
// ---------------------------------------------------------------------------
app.get('/api/me', verifyTeamsToken, (req, res) => {
  res.json(req.teamsUser);
});

// ---------------------------------------------------------------------------
// GET /api/contacts  (list, with optional filters)
// ---------------------------------------------------------------------------
app.get('/api/contacts', verifyTeamsToken, (req, res) => {
  const { q, temperature, overdue, lastContactedBy } = req.query;
  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (temperature) {
    sql += ' AND temperature = ?';
    params.push(temperature);
  }
  if (overdue === 'true') {
    sql += ' AND nextReminderAt IS NOT NULL AND nextReminderAt <= ?';
    params.push(new Date().toISOString());
  }
  if (lastContactedBy) {
    sql += ' AND lastContactedBy = ?';
    params.push(lastContactedBy);
  }
  sql += ' ORDER BY name COLLATE NOCASE ASC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(serializeContact));
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id  (with interaction history)
// ---------------------------------------------------------------------------
app.get('/api/contacts/:id', verifyTeamsToken, (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const interactions = db
    .prepare('SELECT * FROM interactions WHERE contactId = ? ORDER BY occurredAt DESC')
    .all(req.params.id);

  res.json({ ...contact, interactions });
});

// ---------------------------------------------------------------------------
// POST /api/contacts  (create)
// ---------------------------------------------------------------------------
app.post('/api/contacts', verifyTeamsToken, (req, res) => {
  const {
    name, company, role, email, phone, birthday,
    howYouKnowThem, referralSource, temperature, recurrenceDays,
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO contacts
      (id, name, company, role, email, phone, birthday, howYouKnowThem, referralSource,
       temperature, recurrenceDays, lastContactedBy, lastContactedByEmail, lastContactedAt,
       nextReminderAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)
  `).run(
    id, name.trim(), company || null, role || null, email || null, phone || null,
    birthday || null, howYouKnowThem || null, referralSource || null,
    temperature || 'Warm', recurrenceDays || 90, now
  );

  const created = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// PUT /api/contacts/:id  (edit core fields)
// ---------------------------------------------------------------------------
app.put('/api/contacts/:id', verifyTeamsToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const fields = ['name', 'company', 'role', 'email', 'phone', 'birthday',
    'howYouKnowThem', 'referralSource', 'temperature', 'recurrenceDays'];
  const updates = {};
  fields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  if (setClause) {
    db.prepare(`UPDATE contacts SET ${setClause} WHERE id = ?`)
      .run(...Object.values(updates), req.params.id);
  }

  if (updates.recurrenceDays && existing.lastContactedAt) {
    const nextReminderAt = addDays(existing.lastContactedAt, updates.recurrenceDays);
    db.prepare('UPDATE contacts SET nextReminderAt = ? WHERE id = ?').run(nextReminderAt, req.params.id);
  }

  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id
// ---------------------------------------------------------------------------
app.delete('/api/contacts/:id', verifyTeamsToken, (req, res) => {
  db.prepare('DELETE FROM interactions WHERE contactId = ?').run(req.params.id);
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /api/contacts/:id/interactions
// ---------------------------------------------------------------------------
app.post('/api/contacts/:id/interactions', verifyTeamsToken, (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { type, note, occurredAt } = req.body;
  const authorName = req.teamsUser.name;
  const authorEmail = req.teamsUser.email;

  if (!authorName || !type) {
    return res.status(400).json({ error: 'authorName and type are required' });
  }

  const id = crypto.randomUUID();
  const when = occurredAt || new Date().toISOString();

  db.prepare(`
    INSERT INTO interactions (id, contactId, authorName, authorEmail, type, note, occurredAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, authorName, authorEmail || null, type, note || null, when);

  const nextReminderAt = addDays(when, contact.recurrenceDays || 90);

  db.prepare(`
    UPDATE contacts
    SET lastContactedBy = ?, lastContactedByEmail = ?, lastContactedAt = ?, nextReminderAt = ?
    WHERE id = ?
  `).run(authorName, authorEmail || null, when, nextReminderAt, req.params.id);

  const updatedContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.status(201).json(updatedContact);
});

// ---------------------------------------------------------------------------
// PUT /api/interactions/:id — edit a previously logged interaction's note/type.
// ---------------------------------------------------------------------------
app.put('/api/interactions/:id', verifyTeamsToken, (req, res) => {
  const interaction = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
  if (!interaction) return res.status(404).json({ error: 'Interaction not found' });

  const { type, note } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE interactions
    SET type = ?, note = ?, editedAt = ?
    WHERE id = ?
  `).run(
    type || interaction.type,
    note !== undefined ? note : interaction.note,
    now,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// GET /api/reps
// ---------------------------------------------------------------------------
app.get('/api/reps', verifyTeamsToken, (req, res) => {
  const rows = db.prepare(`
    SELECT authorName as name, authorEmail as email, COUNT(*) as totalInteractions, MAX(occurredAt) as lastActive
    FROM interactions
    GROUP BY authorName, authorEmail
    ORDER BY authorName COLLATE NOCASE ASC
  `).all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /api/activity/summary?range=week|month
// ---------------------------------------------------------------------------
app.get('/api/activity/summary', verifyTeamsToken, (req, res) => {
  const range = req.query.range === 'month' ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - range);
  const sinceIso = since.toISOString();

  const perRep = db.prepare(`
    SELECT authorName as name, authorEmail as email, COUNT(*) as touchpoints
    FROM interactions
    WHERE occurredAt >= ?
    GROUP BY authorName, authorEmail
    ORDER BY touchpoints DESC
  `).all(sinceIso);

  const perType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM interactions
    WHERE occurredAt >= ?
    GROUP BY type
    ORDER BY count DESC
  `).all(sinceIso);

  const recent = db.prepare(`
    SELECT i.id, i.authorName, i.type, i.note, i.occurredAt, c.name as contactName, c.id as contactId
    FROM interactions i
    JOIN contacts c ON c.id = i.contactId
    WHERE i.occurredAt >= ?
    ORDER BY i.occurredAt DESC
    LIMIT 25
  `).all(sinceIso);

  const totalTouchpoints = perRep.reduce((sum, r) => sum + r.touchpoints, 0);

  res.json({
    rangeDays: range,
    since: sinceIso,
    totalTouchpoints,
    perRep,
    perType,
    recent,
  });
});

// ---------------------------------------------------------------------------
// GET /api/reminders/due
// ---------------------------------------------------------------------------
app.get('/api/reminders/due', verifyTeamsToken, (req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare(
    'SELECT * FROM contacts WHERE nextReminderAt IS NOT NULL AND nextReminderAt <= ? ORDER BY nextReminderAt ASC'
  ).all(now);
  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /api/birthdays/upcoming?withinDays=30
// ---------------------------------------------------------------------------
app.get('/api/birthdays/upcoming', verifyTeamsToken, (req, res) => {
  const withinDays = Number(req.query.withinDays || 30);
  const rows = db.prepare("SELECT * FROM contacts WHERE birthday IS NOT NULL AND birthday != ''").all();

  const today = new Date();
  const upcoming = rows
    .map((c) => {
      const [mm, dd] = c.birthday.split('-').map(Number);
      let next = new Date(today.getFullYear(), mm - 1, dd);
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysAway = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
      return { ...c, daysAway };
    })
    .filter((c) => c.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway);

  res.json(upcoming);
});

// ---------------------------------------------------------------------------
// Manual reminder sweep trigger.
// ---------------------------------------------------------------------------
app.post('/api/reminders/run-now', async (req, res) => {
  const results = await runReminderSweep();
  res.json(results);
});

async function runReminderSweep() {
  const now = new Date().toISOString();
  const due = db.prepare(
    'SELECT * FROM contacts WHERE nextReminderAt IS NOT NULL AND nextReminderAt <= ?'
  ).all(now);

  const results = [];
  for (const contact of due) {
    const r = await fireReminderForContact(contact);
    results.push({ contact: contact.name, results: r });
  }
  return results;
}

cron.schedule('0 8 * * *', () => {
  runReminderSweep().catch((err) => console.error('Reminder sweep failed:', err));
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Relationship CRM API listening on port ${PORT}`);
});
