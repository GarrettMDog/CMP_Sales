import {
  Input, Button, Badge, Avatar, Dropdown, Option,
} from '@fluentui/react-components';
import { Search24Regular, AddCircle24Regular } from '@fluentui/react-icons';

const TEMP_COLORS = {
  Hot: 'danger',
  Warm: 'warning',
  Cold: 'informative',
  'Needs Follow-up': 'important',
};

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function daysUntil(iso) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

// Groups contacts by company (alphabetically), with contacts that have no
// company set collected into a trailing "No company set" group.
function groupByCompany(contacts) {
  const groups = new Map();
  contacts.forEach((c) => {
    const key = (c.company || '').trim() || 'No company set';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });

  const noCompanyKey = 'No company set';
  const namedCompanies = [...groups.keys()].filter((k) => k !== noCompanyKey).sort((a, b) => a.localeCompare(b));
  const orderedKeys = groups.has(noCompanyKey) ? [...namedCompanies, noCompanyKey] : namedCompanies;

  return orderedKeys.map((company) => ({ company, contacts: groups.get(company) }));
}

export default function ContactList({
  contacts, selectedId, onSelect, onAdd, search, onSearchChange,
  temperatureFilter, onTemperatureFilterChange,
  reps, repFilter, onRepFilterChange,
}) {
  const groups = groupByCompany(contacts);
  return (
    <div className="contact-list">
      <div className="contact-list__header">
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Search people or companies"
          value={search}
          onChange={(_, data) => onSearchChange(data.value)}
        />
        <Button icon={<AddCircle24Regular />} appearance="primary" onClick={onAdd}>
          Add
        </Button>
      </div>

      <Dropdown
        placeholder="All relationships"
        value={temperatureFilter || 'All relationships'}
        onOptionSelect={(_, data) => onTemperatureFilterChange(data.optionValue === 'All' ? '' : data.optionValue)}
        className="contact-list__filter"
      >
        <Option value="All">All relationships</Option>
        <Option value="Hot">Hot</Option>
        <Option value="Warm">Warm</Option>
        <Option value="Cold">Cold</Option>
        <Option value="Needs Follow-up">Needs Follow-up</Option>
      </Dropdown>

      {reps && reps.length > 0 && (
        <Dropdown
          placeholder="Anyone"
          value={repFilter || 'Anyone'}
          onOptionSelect={(_, data) => onRepFilterChange(data.optionValue === 'Anyone' ? '' : data.optionValue)}
          className="contact-list__filter"
        >
          <Option value="Anyone">Last contacted by: anyone</Option>
          {reps.map((r) => (
            <Option key={r.email || r.name} value={r.name}>Last contacted by: {r.name}</Option>
          ))}
        </Dropdown>
      )}

      <div className="contact-list__items">
        {contacts.length === 0 && (
          <div className="contact-list__empty">No contacts match yet. Add the first one.</div>
        )}
        {groups.map((group) => (
          <div key={group.company} className="company-group">
            <div className="company-group__header">
              <span>{group.company}</span>
              <span className="company-group__count">{group.contacts.length}</span>
            </div>
            {group.contacts.map((c) => {
              const overdueDays = daysUntil(c.nextReminderAt);
              const isOverdue = overdueDays !== null && overdueDays <= 0;
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`contact-row ${selectedId === c.id ? 'contact-row--active' : ''}`}
                  onClick={() => onSelect(c.id)}
                >
                  <Avatar name={c.name} initials={initials(c.name)} color="colorful" />
                  <div className="contact-row__body">
                    <div className="contact-row__top">
                      <span className="contact-row__name">{c.name}</span>
                      <Badge appearance="tint" color={TEMP_COLORS[c.temperature] || 'informative'} size="small">
                        {c.temperature}
                      </Badge>
                    </div>
                    <div className="contact-row__meta">
                      {c.role || 'No role set'}
                      {isOverdue && <span className="contact-row__overdue"> · Follow-up due</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
