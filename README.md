Relationship CRM for Teams
A shared contact tracker built for sales teams who care more about relationships than deal stages.
Everyone sees the same contacts. Every touchpoint is logged. Reminders to reconnect always go to
whoever spoke to that person most recently — never a fixed "assigned rep."
What's included
```
CMP_Sales/
├── backend/        Express API + SQLite database + reminder scheduler
├── frontend/        React app (Fluent UI + Teams JS SDK) — the tab UI
├── manifest/        Teams app manifest + icons, ready to package
└── README.md         (this file)
```
Core behavior
Contacts, not deals. Each contact has a name, company, role, email, phone, birthday,
how you know them, referral source, and a relationship "temperature" (Hot / Warm / Cold /
Needs Follow-up).
Shared data. Every rep sees and can edit every contact. No silos.
Interaction log. Every call, email, coffee, or event gets logged with a note — tagged
automatically with the rep's Teams identity, so there's a full trail of who did what, when.
No assigned rep. The moment someone logs an interaction, they become the contact's
"last contacted by" — and that's who the next reminder goes to. Nobody has to manage
ownership by hand.
Company grouping. The contact list groups people under company headers, and search matches
names, companies, and emails.
Rep filter + Activity dashboard. Filter the list by "last contacted by," and use the
Activity tab to see per-rep touchpoint counts, the most common touchpoint types, and a live
feed of recent activity (last 7 or 30 days).
Reminders, three ways:
Teams — a proactive message from the app's bot (needs a one-time bot registration).
Email — via SendGrid (needs your API key).
SMS — via Twilio (needs your account + each person's phone number on file).
Birthdays. Set once per contact, surfaced in an "upcoming birthdays" banner.
1. Run it locally first (no Teams needed)
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
2. Deploy it somewhere real
Teams tabs load content from a live HTTPS URL — they can't point at your laptop. Pick a host for
each piece:
Backend (Express + SQLite):
Easiest: Render or Railway — connect your repo,
set the Root Directory to `backend` and the start command to `node server.js`, done.
Also fine: Azure App Service, Fly.io, a small VM anywhere.
SQLite is a single file (`crm.db`) — make sure your host's disk persists between deploys
(Render/Railway persistent disks, or an Azure App Service with a mounted volume). For a larger
team or higher reliability, swapping SQLite for Postgres is a small change in `db.js`.
Frontend (React/Vite):
Easiest: Vercel, Netlify, or Azure Static Web Apps.
Set the Root Directory to `frontend`; the host runs `npm run build` and serves the `dist/`
output automatically.
Set the environment variable `VITE_API_BASE` to your deployed backend's URL before deploying
(in your host's dashboard), e.g. `VITE_API_BASE=https://your-backend.onrender.com`.
Reminder credentials — set these as environment variables on your backend host once you have
accounts:
Variable	Purpose
`SENDGRID_API_KEY`, `REMINDER_FROM_EMAIL`	Email reminders
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`	SMS reminders
`MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`	Teams bot reminders
Until those are set, the app runs perfectly fine — it just logs "would have sent a reminder" to
the server console instead of actually sending one. Look in `backend/notifications.js` for exactly
where to uncomment the real sending code once you're ready (it's marked with `TODO`).
3. Package and install into Teams
Open `manifest/manifest.json` and replace every `REPLACE_WITH_YOUR_DEPLOYED_URL` with your
deployed frontend's domain (no `https://` in `validDomains`, but include it in the URLs).
Generate a real app ID: use any UUID generator (e.g. uuidgenerator.net) and replace the `id`
field.
Zip the three files together — `manifest.json`, `color.png`, `outline.png` — with the
manifest at the root of the zip (not inside a subfolder).
In Teams: Apps → Manage your apps → Upload an app → Upload a custom app, and select your
zip. (If that option is greyed out, ask your Teams admin to enable custom app uploads, or
have them upload it org-wide via the Teams Admin Center → Teams apps → Manage apps.)
Add it to a channel, group chat, or as a personal tab — the manifest is already configured for
both. Admins can also restrict/pin it to just the sales team via an App setup policy.
4. Mobile
The frontend is responsive by default (see the `@media` rules at the bottom of
`frontend/src/styles.css`) — the contact list stacks above the detail view on narrow screens, and
all Fluent UI components used here are touch-friendly out of the box. Since Teams mobile renders
the tab as a regular web view, no extra work is needed beyond what's already built in — just
verify it after deploying by opening the tab on a phone.
Security notes
Keep this repo private — the manifest and config contain your deployed URLs.
As shipped, the backend API does not verify callers' identities; anyone with the backend URL
can read/write data. For internal-team use behind a private repo this may be acceptable to
start, but before storing sensitive client data at scale, add server-side authentication
(Teams SSO — verifying a Microsoft Entra ID token on each request) so only signed-in users from
your Microsoft 365 tenant can reach the API.
Extending it
Manager view / reports — the `/api/activity/summary` endpoint already powers the Activity
tab; more rollups are easy to add alongside it.
Bulk import — add a CSV upload endpoint using a library like `csv-parse`.
Phone numbers for SMS reminders — add a small settings panel where each person enters their
number once; store it against their email in a new `user_prefs` table.
Postgres instead of SQLite — swap the `better-sqlite3` calls in `db.js`/`server.js` for a
Postgres client (e.g. `pg`); the SQL is close enough to port directly for this schema.