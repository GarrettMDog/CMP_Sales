import { useState } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Option,
} from '@fluentui/react-components';
import {
  Edit24Regular, Delete24Regular, Dismiss24Regular,
} from '@fluentui/react-icons';
import { STATUS_COLORS } from './ProjectList.jsx';

const TYPE_LABELS = {
  call: 'Phone call', email: 'Email', coffee: 'Coffee / meal',
  in_person: 'In Person', event: 'Event', message: 'Message', other: 'Other',
};

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${mm}/${dd}/${yy} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

function formatDateOnly(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

export default function ProjectDetail({
  project, allContacts, onEdit, onDelete, onLinkContact, onUnlinkContact, onOpenContact,
}) {
  const [feedView, setFeedView] = useState('all'); // 'all' | 'tagged'

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
        </div>
        <div className="contact-detail__actions">
          <Button size="small" appearance="subtle" icon={<Edit24Regular />} onClick={() => onEdit(project)}>Edit</Button>
          <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => onDelete(project)}>Delete</Button>
        </div>
      </div>

      {project.notes && <p className="project-detail__notes">{project.notes}</p>}

      <div className="project-detail__contacts">
        <h3>Contacts on this project</h3>
        <div className="project-contact-add">
          <Dropdown
            placeholder="Add a contact to this project…"
            selectedOptions={[]}
            value=""
            onOptionSelect={(_, d) => { if (d.optionValue) onLinkContact(d.optionValue); }}
          >
            {available.length === 0 && <Option value="" disabled>All contacts already linked</Option>}
            {available.map((c) => (
              <Option key={c.id} value={c.id}>
                {c.name}{c.company ? ` · ${c.company}` : ''}
              </Option>
            ))}
          </Dropdown>
        </div>

        {(project.contacts || []).length === 0 && (
          <p className="contact-detail__empty-history">No contacts linked yet. Add one above.</p>
        )}
        <div className="project-contact-chips">
          {(project.contacts || []).map((c) => (
            <span key={c.id} className="project-contact-chip">
              <button type="button" className="project-contact-chip__name" onClick={() => onOpenContact && onOpenContact(c.id)}>
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
                <button type="button" className="project-feed__contact" onClick={() => onOpenContact && onOpenContact(i.contactId)}>
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
