// Exercises the Graph poller end-to-end with a MOCKED ./graph module: message
// normalization -> matching -> private-logging -> reminder reset -> mark-read,
// with no real Microsoft credentials. Run: node graphtest.js
process.env.DB_PATH = '/tmp/gtest-crm.db';
process.env.COMPANY_DOMAIN = 'cmpconcrete.com';
process.env.LOG_MAILBOX = 'crm-log@cmpconcrete.com';
process.env.EXECUTIVE_EMAILS = 'boss@cmpconcrete.com';
process.env.PORT = '3999';
require('fs').rmSync('/tmp/gtest-crm.db', { force: true });

const path = require('path');
const graphMockPath = path.resolve(__dirname, './graph.js');
const marked = [];
const mockMessages = [
  { // 1. BCC outbound: rep -> mike@turner.com, cc the log mailbox -> MATCH
    id: 'm1',
    from: { emailAddress: { name: 'Sarah Rep', address: 'sarah@cmpconcrete.com' } },
    toRecipients: [{ emailAddress: { address: 'mike@turner.com' } }],
    ccRecipients: [{ emailAddress: { address: 'crm-log@cmpconcrete.com' } }],
    subject: 'Your bid', bodyPreview: 'Attached is the quote.',
    body: { contentType: 'html', content: '<p>Attached is the quote.</p>' },
  },
  { // 2. Unknown external -> DROP
    id: 'm2',
    from: { emailAddress: { name: 'Sarah Rep', address: 'sarah@cmpconcrete.com' } },
    toRecipients: [{ emailAddress: { address: 'stranger@nowhere.com' } }],
    ccRecipients: [], subject: 'hi', bodyPreview: 'x', body: { content: '<p>x</p>' },
  },
  { // 3. Forwarded inbound: client only in the body -> MATCH via body fallback
    id: 'm3',
    from: { emailAddress: { name: 'Sarah Rep', address: 'sarah@cmpconcrete.com' } },
    toRecipients: [{ emailAddress: { address: 'crm-log@cmpconcrete.com' } }],
    ccRecipients: [], subject: 'Fwd: schedule', bodyPreview: 'Forwarded message',
    body: { contentType: 'html', content: '<div>---- Forwarded message ----<br>From: Mike GC &lt;mike@turner.com&gt;<br>Can we push to Friday?</div>' },
  },
  { // 4. Two known contacts on one email -> should log onto BOTH timelines
    id: 'm4',
    from: { emailAddress: { name: 'Sarah Rep', address: 'sarah@cmpconcrete.com' } },
    toRecipients: [
      { emailAddress: { address: 'mike@turner.com' } },
      { emailAddress: { address: 'jane@acme.com' } },
    ],
    ccRecipients: [{ emailAddress: { address: 'crm-log@cmpconcrete.com' } }],
    subject: 'Kickoff', bodyPreview: 'Looking forward to it.',
    body: { contentType: 'html', content: '<p>Looking forward to it.</p>' },
  },
];

// Inject the mock into require.cache BEFORE server.js pulls in ./graph.
require.cache[graphMockPath] = {
  id: graphMockPath, filename: graphMockPath, loaded: true, exports: {
    isConfigured: () => true,
    fetchUnreadMessages: async () => mockMessages,
    markRead: async (id) => { marked.push(id); },
    getToken: async () => 'fake',
  },
};

const crypto = require('crypto');
const db = require('./db');
const cid = crypto.randomUUID();
db.prepare(`INSERT INTO contacts (id,name,company,email,recurrenceDays,createdAt)
  VALUES (?,?,?,?,?,?)`).run(cid, 'Mike GC', 'Turner', 'mike@turner.com', 90, new Date().toISOString());
const cid2 = crypto.randomUUID();
db.prepare(`INSERT INTO contacts (id,name,company,email,recurrenceDays,createdAt)
  VALUES (?,?,?,?,?,?)`).run(cid2, 'Jane Dev', 'Acme', 'jane@acme.com', 90, new Date().toISOString());

const { pollLogMailbox } = require('./server.js');

(async () => {
  await pollLogMailbox();

  const rows = db.prepare(
    'SELECT contactId, authorEmail, type, visibility FROM interactions ORDER BY occurredAt'
  ).all();
  const mikeRows = rows.filter((r) => r.contactId === cid);
  const janeRows = rows.filter((r) => r.contactId === cid2);
  const jane = db.prepare('SELECT lastContactedByEmail, nextReminderAt FROM contacts WHERE id=?').get(cid2);

  let ok = true;
  const check = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) ok = false; };

  // m1 -> Mike, m3 -> Mike (body), m4 -> Mike + Jane, m2 -> dropped.
  check(rows.length === 4, `4 interactions total (m1, m3, m4x2; m2 dropped) — got ${rows.length}`);
  check(mikeRows.length === 3, `Mike got 3 (m1, m3, m4) — got ${mikeRows.length}`);
  check(janeRows.length === 1, `Jane got 1 (m4 only) — got ${janeRows.length}`);
  check(rows.every((r) => r.type === 'email' && r.visibility === 'private'), 'all logged as PRIVATE email');
  check(rows.every((r) => r.authorEmail === 'sarah@cmpconcrete.com'), 'all authored by the sending rep');
  check(jane.lastContactedByEmail === 'sarah@cmpconcrete.com', "Jane's reminder clock re-owned by Sarah (per-contact reset)");
  check(new Date(jane.nextReminderAt) > new Date(), "Jane's next reminder pushed into the future");
  check(marked.length === 4, `all 4 messages marked read (incl. the dropped one) — got ${marked.length}`);

  console.log(ok ? '\n\u2713 ALL PASS' : '\n\u2717 SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
