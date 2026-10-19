import { addDays as addDaysDate, addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { Task } from '../types';

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return dateKey(new Date());
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add days to a YYYY-MM-DD key and return another key. */
export function addDays(key: string, days: number) {
  return dateKey(addDaysDate(parseDateKey(key), days));
}

export function parseDue(dueAt: string | null | undefined): Date | null {
  if (!dueAt) return null;
  if (dueAt.length <= 10) return parseDateKey(dueAt);
  return new Date(dueAt.slice(0, 16));
}

export function dueDayKey(task: Pick<Task, 'dueAt'>) {
  return task.dueAt ? task.dueAt.slice(0, 10) : null;
}

export function dueMinutes(dueAt: string | null) {
  if (!dueAt || dueAt.length <= 10) return 0;
  const [h, m] = dueAt.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(dueAt: string) {
  if (dueAt.length <= 10) return '';
  return dueAt.slice(11, 16);
}

export function humanDay(key: string | null, withWeekday = false) {
  if (!key) return '无日期';
  const today = todayKey();
  const diff = differenceInCalendarDays(parseDateKey(key), parseDateKey(today));
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  if (diff > 2 && diff < 7) return `周${WEEKDAYS[parseDateKey(key).getDay()]}`;
  if (diff < -1 && diff > -7) return `周${WEEKDAYS[parseDateKey(key).getDay()]}`;
  const date = parseDateKey(key);
  if (date.getFullYear() === new Date().getFullYear()) {
    return format(date, withWeekday ? 'M月d日 EEE' : 'M月d日', { locale: zhCN });
  }
  return format(date, 'yyyy年M月d日', { locale: zhCN });
}

export function formatDue(task: Pick<Task, 'dueAt' | 'allDay'>, withWeekday = false) {
  if (!task.dueAt) return '';
  const label = humanDay(task.dueAt.slice(0, 10), withWeekday);
  if (task.allDay || task.dueAt.length <= 10) return label;
  return `${label} ${formatTime(task.dueAt)}`;
}

export function isOverdue(task: Pick<Task, 'status' | 'dueAt'>) {
  if (task.status !== 'open' || !task.dueAt) return false;
  return task.dueAt.slice(0, 10) < todayKey();
}

export function isTodayTask(task: Pick<Task, 'dueAt'>) {
  return Boolean(task.dueAt && task.dueAt.slice(0, 10) === todayKey());
}

export function isUpcoming(task: Pick<Task, 'dueAt'>, days = 7, includeOverdue = true) {
  if (!task.dueAt) return false;
  const key = task.dueAt.slice(0, 10);
  const today = todayKey();
  if (includeOverdue && key < today) return true;
  return key >= today && key <= dateKey(addDaysDate(parseDateKey(today), days));
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function startOfWeekDate(date: Date, weekStart = 1) {
  return startOfWeek(date, { weekStartsOn: (weekStart === 0 ? 0 : 1) as 0 | 1 });
}

export function weekDates(date = new Date(), weekStart = 1) {
  const start = startOfWeekDate(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysDate(start, i));
}

export function monthGrid(monthDate: Date, weekStart = 1) {
  const start = startOfWeekDate(startOfMonth(monthDate), weekStart);
  const end = startOfWeekDate(endOfMonth(monthDate), weekStart);
  const lastDay = addDaysDate(end, 6);
  return eachDayOfInterval({ start, end: lastDay });
}

export function monthLabel(date: Date) {
  return format(date, 'yyyy年M月', { locale: zhCN });
}

export function fullDateLabel(date = new Date()) {
  return format(date, 'M月d日 EEEE', { locale: zhCN });
}

export function shortWeekday(date: Date) {
  return `周${WEEKDAYS[date.getDay()]}`;
}

export function dayDiff(key: string, base = todayKey()) {
  return differenceInCalendarDays(parseDateKey(key), parseDateKey(base));
}

export function relativeTime(iso: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return format(new Date(iso), 'M月d日');
}

export function toLocalInput(dueAt: string | null) {
  if (!dueAt) return { date: '', time: '' };
  return { date: dueAt.slice(0, 10), time: dueAt.length > 10 ? dueAt.slice(11, 16) : '' };
}

export function combineDateTime(date: string, time: string) {
  if (!date) return null;
  return time ? `${date}T${time}` : date;
}

export function weekRangeLabel(date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addDaysDate(start, 6);
  return `${format(start, 'M月d日')} – ${format(end, 'M月d日')}`;
}

export function monthShort(date: Date) {
  return format(date, 'M月', { locale: zhCN });
}

export function addMonthsLocal(date: Date, n: number) {
  return addMonths(date, n);
}

export { addDaysDate, format, isSameDay, isSameMonth, startOfMonth, endOfMonth, differenceInCalendarDays };