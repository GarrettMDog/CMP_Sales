import { useEffect, useState } from 'react';
import {
  Avatar, Badge, Dropdown, Option, Spinner, Card,
} from '@fluentui/react-components';
import { api } from '../api.js';

const TYPE_LABELS = {
  call: 'Phone call',
  email: 'Email',
  coffee: 'Coffee / meal',
  event: 'Event',
  message: 'Message',
  other: 'Other',
};

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityDashboard({ onSelectContact, token }) {
  const [range, setRange] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.activitySummary(range, token)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load activity.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, token]);

  const maxTouchpoints = data && data.perRep.length > 0
    ? Math.max(...data.perRep.map((r) => r.touchpoints))
    : 0;

  return (
    <div className="activity-dashboard">
      <div className="activity-dashboard__header">
        <h2>Team activity</h2>
        <Dropdown
          value={range === 'week' ? 'Last 7 days' : 'Last 30 days'}
          onOptionSelect={(_, d) => setRange(d.optionValue)}
        >
          <Option value="week">Last 7 days</Option>
          <Option value="month">Last 30 days</Option>
        </Dropdown>
      </div>

      {loading && <div className="activity-dashboard__loading"><Spinner label="Loading activity..." /></div>}
      {error && <div className="app-error">{error}</div>}

      {data && !loading && (
        <>
          <div className="activity-summary-cards">
            <Card className="summary-card">
              <div className="summary-card__number">{data.totalTouchpoints}</div>
              <div className="summary-card__label">Total touchpoints</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-card__number">{data.perRep.length}</div>
              <div className="summary-card__label">Active reps</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-card__number">
                {data.perType[0] ? TYPE_LABELS[data.perType[0].type] || data.perType[0].type : '—'}
              </div>
              <div className="summary-card__label">Most common touchpoint</div>
            </Card>
          </div>

          <div className="activity-columns">
            <div className="rep-leaderboard">
              <h3>Touchpoints per rep</h3>
              {data.perRep.length === 0 && <p className="muted">No activity logged in this window yet.</p>}
              {data.perRep.map((r) => (
                <div key={r.email || r.name} className="rep-row">
                  <Avatar name={r.name} initials={initials(r.name)} size={28} color="colorful" />
                  <span className="rep-row__name">{r.name}</span>
                  <div className="rep-row__bar-track">
                    <div
                      className="rep-row__bar"
                      style={{ width: `${maxTouchpoints ? (r.touchpoints / maxTouchpoints) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="rep-row__count">{r.touchpoints}</span>
                </div>
              ))}
            </div>

            <div className="recent-feed">
              <h3>Recent touchpoints</h3>
              {data.recent.length === 0 && <p className="muted">Nothing logged yet in this window.</p>}
              {data.recent.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  className="feed-item"
                  onClick={() => onSelectContact && onSelectContact(i.contactId)}
                >
                  <Avatar name={i.authorName} initials={initials(i.authorName)} size={28} />
                  <div className="feed-item__body">
                    <div className="feed-item__top">
                      <strong>{i.authorName}</strong>
                      <span className="muted"> logged a </span>
                      <Badge appearance="tint" size="small">{TYPE_LABELS[i.type] || i.type}</Badge>
                      <span className="muted"> with </span>
                      <strong>{i.contactName}</strong>
                    </div>
                    <div className="feed-item__meta">{formatDateTime(i.occurredAt)}</div>
                    {i.note && <p className="feed-item__note">{i.note}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
