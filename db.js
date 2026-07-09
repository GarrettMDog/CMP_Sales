# Relationship CRM for Teams

A shared contact tracker built for sales teams who care more about relationships than deal stages.
Everyone sees the same contacts. Every touchpoint is logged. Reminders to reconnect always go to
whoever spoke to that person most recently — never a fixed "assigned rep."

## What's included

```
relationship-crm/
├── backend/        Express API + SQLite database + reminder scheduler
├── frontend/        React app (Fluent UI + Teams JS SDK) — the tab UI
├── manifest/        Teams app manifest + icons, ready to package
└── README.md         (this file)
```

## Core behavior

- **Contacts, not deals.** Each contact has a name, company, role, email, phone, birthday,
  how you know them, referral source, and a relationship "temperature" (Hot / Warm / Cold /
  Needs Follow-up).
- **Shared data.** Every rep sees and can edit every contact. No silos.
- **Interaction log.** Every call, email, coffee, or event gets logged with a note.
- **No assigned rep.** The moment someone logs an interaction, they become the contact's
  "last contacted by" — and that's who the next reminder goes to. Nobody has to manage
  ownership by hand.
- **Reminders, three ways:**
  - **Teams** — a proactive message from the app's bot (needs a one-time bot registration).
  - **Email** — via SendGrid (needs your API key).
  - **SMS** — via Twilio (needs your account + each person's phone number on file).
- **Birthdays.** Set once per contact, surfaced in an "upcoming birthdays" banner.

## 1. Run it locally first (no Teams needed)

This lets you see and click through the whole app in a normal browser tab before touching Teams.

```bash
# Terminal 1 — backend
cd backend
npm install
node server.js
# API now running at http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

The frontend works fine outside Teams — it just falls back to a placeholder "Dev User" identity
instead of pulling your real name from Teams context.

## 2. Deploy it somewhere real

Teams tabs load content from a live HTTPS URL — they can't point at your laptop. Pick a host for
each piece:

**Backend (Express + SQLite):**
- Easiest: [Render](https://render.com) or [Railway](https://railway.app) — connect your repo,
  set the start command to `node server.js`, done.
- Also fine: Azure App Service, Fly.io, a small VM anywhere.
- SQLite is a single file (`crm.db`) — make sure your host's disk persists between deploys
  (Render/Railway persistent disks, or an Azure App Service with a mounted volume). For a larger
  team or higher reliability, swapping SQLite for Postgres is a small change in `db.js`.

**Frontend (React/Vite):**
- Easiest: Vercel, Netlify, or Azure Static Web Apps.
- Build with `npm run build` in `frontend/`, deploy the `dist/` folder.
- Set the environment variable `VITE_API_BASE` to your deployed backend's URL before building
  (or configure it in your host's dashboard), e.g. `VITE_API_BASE=https://your-backend.onrender.com`.

**Reminder credentials** — set these as environment variables on your backend host once you have
accounts:
| Variable | Purpose |
|---|---|
| `SENDGRID_API_KEY`, `REMINDER_FROM_EMAIL` | Email reminders |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS reminders |
| `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD` | Teams bot reminders |

Until those are set, the app runs perfectly fine — it just logs "would have sent a reminder" to
the server console instead of actually sending one. Look in `backend/notifications.js` for exactly
where to uncomment the real sending code once you're ready (it's marked with `TODO`).

## 3. Package and install into Teams

1. Open `manifest/manifest.json` and replace every `REPLACE_WITH_YOUR_DEPLOYED_URL` with your
   deployed frontend's domain (no `https://` in `validDomains`, but include it in the URLs).
2. Generate a real app ID: run `uuidgen` (or any UUID generator) and replace the `id` field.
3. Zip the three files together — `manifest.json`, `color.png`, `outline.png` — with the
   manifest at the root of the zip (not inside a subfolder).
4. In Teams: **Apps → Manage your apps → Upload an app → Upload a custom app**, and select your
   zip. (If that option is greyed out, ask your Teams admin to enable custom app uploads, or
   have them upload it org-wide via the **Teams Admin Center → Teams apps → Manage apps**.)
5. Add it to a channel, group chat, or as a personal tab — the manifest is already configured for
   both.

## 4. Mobile

The frontend is responsive by default (see the `@media` rules at the bottom of `styles.css`) —
the contact list stacks above the detail view on narrow screens, and all Fluent UI components used
here are touch-friendly out of the box. Since Teams mobile renders the tab as a regular web view,
no extra work is needed beyond what's already built in — just verify it after deploying by opening
the tab on a phone.

## Extending it

- **Manager view / reports** — add a `GET /api/contacts/stats` endpoint and a new tab.
- **Bulk import** — add a CSV upload endpoint using a library like `csv-parse`.
- **Phone numbers for SMS reminders** — add a small settings panel where each person enters their
  number once; store it against their email in a new `user_prefs` table.
- **Postgres instead of SQLite** — swap the `better-sqlite3` calls in `db.js`/`server.js` for a
  Postgres client (e.g. `pg`); the SQL is close enough to port directly for this schema.
