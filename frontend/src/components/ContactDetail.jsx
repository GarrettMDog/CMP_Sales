import { useState } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Option, Textarea, Field, Divider,
} from '@fluentui/react-components';
import {
  Call24Regular, Mail24Regular, FoodCake24Regular, Edit24Regular, Delete24Regular,
  Clock24Regular, PersonAdd24Regular,
} from '@fluentui/react-icons';

const TEMP_COLORS = {
  Hot: 'danger',
  Warm: 'warning',
  Cold: 'informative',
  'Needs Follow-up': 'important',
};

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

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBirthday(mmdd) {
  if (!mmdd) return null;
  const [mm, dd] = mmdd.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[mm - 1]} ${dd}`;
}

export default function ContactDetail({
  contact, currentUser, onLogInteraction, onEdit, onDelete,
}) {
  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!contact) {
    return (
      <div className="contact-detail contact-detail--empty">
        <p>Select a contact, or add a new one to get started.</p>
      </div>
    );
  }

  const overdue = contact.nextReminderAt && new Date(contact.nextReminderAt) <= new Date();

  async function handleLog() {
    setSubmitting(true);
    try {
      await onLogInteraction(contact.id, {
        authorName: currentUser.name,
        authorEmail: currentUser.email,
        type,
        note,
      });
      setNote('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="contact-detail">
      <div className="contact-detail__header">
        <Avatar name={contact.name} initials={initials(contact.name)} size={64} color="colorful" />
        <div className="contact-detail__heading">
          <h2>{contact.name}</h2>
          <div className="contact-detail__subtitle">
            {contact.role ? `${contact.role} · ` : ''}{contact.company || 'No company set'}
          </div>
          <div className="contact-detail__badges">
            <Badge appearance="tint" color={TEMP_COLORS[contact.temperature] || 'informative'}>
              {contact.temperature}
            </Badge>
            {overdue && <Badge appearance="tint" color="important">Follow-up due</Badge>}
          </div>
        </div>
        <div className="contact-detail__actions">
          <Button icon={<Edit24Regular />} appearance="subtle" onClick={() => onEdit(contact)}>Edit</Button>
          <Button icon={<Delete24Regular />} appearance="subtle" onClick={() => onDelete(contact.id)}>Delete</Button>
        </div>
      </div>

      <div className="contact-detail__facts">
        {contact.email && <div><Mail24Regular /> {contact.email}</div>}
        {contact.phone && <div><Call24Regular /> {contact.phone}</div>}
        {contact.birthday && <div><FoodCake24Regular /> {formatBirthday(contact.birthday)}</div>}
        <div>
          <Clock24Regular /> Check in every {contact.recurrenceDays} days
        </div>
      </div>

      {contact.howYouKnowThem && (
        <p className="contact-detail__context">{contact.howYouKnowThem}</p>
      )}

      <div className="contact-detail__reminder-info">
        <PersonAdd24Regular />
        <span>
          {contact.lastContactedBy
            ? `Last contacted by ${contact.lastContactedBy} on ${formatDate(contact.lastContactedAt)}. `
            : 'No interactions logged yet. '}
          {contact.nextReminderAt && (
            <>Next reminder goes to <strong>whoever logs the next touchpoint</strong> on {formatDate(contact.nextReminderAt)}.</>
          )}
        </span>
      </div>

      <Divider />

      <div className="log-interaction">
        <Field label="Log a new touchpoint">
          <div className="log-interaction__row">
            <Dropdown value={TYPE_LABELS[type]} onOptionSelect={(_, d) => setType(d.optionValue)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <Option key={value} value={value}>{label}</Option>
              ))}
            </Dropdown>
          </div>
        </Field>
        <Textarea
          placeholder={`What did you and ${contact.name} talk about?`}
          value={note}
          onChange={(_, d) => setNote(d.value)}
        />
        <Button appearance="primary" disabled={submitting} onClick={handleLog}>
          Log as {currentUser.name}
        </Button>
      </div>

      <Divider />

      <div className="interaction-timeline">
        <h3>History</h3>
        {(!contact.interactions || contact.interactions.length === 0) && (
          <p className="contact-detail__empty-history">No touchpoints logged yet.</p>
        )}
        {contact.interactions && contact.interactions.map((i) => (
          <div key={i.id} className="timeline-item">
            <Avatar name={i.authorName} initials={initials(i.authorName)} size={28} />
            <div className="timeline-item__body">
              <div className="timeline-item__top">
                <strong>{i.authorName}</strong>
                <span className="timeline-item__type">{TYPE_LABELS[i.type] || i.type}</span>
                <span className="timeline-item__date">{formatDate(i.occurredAt)}</span>
              </div>
              {i.note && <p>{i.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
