const pad = (n) => String(n).padStart(2, '0');

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(date = new Date()) {
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTime(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function addMonths(dateStr, months) {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return localDate(d);
}

export function dayOfWeek(dateStr) {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00`).getDay();
}

function withTime(datePart, original) {
  const time = String(original).match(/[T ](\d{2}:\d{2})/)?.[1];
  return time ? `${datePart}T${time}` : datePart;
}

/**
 * Returns the next due value for a repeating task. Keeps the original time of
 * day, and advances at least one interval from the current due date.
 */
export function nextOccurrence(dueAt, allDay, rule) {
  const base = dueAt ? String(dueAt).slice(0, 10) : localDate();
  if (!rule || !rule.freq) return allDay ? base : withTime(base, dueAt || `${base}T09:00`);
  const interval = Math.max(1, Number(rule.interval) || 1);
  let next = base;

  switch (rule.freq) {
    case 'weekdays': {
      do {
        next = addDays(next, 1);
      } while ([0, 6].includes(dayOfWeek(next)));
      break;
    }
    case 'weekly': {
      const days = (rule.weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6);
      if (!days.length) {
        next = addDays(next, 7 * interval);
      } else {
        let cursor = next;
        for (let i = 1; i <= 370; i += 1) {
          cursor = addDays(cursor, 1);
          if (days.includes(dayOfWeek(cursor))) {
            next = cursor;
            break;
          }
        }
      }
      break;
    }
    case 'monthly':
      next = addMonths(base, interval);
      break;
    case 'yearly':
      next = addMonths(base, 12 * interval);
      break;
    case 'daily':
    default:
      next = addDays(base, interval);
      break;
  }
  return allDay ? next : withTime(next, dueAt || `${base}T09:00`);
}

export function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}