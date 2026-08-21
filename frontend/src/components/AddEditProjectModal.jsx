import { useEffect, useState } from 'react';
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Button, Input, Field, Dropdown, Option, Textarea,
} from '@fluentui/react-components';

const STATUSES = ['Bidding', 'Submitted', 'Won', 'Lost', 'Complete'];

const BLANK = {
  name: '', customer: '', status: 'Bidding', value: '', bidDueDate: '', notes: '',
};

export default function AddEditProjectModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || '',
        customer: initial.customer || '',
        status: initial.status || 'Bidding',
        value: initial.value != null ? String(initial.value) : '',
        // bidDueDate is stored ISO; the date input wants YYYY-MM-DD.
        bidDueDate: initial.bidDueDate ? initial.bidDueDate.slice(0, 10) : '',
        notes: initial.notes || '',
      });
    } else {
      setForm(BLANK);
    }
  }, [initial, open]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      customer: form.customer,
      status: form.status,
      value: form.value === '' ? null : Number(form.value),
      bidDueDate: form.bidDueDate || null,
      notes: form.notes,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className="wide-dialog">
        <DialogBody>
          <DialogTitle>{initial ? 'Edit project' : 'Add a project'}</DialogTitle>
          <DialogContent className="modal-grid">
            <Field label="Project name" required>
              <Input value={form.name} onChange={(_, d) => update('name', d.value)} />
            </Field>
            <Field label="Customer (GC / developer)">
              <Input value={form.customer} onChange={(_, d) => update('customer', d.value)} />
            </Field>
            <Field label="Status">
              <Dropdown
                value={form.status}
                onOptionSelect={(_, d) => update('status', d.optionValue)}
              >
                {STATUSES.map((s) => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Value ($)">
              <Input
                type="number"
                min={0}
                value={form.value}
                onChange={(_, d) => update('value', d.value)}
              />
            </Field>
            <Field label="Bid due date">
              <Input
                type="date"
                value={form.bidDueDate}
                onChange={(_, d) => update('bidDueDate', d.value)}
              />
            </Field>
            <Field label="Description">
              <Textarea value={form.notes} onChange={(_, d) => update('notes', d.value)} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave}>
              {initial ? 'Save changes' : 'Add project'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
