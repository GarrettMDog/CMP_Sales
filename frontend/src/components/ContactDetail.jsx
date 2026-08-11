import { useState } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Option, Textarea, Field, Divider, Combobox,
} from '@fluentui/react-components';
import {
  Call24Regular, Mail24Regular, FoodCake24Regular, Edit24Regular, Delete24Regular,
  Clock24Regular, PersonAdd24Regular, LockClosed24Regular,
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
  in_person: 'In Person',
  event: 'Event',
  message: 'Message',
  other: 'Other',
};

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// mm/dd/yy hh:mm AM/PM — e.g. "07/16/26 03:45 PM"
function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yy} ${hh}:${min} ${ampm}`;
}

// Date-only version, used just for the reminder due-date line.
function formatDateOnly(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function formatBirthday(mmdd) {
  if (!mmdd) return null;
  const [mm, dd] = mmdd.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[mm - 1]} ${dd}`;
}

// Strips anything that isn't a digit or a leading + , so phone numbers typed
// with dashes/spaces/parens still produce a valid tel: link.
function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

// Starts-with match on either the project's name OR customer, so typing a GC
// name surfaces that customer's projects.
function projectMatches(p, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (p.name || '').toLowerCase().startsWith(q)
    || (p.customer || '').toLowerCase().startsWith(q);
}

export default function ContactDetail({
  contact, currentUser, onLogInteraction, onEditInteraction, onEdit, onDelete,
  allProjects, onLinkProject, onUnlinkProject, onOpenProject,
}) {
  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logProjectId, setLogProjectId] = useState(''); // '' = None (only used when 2+ projects)

  const [editingInteractionId, setEditingInteractionId] = useState(null);
  const [editingType, setEditingType] = useState('call');
  const [editingNote, setEditingNote] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [projectQuery, setProjectQuery] = useState('');

  if (!contact) {
    return (
      <div className="contact-detail contact-detail--empty">
        <p>Select a contact, or add a new one to get started.</p>
      </div>
    );
  }

  const contactProjects = contact.projects || [];
  const projectName = (id) => (contactProjects.find((p) => p.id === id) || {}).name;
  const linkedProjectIds = new Set(contactProjects.map((p) => p.id));
  const availableProjects = (allProjects || []).filter((p) => !linkedProjectIds.has(p.id));

  const overdue = contact.nextReminderAt && new Date(contact.nextReminderAt) <= new Date();

  async function handleLog() {
    setSubmitting(true);
    try {
      const data = {
        authorName: currentUser.name,
        authorEmail: currentUser.email,
        type,
        note,
      };
      // 0 projects → omit (nothing to tag). 1 → omit, backend auto-tags to the
      // single project. 2+ → send the rep's explicit choice ('' = None → null).
      if (contactProjects.length >= 2) {
        data.projectId = logProjectId || null;
      }
      await onLogInteraction(contact.id, data);
      setNote('');
      setLogProjectId('');
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
        {contact.email && (
          <a className="contact-detail__fact-link" href={`mailto:${contact.email}`}>
            <Mail24Regular /> {contact.email}
          </a>
        )}
        {contact.phone && (
          <a className="contact-detail__fact-link" href={telHref(contact.phone)}>
            <Call24Regular /> {contact.phone}
          </a>
        )}
        {contact.birthday && <div><FoodCake24Regular /> {formatBirthday(contact.birthday)}</div>}
        <div>
          <Clock24Regular /> Check in every {contact.recurrenceDays} days
        </div>
        <div className="contact-detail__added-by">
          <PersonAdd24Regular /> Added by {contact.createdBy || '—'}
        </div>
      </div>

      {contact.howYouKnowThem && (
        <p className="contact-detail__context">{contact.howYouKnowThem}</p>
      )}

      <div className="contact-detail__projects">
        <h3>Projects</h3>
        <div className="project-contact-add">
          <Combobox
            placeholder="Add this contact to a project…"
            freeform
            value={projectQuery}
            selectedOptions={[]}
            onChange={(e) => setProjectQuery(e.target.value)}
            onOptionSelect={(_, d) => { if (d.optionValue) { onLinkProject(d.optionValue); setProjectQuery(''); } }}
          >
            {availableProjects.filter((p) => projectMatches(p, projectQuery)).length === 0 && (
              <Option value="" disabled>
                {availableProjects.length === 0 ? 'No other projects to add' : 'No matches'}
              </Option>
            )}
            {availableProjects
              .filter((p) => projectMatches(p, projectQuery))
              .map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.name}{p.customer ? ` · ${p.customer}` : ''}
                </Option>
              ))}
          </Combobox>
        </div>
        {contactProjects.length === 0 ? (
          <p className="contact-detail__empty-history">Not on any projects yet.</p>
        ) : (
          <div className="project-contact-chips">
            {contactProjects.map((p) => (
              <span key={p.id} className="project-contact-chip">
                <button type="button" className="project-contact-chip__name" onClick={() => onOpenProject && onOpenProject(p.id)}>
                  {p.name}
                </button>
                <button
                  type="button"
                  className="project-contact-chip__remove"
                  aria-label={`Remove from ${p.name}`}
                  onClick={() => onUnlinkProject(p.id)}
                >
                  <Delete24Regular />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="contact-detail__reminder-info">
        <PersonAdd24Regular />
        <span>
          {contact.lastContactedBy
            ? `Last contacted by ${contact.lastContactedBy} on ${formatDate(contact.lastContactedAt)}. `
            : 'No interactions logged yet. '}
          {contact.nextReminderAt && (
            <>Follow-up due {formatDateOnly(contact.nextReminderAt)}.</>
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

        {contactProjects.length === 1 && (
          <div className="log-interaction__project-hint">
            <span>Tags to {contactProjects[0].name}</span>
          </div>
        )}
        {contactProjects.length >= 2 && (
          <Field label="Tag to project">
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
          </Field>
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

      <Divider />

      <div className="interaction-timeline">
        <h3>History</h3>
        {(contact.hiddenPrivateCount > 0) && (
          <div className="interaction-timeline__private-note">
            <LockClosed24Regular />
            <span>
              {contact.hiddenPrivateCount} private {contact.hiddenPrivateCount === 1 ? 'email' : 'emails'}
              {' '}— visible only to the sender and executives.
            </span>
          </div>
        )}
        {(!contact.interactions || contact.interactions.length === 0)
          && !(contact.hiddenPrivateCount > 0) && (
          <p className="contact-detail__empty-history">No touchpoints logged yet.</p>
        )}
        {contact.interactions && contact.interactions.map((i) => (
          <div key={i.id} className="timeline-item">
            <Avatar name={i.authorName} initials={initials(i.authorName)} size={28} />
            <div className="timeline-item__body">
              <div className="timeline-item__top">
                <strong>{i.authorName}</strong>
                {editingInteractionId !== i.id && (
                  <span className="timeline-item__type">{TYPE_LABELS[i.type] || i.type}</span>
                )}
                <span className="timeline-item__date">{formatDate(i.occurredAt)}</span>
                {i.editedAt && <span className="timeline-item__edited">(edited)</span>}
                {editingInteractionId !== i.id && i.projectId && (
                  <span className="project-feed__tag">{projectName(i.projectId) || 'tagged'}</span>
                )}
                {editingInteractionId !== i.id && (
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Edit24Regular />}
                    onClick={() => {
                      setEditingInteractionId(i.id);
                      setEditingType(i.type);
                      setEditingNote(i.note || '');
                      setEditingProjectId(i.projectId || '');
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {editingInteractionId === i.id ? (
                <div className="timeline-item__edit">
                  <Dropdown
                    value={TYPE_LABELS[editingType] || editingType}
                    onOptionSelect={(_, d) => setEditingType(d.optionValue)}
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <Option key={value} value={value}>{label}</Option>
                    ))}
                  </Dropdown>
                  <Textarea
                    value={editingNote}
                    onChange={(_, d) => setEditingNote(d.value)}
                  />
                  {contactProjects.length >= 1 && (
                    <Dropdown
                      placeholder="None"
                      value={editingProjectId ? projectName(editingProjectId) : 'None'}
                      selectedOptions={[editingProjectId]}
                      onOptionSelect={(_, d) => setEditingProjectId(d.optionValue)}
                    >
                      <Option value="">None</Option>
                      {contactProjects.map((p) => (
                        <Option key={p.id} value={p.id}>{p.name}</Option>
                      ))}
                    </Dropdown>
                  )}
                  <div className="timeline-item__edit-actions">
                    <Button
                      size="small"
                      appearance="secondary"
                      onClick={() => setEditingInteractionId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      appearance="primary"
                      onClick={async () => {
                        const payload = { type: editingType, note: editingNote };
                        // Only send projectId when the contact has projects, so
                        // we never clobber a tag on a 0-project contact.
                        if (contactProjects.length >= 1) payload.projectId = editingProjectId || null;
                        await onEditInteraction(i.id, payload);
                        setEditingInteractionId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                i.note && <p>{i.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
