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
  deleteInteraction: (id, token) =>
    request(`/api/interactions/${id}`, { method: 'DELETE' }, token),

  dueReminders: (token) => request('/api/reminders/due', {}, token),
  upcomingBirthdays: (withinDays = 30, token) =>
    request(`/api/birthdays/upcoming?withinDays=${withinDays}`, {}, token),
  listReps: (token) => request('/api/reps', {}, token),
  activitySummary: (range = 'week', token) =>
    request(`/api/activity/summary?range=${range}`, {}, token),

  // Tier 3 Search History — searches message content, not just contact fields.
  searchMessages: (query, token) =>
    request(`/api/messages/search?q=${encodeURIComponent(query)}`, {}, token),

  // Projects
  listProjects: (params = {}, token) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/projects${qs ? `?${qs}` : ''}`, {}, token);
  },
  getProject: (id, token) => request(`/api/projects/${id}`, {}, token),
  createProject: (data, token) =>
    request('/api/projects', { method: 'POST', body: JSON.stringify(data) }, token),
  updateProject: (id, data, token) =>
    request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),
  deleteProject: (id, token) =>
    request(`/api/projects/${id}`, { method: 'DELETE' }, token),
  linkProjectContact: (projectId, contactId, token) =>
    request(`/api/projects/${projectId}/contacts`, { method: 'POST', body: JSON.stringify({ contactId }) }, token),
  unlinkProjectContact: (projectId, contactId, token) =>
    request(`/api/projects/${projectId}/contacts/${contactId}`, { method: 'DELETE' }, token),
};
