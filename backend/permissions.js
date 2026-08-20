// permissions.js
// ---------------------------------------------------------------------------
// Central place for access-control checks. Right now it only knows about
// "executives" — a small allowlist of emails supplied via the EXECUTIVE_EMAILS
// environment variable (comma-separated). This is intentionally the same
// mechanism the Executive Dashboard will use, so both features share one
// source of truth instead of each rolling their own.
//
// Later, if you move to Entra ID security groups (see the tracker), only this
// file changes — everything that calls isExecutive() stays the same.
//
// Example Render env var:
//   EXECUTIVE_EMAILS=jane@cmpconcrete.com, owner@cmpconcrete.com
// ---------------------------------------------------------------------------

const EXECUTIVE_EMAILS = (process.env.EXECUTIVE_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isExecutive(email) {
  if (!email) return false;
  return EXECUTIVE_EMAILS.includes(email.toLowerCase());
}

// Admins are a separate, deliberately narrow list (ADMIN_EMAILS) — distinct
// from execs. Execs can *see* all private emails; admins can *manage/delete*
// data (currently: delete touchpoints). Kept separate on purpose so "can view
// everything" and "can delete things" aren't the same grant.
//   Example Render env var: ADMIN_EMAILS=garrett@cmppumping.com
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

module.exports = { isExecutive, isAdmin, EXECUTIVE_EMAILS };
