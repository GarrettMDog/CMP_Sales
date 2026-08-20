import { useState, useEffect } from 'react';
import { Spinner } from '@fluentui/react-components';
import { api } from '../api.js';
import Drawer from './Drawer.jsx';

const RANGES = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '365d' },
];

const TYPE_LABELS = {
  call: 'Phone call', email: 'Email', coffee: 'Coffee / meal',
  in_person: 'In Person', event: 'Event', message: 'Message', other: 'Other',
};

// Compact money: $2.1M, $750K, $900.
function money(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return `$${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return `$${v.toLocaleString()}`;
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${mm}/${dd}/${yy} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

// Per-rep leadership scorecard, shown in a drawer from the Activity dashboard.
// Metrics pair outcome against effort (won / bid) to show a real win rate, and
// the panel below lists every interaction the rep logged in the window.
export default function RepScorecard({ open, email, name, token, onClose }) {
  const [range, setRange] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !email || !token) { setData(null); return; }
    setLoading(true); setError(false);
    api.getRepScorecard(email, range, token)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, email, token, range]);

  const winRate = data && data.projectsBid > 0
    ? Math.round((data.projectsWon / data.projectsBid) * 100)
    : null;
  const missingValue = data ? (data.wonMissingValue || 0) + (data.bidMissingValue || 0) : 0;

  return (
    <Drawer open={open} onClose={onClose} title={name || 'Scorecard'}>
      <div className="scorecard">
        <div className="scorecard__range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              className={`scorecard__range-btn ${range === r.days ? 'scorecard__range-btn--active' : ''}`}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading && <Spinner label="Loading scorecard…" />}
        {error && <p className="scorecard__empty">Couldn't load this scorecard.</p>}

        {!loading && !error && data && (
          <>
            <div className="scorecard__grid">
              <div className="scorecard__metric scorecard__metric--wide">
                <div className="scorecard__value">
                  {money(data.dollarsWon)} <span className="scorecard__of">/ {money(data.dollarsBid)}</span>
                </div>
                <div className="scorecard__label">Won / bid ($)</div>
              </div>
              <div className="scorecard__metric scorecard__metric--wide">
                <div className="scorecard__value">
                  {data.projectsWon} <span className="scorecard__of">/ {data.projectsBid}</span>
                  {winRate !== null && <span className="scorecard__rate">{winRate}% win</span>}
                </div>
                <div className="scorecard__label">Projects won / bid</div>
              </div>
              <div className="scorecard__metric">
                <div className="scorecard__value">{data.contactsAdded}</div>
                <div className="scorecard__label">Contacts added</div>
              </div>
              <div className="scorecard__metric">
                <div className="scorecard__value">{data.interactions}</div>
                <div className="scorecard__label">Interactions ({data.weeklyInteractions}/wk)</div>
              </div>
            </div>

            {missingValue > 0 && (
              <p className="scorecard__footnote">
                {missingValue} {missingValue === 1 ? 'project has' : 'projects have'} no value set — dollar figures may be understated.
              </p>
            )}

            <div className="scorecard__log">
              <div className="scorecard__log-title">Activity — last {data.rangeDays} days</div>
              {(!data.recentInteractions || data.recentInteractions.length === 0) && (
                <p className="scorecard__empty">No interactions logged in this window.</p>
              )}
              {(data.recentInteractions || []).map((i) => (
                <div key={i.id} className="scorecard__event">
                  <div className="scorecard__event-top">
                    <strong>{i.contactName}</strong>
                    <span className="scorecard__event-type">{TYPE_LABELS[i.type] || i.type}</span>
                    <span className="scorecard__event-date">{formatDate(i.occurredAt)}</span>
                  </div>
                  {i.note && <p className="scorecard__event-note">{i.note}</p>}
                </div>
              ))}
              {data.recentCapped && (
                <p className="scorecard__footnote scorecard__footnote--muted">
                  Showing the most recent 300. Narrow the range to see fewer.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
