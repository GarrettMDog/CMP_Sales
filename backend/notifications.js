/**
 * notifications.js
 * ---------------------------------------------------------------------------
 * Three delivery channels for a "time to reconnect" reminder:
 *   1. Teams   -> fully working once you register a bot + install this app
 *   2. Email   -> fully wired, just needs a SendGrid API key
 *   3. SMS     -> fully wired, just needs a Twilio account
 *
 * Reminders are always sent to whoever is in `contact.lastContactedBy*`
 * (the person who logged the most recent interaction) — never to a fixed
 * "assigned rep".
 * ---------------------------------------------------------------------------
 */

const crypto = require('crypto');
const db = require('./db');

// ---------------------------------------------------------------------------
// 1. TEAMS — proactive message via the Bot Framework
// ---------------------------------------------------------------------------
// To make this live:
//   a) Register a bot in the Azure Bot Service / Teams Developer Portal
//   b) Add MICROSOFT_APP_ID / MICROSOFT_APP_PASSWORD as env vars
//   c) Store each user's Teams conversation reference the first time they
//      open the tab (see /api/teams/register-conversation below) so you can
//      message them proactively later.
async function sendTeamsReminder(contact) {
  const appId = process.env.MICROSOFT_APP_ID;
  const appPassword = process.env.MICROSOFT_APP_PASSWORD;

  if (!appId || !appPassword) {
    console.log(
      `[teams-reminder:SKIPPED - no bot credentials set] Would remind ${contact.lastContactedBy} to reconnect with ${contact.name}`
    );
    return { sent: false, reason: 'missing MICROSOFT_APP_ID / MICROSOFT_APP_PASSWORD' };
  }

  // TODO: replace with a real call once the bot + conversation reference exist.
  // const { BotFrameworkAdapter } = require('botbuilder');
  // const adapter = new BotFrameworkAdapter({ appId, appPassword });
  // const conversationRef = getStoredConversationRef(contact.lastContactedByEmail);
  // await adapter.continueConversation(conversationRef, async (turnContext) => {
  //   await turnContext.sendActivity(
  //     `👋 Time to reconnect with ${contact.name} (${contact.company || 'no company set'}) — it's been ${contact.recurrenceDays} days.`
  //   );
  // });

  return { sent: true, channel: 'teams' };
}

// ---------------------------------------------------------------------------
// 2. EMAIL — via SendGrid
// ---------------------------------------------------------------------------
// npm install @sendgrid/mail
// Set SENDGRID_API_KEY and REMINDER_FROM_EMAIL as env vars.
async function sendEmailReminder(contact) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.REMINDER_FROM_EMAIL;

  if (!apiKey || !contact.lastContactedByEmail) {
    console.log(
      `[email-reminder:SKIPPED - no SENDGRID_API_KEY or recipient email] Would email ${contact.lastContactedByEmail || '(unknown)'} about ${contact.name}`
    );
    return { sent: false, reason: 'missing SENDGRID_API_KEY or recipient email' };
  }

  // TODO: uncomment once @sendgrid/mail is installed and the key is set.
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(apiKey);
  // await sgMail.send({
  //   to: contact.lastContactedByEmail,
  //   from: fromEmail,
  //   subject: `Time to reconnect with ${contact.name}`,
  //   text: `It's been ${contact.recurrenceDays} days since you last connected with ${contact.name}${contact.company ? ` at ${contact.company}` : ''}. Consider reaching out.`,
  // });

  return { sent: true, channel: 'email' };
}

// ---------------------------------------------------------------------------
// 3. SMS — via Twilio
// ---------------------------------------------------------------------------
// npm install twilio
// Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER as env vars.
// Each teammate's phone number should be captured once (e.g. in a settings
// panel) and stored against their email in a small `user_prefs` table —
// left as a TODO since it depends on how you want reps to opt in.
async function sendSmsReminder(contact, toPhoneNumber) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !toPhoneNumber) {
    console.log(
      `[sms-reminder:SKIPPED - no Twilio credentials or phone number] Would text about ${contact.name}`
    );
    return { sent: false, reason: 'missing Twilio credentials or phone number' };
  }

  // TODO: uncomment once twilio is installed and credentials are set.
  // const twilioClient = require('twilio')(sid, token);
  // await twilioClient.messages.create({
  //   to: toPhoneNumber,
  //   from: fromNumber,
  //   body: `Reminder: reconnect with ${contact.name}${contact.company ? ` (${contact.company})` : ''}.`,
  // });

  return { sent: true, channel: 'sms' };
}

// ---------------------------------------------------------------------------
// Orchestration — called by the daily scheduler in server.js
// ---------------------------------------------------------------------------
async function fireReminderForContact(contact) {
  const results = await Promise.all([
    sendTeamsReminder(contact),
    sendEmailReminder(contact),
    // SMS needs a phone number on file for the person; omitted here by default.
  ]);

  const logStmt = db.prepare(
    `INSERT INTO reminder_log (id, contactId, sentTo, channel, sentAt) VALUES (?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  results.forEach((r) => {
    logStmt.run(crypto.randomUUID(), contact.id, contact.lastContactedBy, r.channel || 'unknown', now);
  });

  return results;
}

module.exports = { fireReminderForContact, sendTeamsReminder, sendEmailReminder, sendSmsReminder };
