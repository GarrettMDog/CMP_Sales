import { Button } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';

// Reusable slide-over panel. Overlays the current view from the right on
// desktop; full-screen on mobile (see .drawer styles). Renders nothing when
// closed. Content is whatever children you pass.
export default function Drawer({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={title || 'Panel'}>
        <div className="drawer__header">
          <h3>{title}</h3>
          <Button
            appearance="subtle"
            icon={<Dismiss24Regular />}
            onClick={onClose}
            aria-label="Close"
          />
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  );
}
