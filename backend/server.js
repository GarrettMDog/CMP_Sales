const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const db = require('./db');
const { fireReminderForContact } = require('./notifications');
const { verifyTeamsToken } = require('./auth');
const { isExecutive, isAdmin } = require('./permissions');
const graph = require('./graph');

const app = express();

app.use(cors({ origin: 'https://cmp-sales.vercel.app' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- Inbound-email config (all via environment variables) ------------------
// Mail is PULLED from a shared Microsoft 365 mailbox via Graph (see graph.js),
// not pushed by a webhook — so there's no public endpoint or shared secret.
// COMPANY_DOMAIN — your email domain (e.g. cmpconcrete.com). Addresses here are
//                  treated as internal reps, never as contacts to match.
// LOG_MAILBOX    — the shared mailbox reps CC/BCC/forward to (e.g.
//                  crm-log@cmpconcrete.com), so it's never mistaken for a contact.
const COMPANY_DOMAIN = (process.env.COMPANY_DOMAIN || '').toLowerCase();
const LOG_MAILBOX = (process.env.LOG_MAILBOX || '').toLowerCase();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

// Decide which project a new touchpoint should be tagged to.
//  - If the caller passed an explicit projectId, use it (rep's choice wins).
//  - Otherwise auto-tag ONLY when the contact is linked to exactly one project
//    (unambiguous). 0 or 2+ linked projects → leave untagged (NULL).
// This is what keeps tagging friction-free where it's obvious and human-decided
// where it's ambiguous. Applies to both manual logs and auto-logged emails.
function resolveProjectId(contactId, explicitProjectId) {
  if (explicitProjectId) return explicitProjectId;
  const links = db
    .prepare('SELECT projectId FROM project_contacts WHERE contactId = ?')
    .all(contactId);
  return links.length === 1 ? links[0].projectId : null;
}

function serializeContact(row) {
  return row;
}

// ---------------------------------------------------------------------------
// Visibility: a 'private' interaction (currently only inbound emails) is
// visible ONLY to its author and to executives. Everything else is shared,
// exactly as before. This is the single gate every read path calls, so the
// rule lives in one place.
// ---------------------------------------------------------------------------
function canViewInteraction(interaction, viewer) {
  if (!interaction || interaction.visibility !== 'private') return true;
  const viewerEmail = (viewer && viewer.email ? viewer.email : '').toLowerCase();
  const authorEmail = (interaction.authorEmail || '').toLowerCase();
  if (viewerEmail && authorEmail && viewerEmail === authorEmail) return true;
  return isExecutive(viewerEmail);
}

// Strip HTML tags to plain text — Graph returns message bodies as HTML, and we
// scan the plain text for addresses (forwarded-mail fallback) and store a clean
// note.
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull any email addresses out of free text — used as a fallback for forwarded
// mail, where the original sender is buried in the quoted body rather than the
// headers.
function extractEmailsFromText(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return matches.map((e) => e.toLowerCase());
}

// ---------------------------------------------------------------------------
// GET /api/me
// ---------------------------------------------------------------------------
app.get('/api/me', verifyTeamsToken, (req, res) => {
  res.json({
    ...req.teamsUser,
    isAdmin: isAdmin(req.teamsUser.email),
    isExecutive: isExecutive(req.teamsUser.email),
  });
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

  const allInteractions = db
    .prepare('SELECT * FROM interactions WHERE contactId = ? ORDER BY occurredAt DESC')
    .all(req.params.id);

  // Hide private emails the viewer isn't allowed to see. We still report how
  // many were hidden so the UI can show a subtle placeholder rather than an
  // unexplained gap (matters most on mobile, where there's little context).
  const interactions = allInteractions.filter((i) => canViewInteraction(i, req.teamsUser));
  const hiddenPrivateCount = allInteractions.length - interactions.length;

  // Projects this contact is linked to — drives both-direction linking and the
  // log-form project picker (0 = no picker, 1 = auto-tag, 2+ = pick).
  const projects = db.prepare(`
    SELECT p.* FROM projects p
    JOIN project_contacts pc ON pc.projectId = p.id
    WHERE pc.contactId = ?
    ORDER BY p.name COLLATE NOCASE ASC
  `).all(req.params.id);

  res.json({ ...contact, interactions, hiddenPrivateCount, projects });
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
       nextReminderAt, createdAt, createdBy, createdByEmail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
  `).run(
    id, name.trim(), company || null, role || null, email || null, phone || null,
    birthday || null, howYouKnowThem || null, referralSource || null,
    temperature || 'Warm', recurrenceDays || 90, now,
    req.teamsUser.name || null, req.teamsUser.email || null
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

  const { type, note, occurredAt, projectId } = req.body;
  const authorName = req.teamsUser.name;
  const authorEmail = req.teamsUser.email;

  if (!authorName || !type) {
    return res.status(400).json({ error: 'authorName and type are required' });
  }

  const id = crypto.randomUUID();
  const when = occurredAt || new Date().toISOString();
  const taggedProjectId = resolveProjectId(req.params.id, projectId);

  db.prepare(`
    INSERT INTO interactions (id, contactId, authorName, authorEmail, type, note, occurredAt, projectId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, authorName, authorEmail || null, type, note || null, when, taggedProjectId);

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
// processInboundEmail — the ingestion-agnostic core. Takes a normalized email
// (already-parsed addresses), matches the external party to a contact, and logs
// it as a PRIVATE email interaction owned by the sending rep, resetting that
// contact's follow-up clock exactly like a manual touchpoint. The Graph poller
// (below) is the only caller today, but any future source can reuse this.
//
//   fromEmail / fromName : the rep who sent/forwarded it
//   toEmails / ccEmails  : recipient addresses (arrays of strings)
//   subject / text       : stored in the note (text = a clean body preview)
//   bodyForMatching      : full plain-text body, scanned for a forwarded
//                          sender's address when headers don't reveal one
// Returns { status: 'logged'|'dropped', ... }.
// ---------------------------------------------------------------------------
function processInboundEmail({
  fromEmail = '',
  fromName = '',
  toEmails = [],
  ccEmails = [],
  subject = '',
  text = '',
  bodyForMatching = '',
}) {
  const authorEmail = (fromEmail || '').toLowerCase() || null;
  const authorName = fromName || authorEmail || 'Unknown sender';

  // External = not our log mailbox and not an internal company address.
  const isExternal = (e) =>
    e && e !== LOG_MAILBOX && !(COMPANY_DOMAIN && e.endsWith('@' + COMPANY_DOMAIN));

  let candidates = [...toEmails, ...ccEmails]
    .map((e) => (e || '').toLowerCase())
    .filter(isExternal);

  // Forwarded-mail fallback: the original party is buried in the body.
  if (candidates.length === 0) {
    candidates = extractEmailsFromText(bodyForMatching || text).filter(
      (e) => isExternal(e) && e !== authorEmail
    );
  }

  // De-dupe addresses (the same person can appear in both To and Cc).
  candidates = [...new Set(candidates)];

  // Match EVERY candidate that is a known contact (case-insensitive). One email
  // addressed to several contacts is logged onto each of their timelines.
  const matched = [];
  const seenContactIds = new Set();
  for (const email of candidates) {
    const c = db
      .prepare('SELECT * FROM contacts WHERE email IS NOT NULL AND LOWER(email) = ?')
      .get(email);
    if (c && !seenContactIds.has(c.id)) {
      seenContactIds.add(c.id);
      matched.push(c);
    }
  }

  // No match at all → drop (confirmed decision). Logged for diagnosis.
  if (matched.length === 0) {
    console.log('[inbound-email] dropped — no matching contact', { fromEmail, candidates });
    return { status: 'dropped', reason: 'no matching contact' };
  }

  // Log the email onto each matched contact, resetting each one's follow-up
  // clock (an emailed touchpoint counts for every contact on the thread).
  const when = new Date().toISOString();
  const note = [subject, text].map((s) => (s || '').trim()).filter(Boolean).join('\n\n');
  const loggedContactIds = [];

  for (const contact of matched) {
    const id = crypto.randomUUID();
    // Auto-tag to the contact's project only when it's unambiguous (one project).
    const taggedProjectId = resolveProjectId(contact.id, null);
    db.prepare(`
      INSERT INTO interactions
        (id, contactId, authorName, authorEmail, type, note, occurredAt, visibility, projectId)
      VALUES (?, ?, ?, ?, 'email', ?, ?, 'private', ?)
    `).run(id, contact.id, authorName, authorEmail || null, note || null, when, taggedProjectId);

    const nextReminderAt = addDays(when, contact.recurrenceDays || 90);
    db.prepare(`
      UPDATE contacts
      SET lastContactedBy = ?, lastContactedByEmail = ?, lastContactedAt = ?, nextReminderAt = ?
      WHERE id = ?
    `).run(authorName, authorEmail || null, when, nextReminderAt, contact.id);

    loggedContactIds.push(contact.id);
  }

  console.log('[inbound-email] logged', { contactIds: loggedContactIds, authorEmail });
  return { status: 'logged', contactIds: loggedContactIds, count: loggedContactIds.length };
}

// ---------------------------------------------------------------------------
// pollLogMailbox — reads unread mail from the shared M365 mailbox via Graph,
// feeds each message through processInboundEmail, then marks it read so it's
// not processed twice. Scheduled below. No-op until Graph env vars are set.
// ---------------------------------------------------------------------------
async function pollLogMailbox() {
  if (!graph.isConfigured()) return;
  let messages;
  try {
    messages = await graph.fetchUnreadMessages();
  } catch (err) {
    console.error('[inbound-email] Graph fetch failed:', err.message);
    return;
  }

  for (const m of messages) {
    try {
      const fromEmail = m.from && m.from.emailAddress ? m.from.emailAddress.address : '';
      const fromName = m.from && m.from.emailAddress ? m.from.emailAddress.name : '';
      const toEmails = (m.toRecipients || []).map((r) => r.emailAddress && r.emailAddress.address).filter(Boolean);
      const ccEmails = (m.ccRecipients || []).map((r) => r.emailAddress && r.emailAddress.address).filter(Boolean);
      const text = m.bodyPreview || '';
      const bodyForMatching = stripHtml(m.body && m.body.content) || text;
      processInboundEmail({ fromEmail, fromName, toEmails, ccEmails, subject: m.subject || '', text, bodyForMatching });
    } catch (err) {
      console.error('[inbound-email] processing error for message', m.id, err.message);
    } finally {
      // Mark read regardless, so a poison message can't be reprocessed forever.
      try {
        await graph.markRead(m.id);
      } catch (err) {
        console.error('[inbound-email] markRead failed for', m.id, err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PUT /api/interactions/:id — edit a previously logged interaction's note/type.
// ---------------------------------------------------------------------------
app.put('/api/interactions/:id', verifyTeamsToken, (req, res) => {
  const interaction = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
  if (!interaction) return res.status(404).json({ error: 'Interaction not found' });


  const { type, note, projectId } = req.body;
  const now = new Date().toISOString();

  // projectId: if the key is present, set it (a value tags/re-tags; null clears
  // the tag). If the key is absent entirely, leave the existing tag untouched.
  const newProjectId = Object.prototype.hasOwnProperty.call(req.body, 'projectId')
    ? (projectId || null)
    : interaction.projectId;

  db.prepare(`
    UPDATE interactions
    SET type = ?, note = ?, editedAt = ?, projectId = ?
    WHERE id = ?
  `).run(
    type || interaction.type,
    note !== undefined ? note : interaction.note,
    now,
    newProjectId,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/interactions/:id — ADMIN ONLY. Removes a touchpoint, then
// recalculates the parent contact's cached last-contacted / reminder fields
// from whatever interaction is now most recent (or clears them to the
// "never contacted" state if none remain). Returns the updated contact.
// ---------------------------------------------------------------------------
app.delete('/api/interactions/:id', verifyTeamsToken, (req, res) => {
  if (!isAdmin(req.teamsUser.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const interaction = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
  if (!interaction) return res.status(404).json({ error: 'Interaction not found' });

  const { contactId } = interaction;
  db.prepare('DELETE FROM interactions WHERE id = ?').run(req.params.id);

  // Re-derive the contact's cached fields so the reminder clock doesn't point
  // at a touchpoint that no longer exists.
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  const latest = db.prepare(
    'SELECT * FROM interactions WHERE contactId = ? ORDER BY occurredAt DESC LIMIT 1'
  ).get(contactId);

  if (latest) {
    const nextReminderAt = addDays(latest.occurredAt, (contact && contact.recurrenceDays) || 90);
    db.prepare(`
      UPDATE contacts
      SET lastContactedBy = ?, lastContactedByEmail = ?, lastContactedAt = ?, nextReminderAt = ?
      WHERE id = ?
    `).run(latest.authorName, latest.authorEmail || null, latest.occurredAt, nextReminderAt, contactId);
  } else {
    // No touchpoints left → back to the same NULL state as a brand-new contact.
    db.prepare(`
      UPDATE contacts
      SET lastContactedBy = NULL, lastContactedByEmail = NULL, lastContactedAt = NULL, nextReminderAt = NULL
      WHERE id = ?
    `).run(contactId);
  }

  const updatedContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  res.json(updatedContact);
});

// ===========================================================================
// PROJECTS
// ===========================================================================

// GET /api/projects — list, with optional ?q= search and ?status= filter.
// Includes a contactCount so the list can show it without an extra call.
app.get('/api/projects', verifyTeamsToken, (req, res) => {
  const { q, status } = req.query;
  let sql = `
    SELECT p.*, (
      SELECT COUNT(*) FROM project_contacts pc WHERE pc.projectId = p.id
    ) AS contactCount
    FROM projects p WHERE 1=1`;
  const params = [];
  if (q && q.trim()) {
    sql += ' AND (p.name LIKE ? OR p.customer LIKE ?)';
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }
  if (status && status.trim()) {
    sql += ' AND p.status = ?';
    params.push(status.trim());
  }
  sql += ' ORDER BY p.createdAt DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/projects — create.
app.post('/api/projects', verifyTeamsToken, (req, res) => {
  const { name, customer, status, value, bidDueDate, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO projects (id, name, customer, status, value, bidDueDate, notes, createdAt, createdBy, createdByEmail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name.trim(), customer || null, status || 'Bidding',
    value != null && value !== '' ? Number(value) : null,
    bidDueDate || null, notes || null, new Date().toISOString(),
    req.teamsUser.name || null, req.teamsUser.email || null
  );
  // Seed the timeline with a 'created' event.
  db.prepare(`
    INSERT INTO project_events (id, projectId, kind, occurredAt, authorName, authorEmail)
    VALUES (?, ?, 'created', ?, ?, ?)
  `).run(crypto.randomUUID(), id, new Date().toISOString(), req.teamsUser.name || null, req.teamsUser.email || null);

  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// GET /api/projects/:id — detail: project fields, linked contacts, and BOTH
// feed views (so the frontend toggle is instant, no refetch):
//   allConversations  — every interaction with any linked contact
//   taggedConversations — only interactions tagged to this project
// Both respect the same private-email visibility rule as everywhere else.
app.get('/api/projects/:id', verifyTeamsToken, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const contacts = db.prepare(`
    SELECT c.* FROM contacts c
    JOIN project_contacts pc ON pc.contactId = c.id
    WHERE pc.projectId = ?
    ORDER BY c.name COLLATE NOCASE ASC
  `).all(req.params.id);

  // "All from linked contacts" — join through the link table. Includes contact
  // name for display. Visibility-filtered below.
  const allRaw = db.prepare(`
    SELECT i.*, c.name AS contactName
    FROM interactions i
    JOIN contacts c ON c.id = i.contactId
    JOIN project_contacts pc ON pc.contactId = i.contactId
    WHERE pc.projectId = ?
    ORDER BY i.occurredAt DESC
    LIMIT 200
  `).all(req.params.id);

  // "Tagged to this project" — only interactions explicitly tagged.
  const taggedRaw = db.prepare(`
    SELECT i.*, c.name AS contactName
    FROM interactions i
    JOIN contacts c ON c.id = i.contactId
    WHERE i.projectId = ?
    ORDER BY i.occurredAt DESC
    LIMIT 200
  `).all(req.params.id);

  const allConversations = allRaw.filter((i) => canViewInteraction(i, req.teamsUser));
  const taggedConversations = taggedRaw.filter((i) => canViewInteraction(i, req.teamsUser));

  // Chronological timeline (oldest → newest): created + status changes + notes.
  const events = db.prepare(`
    SELECT * FROM project_events WHERE projectId = ? ORDER BY occurredAt ASC
  `).all(req.params.id);

  res.json({ ...project, contacts, allConversations, taggedConversations, events });
});

// PUT /api/projects/:id — edit fields / status.
app.put('/api/projects/:id', verifyTeamsToken, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, customer, status, value, bidDueDate, notes } = req.body;
  const newStatus = status || project.status;

  db.prepare(`
    UPDATE projects
    SET name = ?, customer = ?, status = ?, value = ?, bidDueDate = ?, notes = ?
    WHERE id = ?
  `).run(
    name != null ? name.trim() : project.name,
    customer !== undefined ? (customer || null) : project.customer,
    newStatus,
    value !== undefined ? (value != null && value !== '' ? Number(value) : null) : project.value,
    bidDueDate !== undefined ? (bidDueDate || null) : project.bidDueDate,
    notes !== undefined ? (notes || null) : project.notes,
    req.params.id
  );

  // Auto-log a timeline event when the status actually changes.
  if (newStatus !== project.status) {
    db.prepare(`
      INSERT INTO project_events (id, projectId, kind, label, occurredAt, authorName, authorEmail)
      VALUES (?, ?, 'status', ?, ?, ?, ?)
    `).run(crypto.randomUUID(), req.params.id, newStatus, new Date().toISOString(),
      req.teamsUser.name || null, req.teamsUser.email || null);
  }

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// POST /api/projects/:id/events — add a manual dated note to the timeline.
app.post('/api/projects/:id/events', verifyTeamsToken, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { note, occurredAt } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note is required' });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO project_events (id, projectId, kind, note, occurredAt, authorName, authorEmail)
    VALUES (?, ?, 'note', ?, ?, ?, ?)
  `).run(id, req.params.id, note.trim(), occurredAt || new Date().toISOString(),
    req.teamsUser.name || null, req.teamsUser.email || null);

  res.status(201).json(db.prepare('SELECT * FROM project_events WHERE id = ?').get(id));
});

// DELETE /api/projects/:id — removes the project and its contact links.
// Interaction tags to this project are cleared (projectId -> NULL) so no
// touchpoint is left pointing at a project that no longer exists. The
// touchpoints themselves are kept. (Open, with UI confirmation, matching the
// contact-delete pattern; can be admin-gated later.)
app.delete('/api/projects/:id', verifyTeamsToken, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE interactions SET projectId = NULL WHERE projectId = ?').run(req.params.id);
  db.prepare('DELETE FROM project_contacts WHERE projectId = ?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ status: 'deleted', id: req.params.id });
});

// POST /api/projects/:id/contacts — link a contact { contactId }.
app.post('/api/projects/:id/contacts', verifyTeamsToken, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { contactId } = req.body;
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  // INSERT OR IGNORE makes linking idempotent (composite PK prevents dupes).
  db.prepare(`
    INSERT OR IGNORE INTO project_contacts (projectId, contactId, linkedAt)
    VALUES (?, ?, ?)
  `).run(req.params.id, contactId, new Date().toISOString());

  const contacts = db.prepare(`
    SELECT c.* FROM contacts c
    JOIN project_contacts pc ON pc.contactId = c.id
    WHERE pc.projectId = ?
    ORDER BY c.name COLLATE NOCASE ASC
  `).all(req.params.id);
  res.json(contacts);
});

// DELETE /api/projects/:id/contacts/:contactId — unlink a contact.
// Note: does NOT retag/untag that contact's existing touchpoints; tags are a
// separate, deliberate choice and are left as-is.
app.delete('/api/projects/:id/contacts/:contactId', verifyTeamsToken, (req, res) => {
  db.prepare('DELETE FROM project_contacts WHERE projectId = ? AND contactId = ?')
    .run(req.params.id, req.params.contactId);

  const contacts = db.prepare(`
    SELECT c.* FROM contacts c
    JOIN project_contacts pc ON pc.contactId = c.id
    WHERE pc.projectId = ?
    ORDER BY c.name COLLATE NOCASE ASC
  `).all(req.params.id);
  res.json(contacts);
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

  const recentRaw = db.prepare(`
    SELECT i.id, i.authorName, i.authorEmail, i.visibility, i.type, i.note,
           i.occurredAt, c.name as contactName, c.id as contactId
    FROM interactions i
    JOIN contacts c ON c.id = i.contactId
    WHERE i.occurredAt >= ?
    ORDER BY i.occurredAt DESC
    LIMIT 50
  `).all(sinceIso);

  // Drop private emails the viewer can't see, then cap at 25. (Counts above
  // are left global on purpose — a touchpoint tally isn't sensitive the way
  // email *content* is. See note in the tracker / your call to revisit.)
  const recent = recentRaw
    .filter((i) => canViewInteraction(i, req.teamsUser))
    .slice(0, 25);

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
// GET /api/messages/search?q=...
// Searches across ALL logged interaction notes (not just contact fields),
// joined with contacts so each result includes who it belongs to. Powers
// the Search History feature — surfaces individual matching messages, most
// recent first, regardless of which contact they belong to.
//
// Add this route in backend/server.js, anywhere alongside the other routes
// (right after GET /api/birthdays/upcoming is a natural spot).
// ---------------------------------------------------------------------------
app.get('/api/messages/search', verifyTeamsToken, (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.json([]);

  const like = `%${q.trim()}%`;
  const rows = db.prepare(`
    SELECT
      i.id, i.contactId, i.authorName, i.authorEmail, i.visibility,
      i.type, i.note, i.occurredAt,
      c.name as contactName, c.company as contactCompany
    FROM interactions i
    JOIN contacts c ON c.id = i.contactId
    WHERE i.note LIKE ?
    ORDER BY i.occurredAt DESC
    LIMIT 50
  `).all(like);

  // Critical: without this, a rep could surface another rep's private email
  // just by searching for text inside it.
  res.json(rows.filter((r) => canViewInteraction(r, req.teamsUser)));
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

// Poll the shared log mailbox for CC'd/BCC'd/forwarded emails every minute.
// No-op until the Graph env vars are set, so this is safe to ship dark.
// (One shared mailbox at 1/min is trivial against Graph throttling limits.)
cron.schedule('* * * * *', () => {
  pollLogMailbox().catch((err) => console.error('Mailbox poll failed:', err));
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Only start listening when run directly (node server.js) — not when imported
// by a test, which lets tests call the functions below without opening a port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bedrock API listening on port ${PORT}`);
  });
}

module.exports = { app, processInboundEmail, pollLogMailbox, resolveProjectId };
