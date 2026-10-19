import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { exportData, getState, replaceAll } from './store.mjs';
import { DATA_DIR } from './db.mjs';
import { LIST_COLORS, TAG_COLORS } from './defaults.mjs';
import { localDate } from './time.mjs';

export function defaultTickTickPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Tick_Tick', 'TickTick.db');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRrule(raw) {
  if (!raw) return null;
  const text = String(raw).replace(/^RRULE:/i, '');
  const parts = Object.fromEntries(
    text
      .split(';')
      .map((part) => part.split('='))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key.toUpperCase(), value]),
  );
  const freq = String(parts.FREQ || '').toUpperCase();
  const rule = { interval: Math.max(1, Number(parts.INTERVAL) || 1) };
  if (freq === 'DAILY') rule.freq = 'daily';
  else if (freq === 'WEEKDAYS' || /BYDAY=.*(MO|TU|WE|TH|FR)/.test(text) && !/SA|SU/.test(text) && !parts.BYMONTHDAY) rule.freq = 'weekdays';
  else if (freq === 'WEEKLY') {
    rule.freq = 'weekly';
    const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    rule.weekdays = String(parts.BYDAY || '')
      .split(',')
      .map((d) => dayMap[d.trim().slice(-2).toUpperCase()])
      .filter((n) => n !== undefined);
    if (!rule.weekdays.length) rule.weekdays = [];
  } else if (freq === 'MONTHLY') rule.freq = 'monthly';
  else if (freq === 'YEARLY') rule.freq = 'yearly';
  else return null;
  return rule;
}

function emojiFromText(name = '') {
  const match = String(name).match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u);
  return match ? { emoji: match[1], name: String(name).slice(match[0].length).trim() || String(name).trim() } : null;
}

function normalizeDue(value, allDay) {
  if (!value) return null;
  const text = String(value).replace(' ', 'T');
  if (allDay) return text.slice(0, 10);
  return text.slice(0, 16);
}

function mapPriority(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 3) return 2;
  return 3;
}

function habitEmoji(icon = '') {
  const map = {
    habit_early_to_rise: '🌅',
    habit_exercising: '🏃',
    habit_reading: '📖',
    habit_meditation: '🧘',
    habit_drinking_water: '💧',
    habit_study: '📚',
    habit_sleep_early: '🌙',
    habit_writing: '✍️',
    habit_music: '🎵',
    habit_diet: '🥗',
  };
  return map[icon] || '✅';
}

function habitFrequency(raw) {
  const rule = parseRrule(raw);
  if (rule?.freq === 'weekly') return { type: 'weekly', days: rule.weekdays?.length ? rule.weekdays : [1, 2, 3, 4, 5] };
  return { type: 'daily' };
}

function reminderOffset(raw) {
  const match = String(raw || '').match(/^TRIGGER:([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const sign = match[1] === '+' ? 1 : -1;
  const days = Number(match[2]) || 0;
  const hours = Number(match[3]) || 0;
  const minutes = Number(match[4]) || 0;
  const seconds = Number(match[5]) || 0;
  return Math.min(10080, Math.max(0, Math.round(-sign * (days * 1440 + hours * 60 + minutes + seconds / 60))));
}

export function inspectTickTick(filePath = defaultTickTickPath(), options = {}) {
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error(`没有找到滴答清单数据库：${filePath}`), { status: 404 });
  }
  const source = new DatabaseSync(filePath, { readOnly: true });
  try {
    source.exec('PRAGMA busy_timeout = 3000;');
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    if (!tables.has('TaskModel') || !tables.has('ProjectModel')) {
      throw Object.assign(new Error('这个文件不是滴答清单数据库'), { status: 400 });
    }
    const tasks = source.prepare("SELECT COUNT(*) AS c FROM TaskModel WHERE deleted = 0 AND status IN (0, 2, -1)").get().c;
    const completed = source.prepare("SELECT COUNT(*) AS c FROM TaskModel WHERE deleted = 0 AND status = 2").get().c;
    const lists = source.prepare('SELECT COUNT(*) AS c FROM ProjectModel WHERE delete_status = 0').get().c;
    const habits = tables.has('HabitModel') ? source.prepare('SELECT COUNT(*) AS c FROM HabitModel').get().c : 0;
    const checkins = tables.has('HabitCheckInModel') ? source.prepare('SELECT COUNT(*) AS c FROM HabitCheckInModel').get().c : 0;
    let futureTasks = tasks;
    let futureCompleted = completed;
    if (options.fromDate) {
      futureTasks = source.prepare("SELECT COUNT(*) AS c FROM TaskModel WHERE deleted = 0 AND status IN (0, 2, -1) AND parentId IS NULL AND startDate IS NOT NULL AND date(startDate) >= date(?)").get(options.fromDate).c;
      futureCompleted = source.prepare("SELECT COUNT(*) AS c FROM TaskModel WHERE deleted = 0 AND status = 2 AND parentId IS NULL AND startDate IS NOT NULL AND date(startDate) >= date(?)").get(options.fromDate).c;
    }
    return { path: filePath, tasks, completed, lists, habits, checkins, futureTasks, futureCompleted, size: fs.statSync(filePath).size };
  } finally {
    source.close();
  }
}

export function importTickTick(filePath = defaultTickTickPath(), options = {}) {
  const fromDate = options.fromDate ? String(options.fromDate).slice(0, 10) : null;
  const stats = inspectTickTick(filePath, { fromDate });
  const source = new DatabaseSync(filePath, { readOnly: true });
  try {
    source.exec('PRAGMA busy_timeout = 3000;');
    const projectRows = source
      .prepare('SELECT id, name, Isinbox, color, viewMode FROM ProjectModel WHERE delete_status = 0 ORDER BY CAST(sortOrder AS REAL)')
      .all();
    const taskRows = source
      .prepare(`
        SELECT id, projectId, title, content, tag, priority, status, dueDate, startDate,
               createdTime, completedTime, repeatFlag, parentId, isAllDay, desc, modifiedTime
        FROM TaskModel
        WHERE deleted = 0 AND status IN (0, 2, -1)
        ORDER BY CAST(sortOrder AS REAL), createdTime
      `)
      .all();
    const remindersByTask = new Map();
    try {
      const reminderRows = source.prepare('SELECT taskserverid, trigger FROM TaskReminderModel').all();
      for (const row of reminderRows) {
        const offset = reminderOffset(row.trigger);
        if (offset == null || !row.taskserverid) continue;
        if (!remindersByTask.has(row.taskserverid)) remindersByTask.set(row.taskserverid, []);
        const list = remindersByTask.get(row.taskserverid);
        if (!list.includes(offset)) list.push(offset);
      }
    } catch {
      // Reminders are optional in older databases.
    }
    const tagRows = source.prepare('SELECT name, color FROM TagModel WHERE deleted = 0 OR deleted IS NULL').all();
    const habitRows = source.prepare('SELECT Id, Name, IconRes, Color, Goal, Step, Unit, RepeatRule, Encouragement, CreatedTime, Status FROM HabitModel ORDER BY CAST(SortOrder AS REAL)').all();
    const checkinRows = source.prepare('SELECT HabitId, CheckinStamp, CheckinTime, Value, Status FROM HabitCheckInModel ORDER BY CheckinTime').all();

    const listRows = projectRows.length
      ? projectRows
      : [{ id: 'inbox-imported', name: '收集箱', Isinbox: 1, color: '', sortOrder: 0 }];
    const idToList = new Map();
    const lists = listRows.map((project, index) => {
      const parsed = emojiFromText(project.name || '清单');
      const isInbox = Boolean(project.Isinbox);
      const id = isInbox ? 'inbox' : `tt-list-${project.id}`;
      idToList.set(project.id, id);
      return {
        id,
        name: isInbox ? '收集箱' : parsed?.name || project.name || '清单',
        emoji: isInbox ? '📥' : parsed?.emoji || '📋',
        color: project.color || LIST_COLORS[index % LIST_COLORS.length],
        sortOrder: index * 1000,
        isInbox,
        viewMode: project.viewMode === 'kanban' ? 'board' : 'list',
        archived: false,
        createdAt: new Date().toISOString(),
      };
    });
    let inbox = lists.find((l) => l.isInbox) || lists[0];
    if (!inbox) {
      inbox = {
        id: 'inbox',
        name: '收集箱',
        emoji: '📥',
        color: '#64748b',
        sortOrder: 0,
        isInbox: true,
        viewMode: 'list',
        archived: false,
        createdAt: new Date().toISOString(),
      };
      lists.unshift(inbox);
    }
    if (inbox.id !== 'inbox') {
      const oldId = inbox.id;
      inbox.id = 'inbox';
      for (const list of lists) if (list.id === oldId) list.id = 'inbox';
      for (const [projectId, listId] of idToList) if (listId === oldId) idToList.set(projectId, 'inbox');
    }

    const tagNames = new Set();
    for (const row of tagRows) if (row.name) tagNames.add(row.name);

    const childrenByParent = new Map();
    const topLevel = [];
    for (const row of taskRows) {
      if (row.parentId) {
        if (!childrenByParent.has(row.parentId)) childrenByParent.set(row.parentId, []);
        childrenByParent.get(row.parentId).push(row);
      } else {
        topLevel.push(row);
      }
    }

    const selectedTopLevel = topLevel
      .filter((row) => {
        if (!fromDate) return true;
        const due = row.startDate || row.dueDate;
        return Boolean(due && String(due).slice(0, 10) >= fromDate);
      })
      .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
    for (const row of selectedTopLevel) {
      const tags = parseJson(row.tag, []);
      if (Array.isArray(tags)) for (const tag of tags) if (typeof tag === 'string' && tag.trim()) tagNames.add(tag.trim());
    }
    const tags = [...tagNames].map((name, index) => ({
      id: `tt-tag-${index}-${Buffer.from(name).toString('hex').slice(0, 10)}`,
      name,
      color: tagRows.find((t) => t.name === name)?.color || TAG_COLORS[index % TAG_COLORS.length],
      createdAt: new Date().toISOString(),
    }));

    const tasks = selectedTopLevel.map((row, index) => {
      const allDay = Boolean(row.isAllDay);
      const due = normalizeDue(row.startDate || row.dueDate, allDay);
      const tagsForTask = parseJson(row.tag, []);
      const children = childrenByParent.get(row.id) || [];
      const notes = [row.content, row.desc].filter((v) => typeof v === 'string' && v.trim() && v !== row.title).join('\n\n');
      return {
        id: `tt-task-${row.id}`,
        listId: idToList.get(row.projectId) || inbox.id,
        title: String(row.title || '未命名任务').trim(),
        notes,
        status: row.status === 2 ? 'completed' : row.status === -1 ? 'abandoned' : 'open',
        priority: mapPriority(row.priority),
        dueAt: due,
        allDay,
        completedAt: row.completedTime ? String(row.completedTime).replace(' ', 'T') : null,
        createdAt: row.createdTime ? String(row.createdTime).replace(' ', 'T') : new Date().toISOString(),
        updatedAt: row.modifiedTime ? String(row.modifiedTime).replace(' ', 'T') : new Date().toISOString(),
        sortOrder: index * 1000,
        tags: Array.isArray(tagsForTask) ? tagsForTask.filter((t) => typeof t === 'string') : [],
        subtasks: children.map((child) => ({
          id: `tt-sub-${child.id}`,
          title: child.title || '子任务',
          done: child.status === 2,
        })),
        repeatRule: parseRrule(row.repeatFlag),
        reminders: remindersByTask.get(row.id) || [],
        estimate: 0,
        focusedSeconds: 0,
        stage: row.status === 2 ? 'done' : 'todo',
        pinned: false,
        deletedAt: null,
      };
    });

    const habits = options.includeHabits === false
      ? []
      : habitRows
      .filter((h) => !h.archived)
      .map((row, index) => ({
        id: `tt-habit-${row.Id}`,
        name: row.Name || '习惯',
        emoji: habitEmoji(row.IconRes),
        color: row.Color || LIST_COLORS[index % LIST_COLORS.length],
        goal: Number(row.Goal) || 1,
        step: Number(row.Step) || 1,
        unit: row.Unit || '次',
        frequency: habitFrequency(row.RepeatRule),
        notes: row.Encouragement || '',
        sortOrder: index * 1000,
        archived: false,
        createdAt: row.CreatedTime ? String(row.CreatedTime).replace(' ', 'T') : new Date().toISOString(),
      }));

    const habitIds = new Set(habits.map((h) => h.id));
    const habitLogs = checkinRows
      .filter((row) => habitIds.has(`tt-habit-${row.HabitId}`) && Number(row.Status) !== 0 && row.CheckinStamp)
      .map((row) => {
        const stamp = String(row.CheckinStamp);
        const date = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
        return {
          habitId: `tt-habit-${row.HabitId}`,
          date,
          value: Number(row.Value) || 1,
          note: '',
          updatedAt: new Date().toISOString(),
        };
      })
      .filter((row) => !fromDate || row.date >= fromDate);

    let focusSessions = [];
    try {
      const pomos = source.prepare("SELECT Id, StartTime, EndTime FROM PomodoroModel WHERE Status = 2 AND Type = 0").all();
      focusSessions = pomos
        .filter((p) => p.StartTime && p.EndTime)
        .map((p, index) => ({
          id: `tt-focus-${p.Id || index}`,
          taskId: null,
          mode: 'focus',
          duration: Math.max(1, Math.round((new Date(p.EndTime) - new Date(p.StartTime)) / 60000)),
          startedAt: String(p.StartTime).replace(' ', 'T'),
          endedAt: String(p.EndTime).replace(' ', 'T'),
          completed: true,
        }))
        .filter((session) => !fromDate || session.startedAt.slice(0, 10) >= fromDate);
    } catch {
      focusSessions = [];
    }

    const current = getState();
    let userName = current.settings.userName;
    try {
      const user = source.prepare('SELECT name, givenName FROM UserInfoModel LIMIT 1').get();
      userName = user?.name || user?.givenName || userName;
    } catch {
      // Optional table.
    }

    const data = {
      lists,
      tags,
      tasks,
      habits,
      habitLogs,
      focusSessions,
      filters: options.keepFilters ? current.filters : [],
      settings: { ...current.settings, userName },
    };
    const resultStats = {
      lists: lists.length,
      tasks: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      tags: tags.length,
      habits: habits.length,
      checkins: habitLogs.length,
      focusSessions: focusSessions.length,
    };
    if (options.dryRun) {
      return { ok: true, dryRun: true, data, stats: resultStats, source: filePath };
    }

    fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
    const backupPath = path.join(DATA_DIR, 'backups', `before-ticktick-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(exportData(), null, 2), 'utf8');

    replaceAll(data);
    return {
      ok: true,
      stats: resultStats,
      backupPath,
      source: filePath,
    };
  } finally {
    source.close();
  }
}