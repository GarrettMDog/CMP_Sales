import { Avatar, Badge } from '@fluentui/react-components';
import { formatDate } from '../dateUtils.js';

const TYPE_LABELS = {
  call: 'Phone call',
  email: 'Email',
  coffee: 'Coffee / meal',
  in_person: 'In Person',
  event: 'Event',
  message: 'Message',
  other: 'Other',
};

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function highlightMatch(note, query) {
  if (!note) return null;
  const idx = note.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return note;

  const start = Math.max(0, idx - 40);
  const end = Math.min(note.length, idx + query.length + 40);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < note.length ? '…' : '';
  const before = note.slice(start, idx);
  const match = note.slice(idx, idx + query.length);
  const after = note.slice(idx + query.length, end);

  return (
    <>
      {prefix}{before}<mark className="search-highlight">{match}</mark>{after}{suffix}
    </>
  );
}

export default function MessageSearchResults({ query, results, loading, onSelectContact }) {
  return (
    <div className="message-search-results">
      <h3>Messages matching &ldquo;{query}&rdquo;</h3>

      {loading && <p className="muted">Searching…</p>}

      {!loading && results.length === 0 && (
        <p className="muted">No messages found mentioning &ldquo;{query}&rdquo;.</p>
      )}

      {!loading && results.map((r) => (
        <button
          type="button"
          key={r.id}
          className="message-match"
          onClick={() => onSelectContact(r.contactId)}
        >
          <Avatar name={r.contactName} initials={initials(r.contactName)} size={32} color="colorful" />
          <div className="message-match__body">
            <div className="message-match__top">
              <strong>{r.contactName}</strong>
              {r.contactCompany && <span className="muted"> · {r.contactCompany}</span>}
            </div>
            <div className="message-match__meta">
              <Badge appearance="tint" size="small">{TYPE_LABELS[r.type] || r.type}</Badge>
              <span className="muted"> logged by {r.authorName} · {formatDate(r.occurredAt)}</span>
            </div>
            {r.note && <p className="message-match__snippet">{highlightMatch(r.note, query)}</p>}
          </div>
        </button>
      ))}
    </div>
  );
}
