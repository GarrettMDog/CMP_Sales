import { useState, useEffect } from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import { api } from '../api.js';
import Drawer from './Drawer.jsx';

const RANGES = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '365d' },
];

function money(n) {
  return `$${Number(n || 0).toLocaleString()}`;
}

// Per-rep leadership scorecard, shown in a drawer from the Activity dashboard.
// Backend gates access (execs → anyone; a rep → only their own), so this just
// renders whatever it's allowed to fetch.
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
              <div className="scorecard__metric">
                <div className="scorecard__value">{money(data.dollarsWon)}</div>
                <div className="scorecard__label">Won</div>
              </div>
              <div className="scorecard__metric">
                <div className="scorecard__value">{data.projectsWon}</div>
                <div className="scorecard__label">Projects won</div>
              </div>
              <div className="scorecard__metric">
                <div className="scorecard__value">{data.contactsAdded}</div>
                <div className="scorecard__label">Contacts added</div>
              </div>
              <div className="scorecard__metric">
                <div className="scorecard__value">{data.weeklyInteractions}</div>
                <div className="scorecard__label">Interactions / week</div>
              </div>
            </div>

            {data.wonMissingValue > 0 && (
              <p className="scorecard__footnote">
                {data.wonMissingValue} won {data.wonMissingValue === 1 ? 'project has' : 'projects have'} no
                {' '}value set — the Won total may be understated.
              </p>
            )}
            <p className="scorecard__footnote scorecard__footnote--muted">
              Over the last {data.rangeDays} days.
            </p>
          </>
        )}
      </div>
    </Drawer>
  );
}
