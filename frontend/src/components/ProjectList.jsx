import { Input, Button, Badge, Dropdown, Option } from '@fluentui/react-components';
import { Search24Regular, AddCircle24Regular } from '@fluentui/react-icons';

export const STATUS_COLORS = {
  Bidding: 'informative',
  Submitted: 'warning',
  Won: 'success',
  Lost: 'danger',
  Complete: 'brand',
};

export default function ProjectList({
  projects, selectedId, onSelect, onAdd, search, onSearchChange, statusFilter, onStatusFilterChange,
}) {
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
        {projects.map((p) => (
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
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
