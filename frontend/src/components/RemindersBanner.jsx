import { Badge } from '@fluentui/react-components';
import { Alert24Regular, Gift24Regular } from '@fluentui/react-icons';

export default function RemindersBanner({ dueContacts, upcomingBirthdays, onSelect }) {
  if ((!dueContacts || dueContacts.length === 0) && (!upcomingBirthdays || upcomingBirthdays.length === 0)) {
    return null;
  }

  return (
    <div className="reminders-banner">
      {dueContacts && dueContacts.length > 0 && (
        <div className="reminders-banner__row">
          <Alert24Regular />
          <span>
            {dueContacts.length} relationship{dueContacts.length > 1 ? 's need' : ' needs'} a follow-up:
          </span>
          <div className="reminders-banner__chips">
            {dueContacts.slice(0, 6).map((c) => (
              <Badge
                key={c.id}
                appearance="tint"
                color="important"
                className="reminders-banner__chip"
                onClick={() => onSelect(c.id)}
              >
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {upcomingBirthdays && upcomingBirthdays.length > 0 && (
        <div className="reminders-banner__row">
          <Gift24Regular />
          <span>Upcoming birthdays:</span>
          <div className="reminders-banner__chips">
            {upcomingBirthdays.slice(0, 6).map((c) => (
              <Badge
                key={c.id}
                appearance="tint"
                color="brand"
                className="reminders-banner__chip"
                onClick={() => onSelect(c.id)}
              >
                {c.name} · {c.daysAway === 0 ? 'today' : `${c.daysAway}d`}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
