// Talks to the backend REST API. Swap API_BASE for your deployed backend URL.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function request(path, options = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
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
  // Reads now require a token too, since the backend's read routes are secured.
  listContacts: (params = {}, token) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/contacts${qs ? `?${qs}` : ''}`, {}, token);
  },
  getContact: (id, token) => request(`/api/contacts/${id}`, {}, token),

  createContact: (data, token) =>
    request('/api/contacts', { method: 'POST', body: JSON.stringify(data) }, token),
  updateContact: (id, data, token) =>
    request(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),
  deleteContact: (id, token) =>
    request(`/api/contacts/${id}`, { method: 'DELETE' }, token),
  logInteraction: (id, data, token) =>
    request(`/api/contacts/${id}/interactions`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateInteraction: (id, data, token) =>
    request(`/api/interactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  dueReminders: (token) => request('/api/reminders/due', {}, token),
  upcomingBirthdays: (withinDays = 30, token) =>
    request(`/api/birthdays/upcoming?withinDays=${withinDays}`, {}, token),
  listReps: (token) => request('/api/reps', {}, token),
  activitySummary: (range = 'week', token) =>
    request(`/api/activity/summary?range=${range}`, {}, token),
};
