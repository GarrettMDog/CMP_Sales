import { useState } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Option, Combobox, Textarea,
} from '@fluentui/react-components';
import {
  Edit24Regular, Delete24Regular, Dismiss24Regular, History24Regular as HistoryRegular,
} from '@fluentui/react-icons';
import { STATUS_COLORS } from './ProjectList.jsx';
import Drawer from './Drawer.jsx';
import { formatDate, formatDateOnly } from '../dateUtils.js';

const TYPE_LABELS = {
  call: 'Phone call', email: 'Email', coffee: 'Coffee / meal',
  in_person: 'In Person', event: 'Event', message: 'Message', other: 'Other',
};

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// Starts-with match on either the contact's name OR company, so typing a GC
// name (e.g. "Turner") surfaces everyone there.
function contactMatches(c, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (c.name || '').toLowerCase().startsWith(q)
    || (c.company || '').toLowerCase().startsWith(q);
}

export default function ProjectDetail({
  project, allContacts, onEdit, onDelete, onLinkContact, onUnlinkContact, onAddEvent, onOpenContact, onPeekContact,
}) {
  const [feedView, setFeedView] = useState('all'); // 'all' | 'tagged'
  const [contactQuery, setContactQuery] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  if (!project) {
    return (
      <div className="contact-detail contact-detail--empty">
        <p>Select a project, or add a new one to get started.</p>
      </div>
    );
  }

  const linkedIds = new Set((project.contacts || []).map((c) => c.id));
  const available = (allContacts || []).filter((c) => !linkedIds.has(c.id));
  const conversations = feedView === 'tagged' ? project.taggedConversations : project.allConversations;

  // Friendly labels for auto-logged status milestones.
  const STATUS_EVENT_LABEL = {
    Bidding: 'Set to Bidding',
    Submitted: 'Bid submitted',
    Won: 'Marked Won',
    Lost: 'Marked Lost',
    Complete: 'Marked Complete',
  };
  function eventTitle(ev) {
    if (ev.kind === 'created') return 'Project created';
    if (ev.kind === 'status') return STATUS_EVENT_LABEL[ev.label] || `Status: ${ev.label}`;
    return 'Note';
  }

  async function handleAddNote() {
    if (!eventNote.trim()) return;
    setAddingNote(true);
    try {
      await onAddEvent(eventNote.trim());
      setEventNote('');
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <div className="contact-detail">
      <div className="contact-detail__header">
        <div className="contact-detail__heading">
          <h2>{project.name}</h2>
          <div className="contact-detail__subtitle">
            {project.customer || 'No customer set'}
          </div>
          <div className="contact-detail__badges">
            <Badge appearance="tint" color={STATUS_COLORS[project.status] || 'informative'}>
              {project.status}
            </Badge>
            {project.value != null && (
              <Badge appearance="tint" color="informative">${Number(project.value).toLocaleString()}</Badge>
            )}
            {project.bidDueDate && (
              <Badge appearance="tint" color="important">Bid due {formatDateOnly(project.bidDueDate)}</Badge>
            )}
          </div>
          <div className="project-detail__created-by">Created by {project.createdBy || '—'}</div>
        </div>
        <div className="contact-detail__actions">
          <Button size="small" appearance="subtle" icon={<HistoryRegular />} onClick={() => setTimelineOpen(true)}>
            Timeline{project.events && project.events.length ? ` (${project.events.length})` : ''}
          </Button>
          <Button size="small" appearance="subtle" icon={<Edit24Regular />} onClick={() => onEdit(project)}>Edit</Button>
          <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => onDelete(project)}>Delete</Button>
        </div>
      </div>

      {project.notes && <p className="project-detail__notes">{project.notes}</p>}

      <div className="project-detail__contacts">
        <h3>Contacts on this project</h3>
        <div className="project-contact-add">
          <Combobox
            placeholder="Add a contact to this project…"
            freeform
            value={contactQuery}
            selectedOptions={[]}
            onChange={(e) => setContactQuery(e.target.value)}
            onOptionSelect={(_, d) => { if (d.optionValue) { onLinkContact(d.optionValue); setContactQuery(''); } }}
          >
            {available.filter((c) => contactMatches(c, contactQuery)).length === 0 && (
              <Option value="" disabled>
                {available.length === 0 ? 'All contacts already linked' : 'No matches'}
              </Option>
            )}
            {available
              .filter((c) => contactMatches(c, contactQuery))
              .map((c) => (
                <Option key={c.id} value={c.id}>
                  {c.name}{c.company ? ` · ${c.company}` : ''}
                </Option>
              ))}
          </Combobox>
        </div>

        {(project.contacts || []).length === 0 && (
          <p className="contact-detail__empty-history">No contacts linked yet. Add one above.</p>
        )}
        <div className="project-contact-chips">
          {(project.contacts || []).map((c) => (
            <span key={c.id} className="project-contact-chip">
              <button type="button" className="project-contact-chip__name" onClick={() => (onPeekContact || onOpenContact)(c.id)}>
                <Avatar name={c.name} initials={initials(c.name)} size={20} color="colorful" />
                {c.name}
              </button>
              <button
                type="button"
                className="project-contact-chip__remove"
                aria-label={`Remove ${c.name} from project`}
                onClick={() => onUnlinkContact(c.id)}
              >
                <Dismiss24Regular />
              </button>
            </span>
          ))}
        </div>
      </div>

      <Drawer open={timelineOpen} onClose={() => setTimelineOpen(false)} title="Timeline">
        <div className="project-timeline__add">
          <Textarea
            placeholder="Add a note to the project timeline…"
            value={eventNote}
            onChange={(_, d) => setEventNote(d.value)}
          />
          <Button appearance="primary" disabled={addingNote || !eventNote.trim()} onClick={handleAddNote}>
            Add note
          </Button>
        </div>

        {(!project.events || project.events.length === 0) && (
          <p className="contact-detail__empty-history">No timeline events yet.</p>
        )}
        {(project.events || []).map((ev) => (
          <div key={ev.id} className={`project-timeline__item project-timeline__item--${ev.kind}`}>
            <span className="project-timeline__dot" aria-hidden="true" />
            <div className="project-timeline__body">
              <div className="project-timeline__top">
                <strong>{eventTitle(ev)}</strong>
                <span className="timeline-item__date">{formatDate(ev.occurredAt)}</span>
              </div>
              {ev.note && <p className="project-timeline__note">{ev.note}</p>}
              {ev.authorName && <div className="project-timeline__author">{ev.authorName}</div>}
            </div>
          </div>
        ))}
      </Drawer>

      <div className="interaction-timeline">
        <div className="project-feed__toggle">
          <Button
            size="small"
            appearance={feedView === 'all' ? 'primary' : 'subtle'}
            onClick={() => setFeedView('all')}
          >
            All from linked contacts
          </Button>
          <Button
            size="small"
            appearance={feedView === 'tagged' ? 'primary' : 'subtle'}
            onClick={() => setFeedView('tagged')}
          >
            Tagged to this project
          </Button>
        </div>

        {(!conversations || conversations.length === 0) && (
          <p className="contact-detail__empty-history">
            {feedView === 'tagged'
              ? 'No conversations tagged to this project yet.'
              : 'No conversations with linked contacts yet.'}
          </p>
        )}

        {conversations && conversations.map((i) => (
          <div key={i.id} className="timeline-item">
            <Avatar name={i.authorName} initials={initials(i.authorName)} size={28} />
            <div className="timeline-item__body">
              <div className="timeline-item__top">
                <strong>{i.authorName}</strong>
                <span className="timeline-item__type">{TYPE_LABELS[i.type] || i.type}</span>
                <button type="button" className="project-feed__contact" onClick={() => (onPeekContact || onOpenContact)(i.contactId)}>
                  {i.contactName}
                </button>
                <span className="timeline-item__date">{formatDate(i.occurredAt)}</span>
                {feedView === 'all' && i.projectId === project.id && (
                  <span className="project-feed__tag">tagged</span>
                )}
              </div>
              {i.note && <p>{i.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
