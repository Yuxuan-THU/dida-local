import { addDays, dateKey, parseDateKey } from './date';
import type { RepeatRule } from '../types';

export interface ParsedQuickAdd {
  title: string;
  dueAt: string | null;
  allDay: boolean;
  priority: number;
  tags: string[];
  repeatRule: RepeatRule | null;
  matched: {
    dateLabel?: string;
    timeLabel?: string;
    repeatLabel?: string;
  };
}

const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (CN_DIGITS[value[1]] || 0);
  if (value.includes('十')) {
    const [a, b] = value.split('十');
    return (CN_DIGITS[a] || 0) * 10 + (CN_DIGITS[b] || 0);
  }
  return CN_DIGITS[value] ?? NaN;
}

function withClock(date: string, hour: number, minute: number) {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function nextWeekday(base: Date, target: number, mode: 'next' | 'this' | 'plain') {
  const current = base.getDay();
  let delta = (target - current + 7) % 7;
  if (mode === 'next') delta = delta === 0 ? 7 : delta;
  if (mode === 'this') delta = (target - current + 7) % 7;
  if (mode === 'plain') {
    if (delta === 0) delta = 7;
  }
  return addDays(dateKey(base), delta);
}

export function parseQuickAdd(raw: string, base = new Date()): ParsedQuickAdd {
  const original = String(raw || '').trim();
  let text = ` ${original} `;
  let date: string | null = null;
  let hour: number | null = null;
  let minute = 0;
  let dateLabel: string | undefined;
  let timeLabel: string | undefined;
  let repeatLabel: string | undefined;
  let priority = 0;
  const tags: string[] = [];
  let repeatRule: RepeatRule | null = null;

  const remove = (matched: string) => {
    text = text.replace(matched, ' ');
  };

  // Tags: #工作
  text = text.replace(/#([^\s#!,，。]+)/g, (match, tag: string) => {
    if (tag) tags.push(tag);
    return ' ';
  });

  // Priority: !高 / !1 / !!!
  text = text.replace(/!(高|中|低|[0-3])/g, (match, value: string) => {
    if (value === '高') priority = 3;
    else if (value === '中') priority = 2;
    else if (value === '低') priority = 1;
    else priority = Number(value);
    return ' ';
  });
  if (/!!!/.test(text)) {
    priority = 3;
    text = text.replace(/!!!/g, ' ');
  } else if (/!!/.test(text)) {
    priority = 2;
    text = text.replace(/!!/g, ' ');
  }

  // Repeat text
  if (/每个?工作日|工作日每天/.test(text)) {
    repeatRule = { freq: 'weekdays', interval: 1 };
    repeatLabel = '每个工作日';
    text = text.replace(/每个?工作日|工作日每天/g, ' ');
  } else if (/每天|每日/.test(text)) {
    repeatRule = { freq: 'daily', interval: 1 };
    repeatLabel = '每天';
    text = text.replace(/每天|每日/g, ' ');
  } else if (/每周|每星期/.test(text)) {
    repeatRule = { freq: 'weekly', interval: 1, weekdays: [] };
    repeatLabel = '每周';
    text = text.replace(/每周|每星期/g, ' ');
  } else if (/每月/.test(text)) {
    repeatRule = { freq: 'monthly', interval: 1 };
    repeatLabel = '每月';
    text = text.replace(/每月/g, ' ');
  } else if (/每年/.test(text)) {
    repeatRule = { freq: 'yearly', interval: 1 };
    repeatLabel = '每年';
    text = text.replace(/每年/g, ' ');
  }

  // ISO date 2026-10-20 or 2026/10/20
  let m = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?/);
  if (m) {
    date = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    dateLabel = `${Number(m[2])}月${Number(m[3])}日`;
    remove(m[0]);
  }

  // 10月20日
  if (!date) {
    m = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (m) {
      const year = base.getFullYear();
      date = `${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      dateLabel = `${Number(m[1])}月${Number(m[2])}日`;
      remove(m[0]);
    }
  }

  // 今天 / 明天 / 后天 / 大后天
  if (!date) {
    m = text.match(/(大后天|后天|明天|今日|今天|今晚|明晚)/);
    if (m) {
      const word = m[1];
      const offset = word.includes('大后天') ? 3 : word.includes('后天') ? 2 : word.includes('明') ? 1 : 0;
      date = addDays(dateKey(base), offset);
      dateLabel = word;
      if (word === '今晚') {
        hour = 20;
        timeLabel = '20:00';
      }
      if (word === '明晚') {
        hour = 20;
        timeLabel = '20:00';
      }
      remove(m[0]);
    }
  }

  // 下周 / 本周 + weekday
  if (!date) {
    m = text.match(/(下下|下|本|这)?(?:周|星期)([一二三四五六日天])/);
    if (m) {
      const prefix = m[1] || '';
      const target = m[2] === '日' || m[2] === '天' ? 0 : CN_DIGITS[m[2]];
      if (Number.isFinite(target)) {
        let mode: 'next' | 'this' | 'plain' = 'plain';
        if (prefix.includes('下下')) {
          date = addDays(nextWeekday(base, target, 'this'), 14);
        } else if (prefix.includes('下')) {
          date = addDays(nextWeekday(base, target, 'this'), 7);
        } else if (prefix.includes('本') || prefix.includes('这')) {
          date = nextWeekday(base, target, 'this');
        } else {
          date = nextWeekday(base, target, mode);
        }
        dateLabel = m[0];
        remove(m[0]);
      }
    }
  }

  // 3 天后
  if (!date) {
    m = text.match(/(\d{1,2}|[一二两三四五六七八九十]+)\s*天(?:之)?后/);
    if (m) {
      const n = cnNumber(m[1]);
      if (Number.isFinite(n)) {
        date = addDays(dateKey(base), n);
        dateLabel = m[0];
        remove(m[0]);
      }
    }
  }

  // 下个月 5 号
  if (!date) {
    m = text.match(/下个?月(\d{1,2})[日号]/);
    if (m) {
      const d = new Date(base.getFullYear(), base.getMonth() + 1, Number(m[1]));
      date = dateKey(d);
      dateLabel = m[0];
      remove(m[0]);
    }
  }

  // 10/20
  if (!date) {
    m = text.match(/(?<![\d:])(\d{1,2})[/-](\d{1,2})(?![\d:])/);
    if (m) {
      const year = base.getFullYear();
      date = `${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      dateLabel = `${Number(m[1])}/${Number(m[2])}`;
      remove(m[0]);
    }
  }

  // English relative dates
  if (!date) {
    m = text.match(/\b(today|tomorrow|tmr)\b/i);
    if (m) {
      const word = m[1].toLowerCase();
      date = addDays(dateKey(base), word === 'today' ? 0 : 1);
      dateLabel = word;
      remove(m[0]);
    }
  }

  // Time: 15:30
  m = text.match(/(上午|下午|中午|晚上|早上|凌晨|傍晚)?\s*(\d{1,2})[:：](\d{2})/);
  if (m) {
    const period = m[1] || '';
    hour = Number(m[2]);
    minute = Number(m[3]);
    if (['下午', '晚上', '傍晚'].includes(period) && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    if (period === '凌晨' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) {
      hour = null;
      minute = 0;
    } else {
      timeLabel = m[0].trim();
      remove(m[0]);
    }
  }

  // Time: 下午三点 / 晚上8点 / 8点半
  if (hour == null) {
    m = text.match(/(上午|下午|中午|晚上|早上|凌晨|傍晚)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*点\s*(半|\d{1,2}\s*分?)?/);
    if (m) {
      const period = m[1] || '';
      let h = cnNumber(m[2]);
      const half = m[3]?.includes('半');
      const mins = m[3] && !half ? parseInt(m[3], 10) : half ? 30 : 0;
      if (Number.isFinite(h)) {
        if (['下午', '晚上', '傍晚'].includes(period) && h < 12) h += 12;
        if (period === '中午' && h < 11) h += 12;
        if (period === '凌晨' && h === 12) h = 0;
        if (h <= 23 && mins < 60) {
          hour = h;
          minute = mins;
          timeLabel = m[0].trim();
          remove(m[0]);
        }
      }
    }
  }

  // Bare period words -> reasonable defaults
  if (hour == null) {
    m = text.match(/(清晨|早上|上午|中午|下午|晚上|傍晚|夜里)/);
    if (m) {
      const defaults: Record<string, number> = { 清晨: 6, 早上: 8, 上午: 10, 中午: 12, 下午: 15, 傍晚: 18, 晚上: 20, 夜里: 22 };
      hour = defaults[m[1]] ?? 9;
      minute = 0;
      timeLabel = m[0];
      remove(m[0]);
    }
  }

  // If a time was given without a date, schedule it today.
  if (hour != null && !date) date = dateKey(base);
  // A repeat without date starts today.
  if (repeatRule && !date) {
    date = dateKey(base);
    dateLabel = '今天';
  }

  let title = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。;；:：\-—]+|[\s,，。;；:：\-—]+$/g, '')
    .trim();
  if (!title) title = original.replace(/#\S+/g, '').trim() || '新任务';

  let dueAt: string | null = null;
  let allDay = true;
  if (date && hour != null) {
    dueAt = withClock(date, hour, minute);
    allDay = false;
  } else if (date) {
    dueAt = date;
    allDay = true;
  }

  if (repeatRule?.freq === 'weekly' && (!repeatRule.weekdays || repeatRule.weekdays.length === 0)) {
    repeatRule.weekdays = [parseDateKey(date || dateKey(base)).getDay()];
  }

  return { title, dueAt, allDay, priority, tags, repeatRule, matched: { dateLabel, timeLabel, repeatLabel } };
}

export function repeatLabel(rule: RepeatRule | null): string {
  if (!rule) return '';
  const every = rule.interval && rule.interval > 1 ? `每 ${rule.interval} ` : '每';
  if (rule.freq === 'daily') return `${every}天`;
  if (rule.freq === 'weekdays') return '每个工作日';
  if (rule.freq === 'weekly') {
    if (!rule.weekdays?.length) return `${every}周`;
    return `${every}周${rule.weekdays.map((d) => '日一二三四五六'[d]).join('、')}`;
  }
  if (rule.freq === 'monthly') return `${every}月`;
  if (rule.freq === 'yearly') return `${every}年`;
  return '重复';
}