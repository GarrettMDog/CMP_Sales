import { useState, useEffect } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Option, Textarea,
} from '@fluentui/react-components';
import { api } from '../api.js';
import Drawer from './Drawer.jsx';
import { formatDate, formatDateOnly } from '../dateUtils.js';

const TYPE_LABELS = {
  call: 'Phone call', email: 'Email', coffee: 'Coffee / meal',
  in_person: 'In Person', event: 'Event', message: 'Message', other: 'Other',
};

const TEMP_COLORS = { Hot: 'danger', Warm: 'warning', Cold: 'informative' };

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

// A quick-reference panel for a contact, opened from inside a project (or
// anywhere) so you don't lose your place. Shows summary + recent history, lets
// you log a touchpoint on the spot, and can expand to the full contact page.
export default function ContactPeek({
  open, contactId, token, currentUser, defaultProjectId, onClose, onOpenFull,
}) {
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const [logProjectId, setLogProjectId] = useState(''); // '' = None (2+ projects only)
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !contactId || !token) { setContact(null); return; }
    setLoading(true);
    setNote(''); setType('call'); setLogProjectId('');
    api.getContact(contactId, token)
      .then((c) => {
        setContact(c);
        // Default the tag to the project this peek was opened from, so logging
        // from a project tags to it — but only when it's ambiguous (2+ projects)
        // and that project is one this contact is linked to. For a single-project
        // contact the backend auto-tags anyway.
        const projs = c.projects || [];
        if (defaultProjectId && projs.length >= 2 && projs.some((p) => p.id === defaultProjectId)) {
          setLogProjectId(defaultProjectId);
        }
      })
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [open, contactId, token, defaultProjectId]);

  async function reload() {
    const c = await api.getContact(contactId, token);
    setContact(c);
  }

  const contactProjects = (contact && contact.projects) || [];
  const projectName = (id) => (contactProjects.find((p) => p.id === id) || {}).name;

  async function handleLog() {
    setSubmitting(true);
    try {
      const data = { authorName: currentUser.name, authorEmail: currentUser.email, type, note };
      if (contactProjects.length >= 2) data.projectId = logProjectId || null;
      await api.logInteraction(contactId, data, token);
      setNote(''); setLogProjectId('');
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Contact">
      {loading && <p className="contact-detail__empty-history">Loading…</p>}
      {!loading && contact && (
        <div className="peek">
          <div className="peek__summary">
            <Avatar name={contact.name} initials={initials(contact.name)} size={40} color="colorful" />
            <div>
              <div className="peek__name">{contact.name}</div>
              <div className="peek__sub">
                {contact.role || 'No role set'}{contact.company ? ` · ${contact.company}` : ''}
              </div>
            </div>
            {contact.temperature && (
              <Badge appearance="tint" color={TEMP_COLORS[contact.temperature] || 'informative'} size="small">
                {contact.temperature}
              </Badge>
            )}
          </div>

          {(contact.phone || contact.email) && (
            <div className="peek__contactinfo">
              {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>}
              {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
            </div>
          )}

          {contact.nextReminderAt && (
            <div className={`peek__followup ${daysUntil(contact.nextReminderAt) <= 0 ? 'peek__followup--due' : ''}`}>
              {daysUntil(contact.nextReminderAt) <= 0 ? 'Follow-up overdue' : 'Follow-up due'} {formatDateOnly(contact.nextReminderAt)}
            </div>
          )}

          <div className="peek__log">
            <div className="peek__log-title">Log a touchpoint</div>
            <Dropdown value={TYPE_LABELS[type]} onOptionSelect={(_, d) => setType(d.optionValue)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <Option key={value} value={value}>{label}</Option>
              ))}
            </Dropdown>
            {contactProjects.length === 1 && (
              <div className="log-interaction__project-hint">Tags to {contactProjects[0].name}</div>
            )}
            {contactProjects.length >= 2 && (
              <Dropdown
                placeholder="None"
                value={logProjectId ? projectName(logProjectId) : 'None'}
                selectedOptions={[logProjectId]}
                onOptionSelect={(_, d) => setLogProjectId(d.optionValue)}
              >
                <Option value="">None</Option>
                {contactProjects.map((p) => (
                  <Option key={p.id} value={p.id}>{p.name}</Option>
                ))}
              </Dropdown>
            )}
            <Textarea
              placeholder={`What did you and ${contact.name} talk about?`}
              value={note}
              onChange={(_, d) => setNote(d.value)}
            />
            <Button appearance="primary" disabled={submitting} onClick={handleLog}>
              Log as {currentUser.name}
            </Button>
          </div>

          <div className="peek__history">
            <div className="peek__log-title">Recent history</div>
            {(!contact.interactions || contact.interactions.length === 0) && (
              <p className="contact-detail__empty-history">No touchpoints yet.</p>
            )}
            {(contact.interactions || []).slice(0, 5).map((i) => (
              <div key={i.id} className="peek__event">
                <div className="peek__event-top">
                  <strong>{TYPE_LABELS[i.type] || i.type}</strong>
                  <span className="timeline-item__date">{formatDate(i.occurredAt)}</span>
                </div>
                {i.note && <p className="peek__event-note">{i.note}</p>}
                <div className="peek__event-author">{i.authorName}</div>
              </div>
            ))}
            {contact.hiddenPrivateCount > 0 && (
              <p className="contact-detail__empty-history">
                {contact.hiddenPrivateCount} private {contact.hiddenPrivateCount === 1 ? 'email' : 'emails'} hidden.
              </p>
            )}
          </div>

          <Button appearance="secondary" onClick={() => onOpenFull(contactId)}>
            Open full contact page
          </Button>
        </div>
      )}
    </Drawer>
  );
}
