import { useState, useEffect } from 'react';
import { Avatar, Badge, Button } from '@fluentui/react-components';
import { api } from '../api.js';
import Drawer from './Drawer.jsx';
import { STATUS_COLORS } from './ProjectList.jsx';

const STATUS_EVENT_LABEL = {
  Bidding: 'Set to Bidding', Submitted: 'Bid submitted',
  Won: 'Marked Won', Lost: 'Marked Lost', Complete: 'Marked Complete',
};

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
function eventTitle(ev) {
  if (ev.kind === 'created') return 'Project created';
  if (ev.kind === 'status') return STATUS_EVENT_LABEL[ev.label] || `Status: ${ev.label}`;
  return 'Note';
}

// A quick-reference panel for a project, opened from a contact so you don't
// lose your place. Read-only summary + recent timeline + linked contacts, with
// an expand button to the full project page.
export default function ProjectPeek({ open, projectId, token, onClose, onOpenFull }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId || !token) { setProject(null); return; }
    setLoading(true);
    api.getProject(projectId, token)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [open, projectId, token]);

  return (
    <Drawer open={open} onClose={onClose} title="Project">
      {loading && <p className="contact-detail__empty-history">Loading…</p>}
      {!loading && project && (
        <div className="peek">
          <div>
            <div className="peek__name">{project.name}</div>
            <div className="peek__sub">{project.customer || 'No customer set'}</div>
            <div className="contact-detail__badges" style={{ marginTop: 8 }}>
              <Badge appearance="tint" color={STATUS_COLORS[project.status] || 'informative'}>
                {project.status}
              </Badge>
              {project.value != null && (
                <Badge appearance="tint" color="informative">${Number(project.value).toLocaleString()}</Badge>
              )}
              {project.bidDueDate && (
                <Badge appearance="tint" color="important">Bid due {formatDate(project.bidDueDate)}</Badge>
              )}
            </div>
          </div>

          {project.notes && <p className="project-detail__notes">{project.notes}</p>}

          <div className="peek__history">
            <div className="peek__log-title">Contacts on this project</div>
            {(project.contacts || []).length === 0 && (
              <p className="contact-detail__empty-history">No contacts linked.</p>
            )}
            <div className="project-contact-chips">
              {(project.contacts || []).map((c) => (
                <span key={c.id} className="project-contact-chip">
                  <span className="project-contact-chip__name">
                    <Avatar name={c.name} initials={initials(c.name)} size={20} color="colorful" />
                    {c.name}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="peek__history">
            <div className="peek__log-title">Recent timeline</div>
            {(!project.events || project.events.length === 0) && (
              <p className="contact-detail__empty-history">No timeline events yet.</p>
            )}
            {(project.events || []).slice(-5).reverse().map((ev) => (
              <div key={ev.id} className="peek__event">
                <div className="peek__event-top">
                  <strong>{eventTitle(ev)}</strong>
                  <span className="timeline-item__date">{formatDate(ev.occurredAt)}</span>
                </div>
                {ev.note && <p className="peek__event-note">{ev.note}</p>}
              </div>
            ))}
          </div>

          <Button appearance="secondary" onClick={() => onOpenFull(projectId)}>
            Open full project page
          </Button>
        </div>
      )}
    </Drawer>
  );
}
