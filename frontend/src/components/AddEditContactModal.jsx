import { useEffect, useState } from 'react';
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Button, Input, Field, Dropdown, Option, Textarea,
} from '@fluentui/react-components';

const BLANK = {
  name: '', company: '', role: '', email: '', phone: '',
  birthdayMonth: '', birthdayDay: '', howYouKnowThem: '', referralSource: '',
  temperature: 'Warm', recurrenceDays: 90,
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AddEditContactModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (initial) {
      const [mm, dd] = (initial.birthday || '').split('-');
      setForm({
        name: initial.name || '',
        company: initial.company || '',
        role: initial.role || '',
        email: initial.email || '',
        phone: initial.phone || '',
        birthdayMonth: mm ? String(Number(mm)) : '',
        birthdayDay: dd ? String(Number(dd)) : '',
        howYouKnowThem: initial.howYouKnowThem || '',
        referralSource: initial.referralSource || '',
        temperature: initial.temperature || 'Warm',
        recurrenceDays: initial.recurrenceDays || 90,
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
    const birthday = form.birthdayMonth && form.birthdayDay
      ? `${String(form.birthdayMonth).padStart(2, '0')}-${String(form.birthdayDay).padStart(2, '0')}`
      : null;

    onSave({
      name: form.name.trim(),
      company: form.company,
      role: form.role,
      email: form.email,
      phone: form.phone,
      birthday,
      howYouKnowThem: form.howYouKnowThem,
      referralSource: form.referralSource,
      temperature: form.temperature,
      recurrenceDays: Number(form.recurrenceDays) || 90,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className="wide-dialog">
        <DialogBody>
          <DialogTitle>{initial ? 'Edit contact' : 'Add a contact'}</DialogTitle>
          <DialogContent className="modal-grid">
            <Field label="Name" required>
              <Input value={form.name} onChange={(_, d) => update('name', d.value)} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(_, d) => update('company', d.value)} />
            </Field>
            <Field label="Role / title">
              <Input value={form.role} onChange={(_, d) => update('role', d.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(_, d) => update('email', d.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(_, d) => update('phone', d.value)} />
            </Field>

            <Field label="Birthday">
              <div className="birthday-row">
                <Dropdown
                  placeholder="Month"
                  value={form.birthdayMonth ? MONTHS[Number(form.birthdayMonth) - 1] : ''}
                  onOptionSelect={(_, d) => update('birthdayMonth', d.optionValue)}
                >
                  {MONTHS.map((m, i) => (
                    <Option key={m} value={String(i + 1)}>{m}</Option>
                  ))}
                </Dropdown>
                <Input
                  placeholder="Day"
                  type="number"
                  min={1}
                  max={31}
                  value={form.birthdayDay}
                  onChange={(_, d) => update('birthdayDay', d.value)}
                  style={{ width: 80 }}
                />
              </div>
            </Field>

            <Field label="How you know them">
              <Textarea value={form.howYouKnowThem} onChange={(_, d) => update('howYouKnowThem', d.value)} />
            </Field>
            <Field label="Referral source">
              <Input value={form.referralSource} onChange={(_, d) => update('referralSource', d.value)} />
            </Field>

            <Field label="Relationship temperature">
              <Dropdown
                value={form.temperature}
                onOptionSelect={(_, d) => update('temperature', d.optionValue)}
              >
                {['Hot', 'Warm', 'Cold', 'Needs Follow-up'].map((t) => (
                  <Option key={t} value={t}>{t}</Option>
                ))}
              </Dropdown>
            </Field>

            <Field label="Remind me to reconnect every">
              <Dropdown
                value={`${form.recurrenceDays} days`}
                onOptionSelect={(_, d) => update('recurrenceDays', d.optionValue)}
              >
                {[30, 60, 90, 180, 365].map((n) => (
                  <Option key={n} value={String(n)}>{n} days</Option>
                ))}
              </Dropdown>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave}>
              {initial ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
