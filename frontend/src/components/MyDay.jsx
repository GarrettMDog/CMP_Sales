import { useState, useEffect } from 'react';
import { Avatar, Badge, Spinner } from '@fluentui/react-components';
import { api } from '../api.js';
import { STATUS_COLORS } from './ProjectList.jsx';

const TEMP_COLORS = { Hot: 'danger', Warm: 'warning', Cold: 'informative' };

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function formatDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
function dueLabel(f) {
  if (f.daysUntil <= 0) {
    const n = Math.abs(f.daysUntil);
    return n === 0 ? 'Due today' : `${n} day${n === 1 ? '' : 's'} overdue`;
  }
  return `Due in ${f.daysUntil} day${f.daysUntil === 1 ? '' : 's'}`;
}
function bidLabel(iso) {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso) - new Date()) / 86400000);
  if (days < 0) return { text: `Bid due ${formatDateOnly(iso)} (past)`, urgent: true };
  if (days === 0) return { text: 'Bid due today', urgent: true };
  if (days <= 7) return { text: `Bid due in ${days} day${days === 1 ? '' : 's'}`, urgent: true };
  return { text: `Bid due ${formatDateOnly(iso)}`, urgent: false };
}

// The rep's personal landing view: who they owe a follow-up (on their own
// clock, participation-based) and their projects with bid deadlines. Rows tap
// into the existing peek drawers so it's see-it, tap-it, log-it.
export default function MyDay({ token, userName, refreshSignal, onPeekContact, onPeekProject }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getMyDay(token)
      .then(setData)
      .catch(() => setData({ followups: [], projects: [] }))
      .finally(() => setLoading(false));
  }, [token, refreshSignal]);

  if (loading) {
    return <div className="myday"><Spinner label="Loading your day…" /></div>;
  }

  const followups = (data && data.followups) || [];
  const projects = (data && data.projects) || [];
  const overdue = followups.filter((f) => f.overdue);
  const upcoming = followups.filter((f) => !f.overdue);
  const firstName = (userName || '').split(' ')[0];

  return (
    <div className="myday">
      <div className="myday__greeting">
        {firstName ? `Here's your day, ${firstName}.` : "Here's your day."}
      </div>

      <section className="myday__section">
        <h3>Follow-ups {followups.length > 0 && <span className="myday__count">{followups.length}</span>}</h3>
        {followups.length === 0 && (
          <p className="myday__empty">You're all caught up — no follow-ups due. Nice.</p>
        )}

        {overdue.length > 0 && <div className="myday__subhead myday__subhead--due">Overdue</div>}
        {overdue.map((f) => renderFollowup(f, onPeekContact))}

        {upcoming.length > 0 && <div className="myday__subhead">Coming up</div>}
        {upcoming.map((f) => renderFollowup(f, onPeekContact))}
      </section>

      <section className="myday__section">
        <h3>My projects {projects.length > 0 && <span className="myday__count">{projects.length}</span>}</h3>
        {projects.length === 0 && (
          <p className="myday__empty">No projects created by you yet.</p>
        )}
        {projects.map((p) => {
          const bid = bidLabel(p.bidDueDate);
          return (
            <button
              type="button"
              key={p.id}
              className="myday__row"
              onClick={() => onPeekProject && onPeekProject(p.id)}
            >
              <div className="myday__row-body">
                <div className="myday__row-top">
                  <span className="myday__row-name">{p.name}</span>
                  <Badge appearance="tint" color={STATUS_COLORS[p.status] || 'informative'} size="small">
                    {p.status}
                  </Badge>
                </div>
                <div className="myday__row-meta">
                  {p.customer || 'No customer'}
                  {bid && <span className={bid.urgent ? 'myday__due myday__due--urgent' : 'myday__due'}> · {bid.text}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function renderFollowup(f, onPeekContact) {
  return (
    <button
      type="button"
      key={f.id}
      className="myday__row"
      onClick={() => onPeekContact && onPeekContact(f.id)}
    >
      <Avatar name={f.name} initials={initials(f.name)} color="colorful" size={32} />
      <div className="myday__row-body">
        <div className="myday__row-top">
          <span className="myday__row-name">{f.name}</span>
          {f.temperature && (
            <Badge appearance="tint" color={TEMP_COLORS[f.temperature] || 'informative'} size="small">
              {f.temperature}
            </Badge>
          )}
          {f.sharedWith && f.sharedWith.length > 0 && (
            <Badge appearance="outline" color="informative" size="small">
              Shared
            </Badge>
          )}
        </div>
        <div className="myday__row-meta">
          {f.company ? `${f.company} · ` : ''}
          <span className={f.overdue ? 'myday__due myday__due--urgent' : 'myday__due'}>{dueLabel(f)}</span>
          {f.sharedWith && f.sharedWith.length > 0 && (
            <span className="myday__shared"> · also {f.sharedWith.join(', ')}</span>
          )}
        </div>
      </div>
    </button>
  );
}
