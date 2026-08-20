// Shared date formatting for the whole app. Any date that falls on today is
// shown as "Today" (with the time, for datetime formatting) instead of the
// numeric date, so timelines and due-dates read more naturally.

function isToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function numericDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

// Date + time, e.g. "Today 03:45 PM" or "08/14/26 03:45 PM".
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const time = `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
  return `${isToday(d) ? 'Today' : numericDate(d)} ${time}`;
}

// Date only, e.g. "Today" or "08/14/26".
export function formatDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return isToday(d) ? 'Today' : numericDate(d);
}

// Friendly date + time, e.g. "Today · 3:45 PM" or "Aug 14 · 3:45 PM".
// Used by the activity feed, which prefers a month-name style over numeric.
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = isToday(d)
    ? 'Today'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}
