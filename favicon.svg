// Talks to the backend REST API. Swap API_BASE for your deployed backend URL.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listContacts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/contacts${qs ? `?${qs}` : ''}`);
  },
  getContact: (id) => request(`/api/contacts/${id}`),
  createContact: (data) => request('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id, data) => request(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  logInteraction: (id, data) => request(`/api/contacts/${id}/interactions`, { method: 'POST', body: JSON.stringify(data) }),
  dueReminders: () => request('/api/reminders/due'),
  upcomingBirthdays: (withinDays = 30) => request(`/api/birthdays/upcoming?withinDays=${withinDays}`),
  listReps: () => request('/api/reps'),
  activitySummary: (range = 'week') => request(`/api/activity/summary?range=${range}`),
};
