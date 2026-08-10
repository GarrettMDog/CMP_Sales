import { Input, Button, Badge, Dropdown, Option } from '@fluentui/react-components';
import { Search24Regular, AddCircle24Regular } from '@fluentui/react-icons';

export const STATUS_COLORS = {
  Bidding: 'informative',
  Submitted: 'warning',
  Won: 'success',
  Lost: 'danger',
  Complete: 'brand',
};

// Groups projects by customer (alphabetically), with projects that have no
// customer set collected into a trailing "No customer set" group. Mirrors the
// company grouping in ContactList.
function groupByCustomer(projects) {
  const groups = new Map();
  projects.forEach((p) => {
    const key = (p.customer || '').trim() || 'No customer set';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const noneKey = 'No customer set';
  const named = [...groups.keys()].filter((k) => k !== noneKey).sort((a, b) => a.localeCompare(b));
  const ordered = groups.has(noneKey) ? [...named, noneKey] : named;
  return ordered.map((customer) => ({ customer, projects: groups.get(customer) }));
}

export default function ProjectList({
  projects, selectedId, onSelect, onAdd, search, onSearchChange, statusFilter, onStatusFilterChange,
}) {
  const groups = groupByCustomer(projects);
  return (
    <div className="contact-list">
      <div className="contact-list__header">
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Search projects or customers"
          value={search}
          onChange={(_, data) => onSearchChange(data.value)}
        />
        <Button icon={<AddCircle24Regular />} appearance="primary" onClick={onAdd}>
          Add
        </Button>
      </div>

      <Dropdown
        placeholder="All statuses"
        value={statusFilter || 'All statuses'}
        onOptionSelect={(_, data) => onStatusFilterChange(data.optionValue === 'All' ? '' : data.optionValue)}
        className="contact-list__filter"
      >
        <Option value="All">All statuses</Option>
        {Object.keys(STATUS_COLORS).map((s) => (
          <Option key={s} value={s}>{s}</Option>
        ))}
      </Dropdown>

      <div className="contact-list__items">
        {projects.length === 0 && (
          <div className="contact-list__empty">No projects match yet. Add the first one.</div>
        )}
        {groups.map((group) => (
          <div key={group.customer} className="company-group">
            <div className="company-group__header">
              <span>{group.customer}</span>
              <span className="company-group__count">{group.projects.length}</span>
            </div>
            {group.projects.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`contact-row ${selectedId === p.id ? 'contact-row--active' : ''}`}
                onClick={() => onSelect(p.id)}
              >
                <div className="contact-row__body">
                  <div className="contact-row__top">
                    <span className="contact-row__name">{p.name}</span>
                    <Badge appearance="tint" color={STATUS_COLORS[p.status] || 'informative'} size="small">
                      {p.status}
                    </Badge>
                  </div>
                  <div className="contact-row__meta">
                    {p.contactCount || 0} {p.contactCount === 1 ? 'contact' : 'contacts'}
                    {p.value != null && <span> · ${Number(p.value).toLocaleString()}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
