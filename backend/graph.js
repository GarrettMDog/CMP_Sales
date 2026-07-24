// graph.js
// ---------------------------------------------------------------------------
// Minimal Microsoft Graph client for reading the shared "log" mailbox.
//
// Uses the OAuth2 client-credentials flow (the app authenticates as itself, not
// on behalf of a user) so a background job can read the mailbox with no signed-in
// user present. Raw fetch — no SDK — to keep the dependency surface tiny.
//
// REQUIRED APP REGISTRATION (Entra ID):
//   • Graph APPLICATION permission Mail.ReadWrite, with admin consent granted.
//     (ReadWrite, not just Read: markRead() below PATCHes isRead=true so a message
//     isn't logged again on the next poll. With Read-only, that PATCH 403s and
//     every email gets re-logged every 5 minutes — so ReadWrite is required.)
//   • CRITICAL: scope this app to ONLY the log mailbox. Without scoping,
//     Mail.ReadWrite grants read/write to EVERY mailbox in the tenant. Use
//     RBAC for Applications (a management scope restricting the app to the log
//     mailbox) — this is Microsoft's current, future-proof method. (The older
//     Application Access Policy still works but is legacy / on the deprecation
//     track, so prefer RBAC.) This scoping is the guardrail that makes this safe.
//     See the setup guide for the exact PowerShell.
//
// ENV VARS:
//   GRAPH_TENANT_ID      — directory (tenant) ID
//   GRAPH_CLIENT_ID      — app registration (client) ID
//   GRAPH_CLIENT_SECRET  — client secret value
//   LOG_MAILBOX          — the shared mailbox UPN (e.g. crm-log@cmpconcrete.com)
// ---------------------------------------------------------------------------

const TENANT_ID = process.env.GRAPH_TENANT_ID || '';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || '';
const MAILBOX = process.env.LOG_MAILBOX || '';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function isConfigured() {
  return Boolean(TENANT_ID && CLIENT_ID && CLIENT_SECRET && MAILBOX);
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  // Reuse the cached token until a minute before it expires.
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function graphFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Graph ${options.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  }
  // PATCH/POST may return 200 with a body or 202/204 with none.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Fetch up to 25 unread messages from the mailbox inbox, oldest first, with just
// the fields the matcher needs.
async function fetchUnreadMessages() {
  const params = new URLSearchParams({
    $filter: 'isRead eq false',
    $orderby: 'receivedDateTime asc',
    $top: '25',
    $select: 'id,from,toRecipients,ccRecipients,subject,bodyPreview,body,receivedDateTime',
  });
  const data = await graphFetch(
    `/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages?${params.toString()}`
  );
  return data.value || [];
}

// Mark a message read so the next poll skips it.
async function markRead(messageId) {
  return graphFetch(`/users/${encodeURIComponent(MAILBOX)}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead: true }),
  });
}

module.exports = { isConfigured, fetchUnreadMessages, markRead, getToken };
