import crypto from 'node:crypto';
import { getDb, resetDatabase, getRevision } from './db.mjs';
import { DEFAULT_SETTINGS, LIST_COLORS, TAG_COLORS } from './defaults.mjs';
import { nextOccurrence } from './time.mjs';

const nowIso = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
const parseJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function deepMerge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra ?? base;
  if (typeof base !== 'object' || base === null) return extra ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mapTask(row) {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    notes: row.notes || '',
    status: row.status,
    priority: Number(row.priority) || 0,
    dueAt: row.due_at || null,
    allDay: Boolean(row.all_day),
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: Number(row.sort_order) || 0,
    tags: parseJson(row.tags, []),
    subtasks: parseJson(row.subtasks, []),
    repeatRule: parseJson(row.repeat_rule, null),
    reminders: parseJson(row.reminders, []),
    estimate: Number(row.estimate) || 0,
    focusedSeconds: Number(row.focused_seconds) || 0,
    stage: row.stage || 'todo',
    pinned: Boolean(row.pinned),
    deletedAt: row.deleted_at || null,
  };
}

const mapList = (row) => ({
  id: row.id,
  name: row.name,
  emoji: row.emoji,
  color: row.color,
  sortOrder: Number(row.sort_order) || 0,
  isInbox: Boolean(row.is_inbox),
  viewMode: row.view_mode || 'list',
  archived: Boolean(row.archived),
  createdAt: row.created_at,
  deletedAt: row.deleted_at || null,
});

const mapTag = (row) => ({ id: row.id, name: row.name, color: row.color, createdAt: row.created_at });

const mapHabit = (row) => ({
  id: row.id,
  name: row.name,
  emoji: row.emoji,
  color: row.color,
  goal: Number(row.goal) || 1,
  step: Number(row.step) || 1,
  unit: row.unit || '次',
  frequency: parseJson(row.frequency, { type: 'daily' }),
  notes: row.notes || '',
  sortOrder: Number(row.sort_order) || 0,
  archived: Boolean(row.archived),
  createdAt: row.created_at,
  deletedAt: row.deleted_at || null,
});

const mapFocus = (row) => ({
  id: row.id,
  taskId: row.task_id,
  mode: row.mode,
  duration: Number(row.duration) || 0,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  completed: Boolean(row.completed),
});

const mapFilter = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon || 'Filter',
  color: row.color || '#4f76f6',
  query: parseJson(row.query, {}),
  sortOrder: Number(row.sort_order) || 0,
  createdAt: row.created_at,
});

function readSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = {};
  for (const row of rows) stored[row.key] = parseJson(row.value, row.value);
  return deepMerge(DEFAULT_SETTINGS, stored);
}

export function getState() {
  const db = getDb();
  const tags = db.prepare('SELECT * FROM tags ORDER BY created_at').all().map(mapTag);
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY sort_order, created_at').all().map((row) => {
    const task = mapTask(row);
    delete task.listId;
    return task;
  });
  const habits = db.prepare('SELECT * FROM habits WHERE archived = 0 AND deleted_at IS NULL ORDER BY sort_order, created_at').all().map(mapHabit);
  const habitLogs = db.prepare('SELECT * FROM habit_logs ORDER BY date').all().map((r) => ({
    habitId: r.habit_id,
    date: r.date,
    value: Number(r.value) || 0,
    note: r.note || '',
    updatedAt: r.updated_at,
  }));
  const focusSessions = db.prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC').all().map(mapFocus);
  const filters = db.prepare('SELECT * FROM filters ORDER BY sort_order, created_at').all().map(mapFilter);
  return {
    lists: [],
    tags,
    tasks,
    habits,
    habitLogs,
    focusSessions,
    filters,
    settings: readSettings(),
    meta: { now: nowIso(), version: 1, revision: getRevision() },
  };
}

export function getTask(id) {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return row ? mapTask(row) : null;
}

function nextTaskSort(listId) {
  const row = getDb().prepare('SELECT MAX(sort_order) AS m FROM tasks WHERE list_id = ?').get(listId);
  return (Number(row?.m) || 0) + 1000;
}

function normalizeDue(dueAt, allDay) {
  if (!dueAt) return { dueAt: null, allDay: true };
  const value = String(dueAt);
  if (!value.includes('T')) return { dueAt: value.slice(0, 10), allDay: true };
  return { dueAt: value.slice(0, 16), allDay: Boolean(allDay) };
}

export function createTask(input = {}) {
  const db = getDb();
  const id = input.id || uid('task');
  const listId = input.listId || 'inbox';
  const title = String(input.title || '').trim() || '未命名任务';
  const due = normalizeDue(input.dueAt, input.allDay);
  const now = nowIso();
  const sortOrder = Number.isFinite(input.sortOrder) ? input.sortOrder : nextTaskSort(listId);
  db.prepare(`
    INSERT INTO tasks(id,list_id,title,notes,status,priority,due_at,all_day,completed_at,created_at,updated_at,sort_order,tags,subtasks,repeat_rule,reminders,estimate,stage,pinned)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    listId,
    title,
    String(input.notes || ''),
    input.status || 'open',
    Number(input.priority) || 0,
    due.dueAt,
    due.allDay ? 1 : 0,
    input.completedAt || null,
    input.createdAt || now,
    now,
    sortOrder,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.subtasks || []),
    input.repeatRule ? JSON.stringify(input.repeatRule) : null,
    JSON.stringify(input.reminders || []),
    Number(input.estimate) || 0,
    input.stage || 'todo',
    input.pinned ? 1 : 0,
  );
  return getTask(id);
}

const FIELD_MAP = {
  title: 'title',
  notes: 'notes',
  priority: 'priority',
  dueAt: 'due_at',
  allDay: 'all_day',
  tags: 'tags',
  subtasks: 'subtasks',
  repeatRule: 'repeat_rule',
  reminders: 'reminders',
  estimate: 'estimate',
  stage: 'stage',
  pinned: 'pinned',
  listId: 'list_id',
  status: 'status',
  focusedSeconds: 'focused_seconds',
  sortOrder: 'sort_order',
};

export function updateTask(id, patch = {}) {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) throw Object.assign(new Error('任务不存在'), { status: 404 });
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (!(key in patch)) continue;
    let value = patch[key];
    if (key === 'priority') value = Math.max(0, Math.min(3, Number(value) || 0));
    if (key === 'dueAt') {
      const due = normalizeDue(value, patch.allDay ?? existing.allDay);
      value = due.dueAt;
    }
    if (key === 'allDay') value = value ? 1 : 0;
    if (key === 'tags' || key === 'subtasks' || key === 'reminders') value = JSON.stringify(value || []);
    if (key === 'repeatRule') value = value ? JSON.stringify(value) : null;
    if (key === 'pinned') value = value ? 1 : 0;
    if (key === 'title') value = String(value || '').trim() || '未命名任务';
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if ('status' in patch) {
    sets.push('completed_at = ?');
    values.push(patch.status === 'completed' ? existing.completedAt || nowIso() : null);
    if (patch.status === 'completed') {
      sets.push('stage = ?');
      values.push('done');
    } else if (existing.stage === 'done') {
      sets.push('stage = ?');
      values.push('todo');
    }
  }
  if (!sets.length) return existing;
  sets.push('updated_at = ?');
  values.push(nowIso(), id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTask(id);
}

export function setTaskCompleted(id, completed = true) {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) throw Object.assign(new Error('任务不存在'), { status: 404 });
  const now = nowIso();
  db.prepare('UPDATE tasks SET status = ?, completed_at = ?, stage = ?, updated_at = ? WHERE id = ?').run(
    completed ? 'completed' : 'open',
    completed ? now : null,
    completed ? 'done' : existing.stage === 'done' ? 'todo' : existing.stage,
    now,
    id,
  );

  let nextTask = null;
  if (completed && existing.repeatRule?.freq) {
    const dueAt = nextOccurrence(existing.dueAt, existing.allDay, existing.repeatRule);
    const detach = existing.subtasks.map((s) => ({ ...s, done: false }));
    nextTask = createTask({
      ...existing,
      id: undefined,
      dueAt,
      allDay: existing.allDay,
      status: 'open',
      completedAt: null,
      stage: 'todo',
      subtasks: detach,
      createdAt: now,
    });
  }
  return { task: getTask(id), nextTask };
}

export function deleteTask(id) {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) throw Object.assign(new Error('任务不存在'), { status: 404 });
  db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id);
  return getTask(id);
}

export function restoreTask(id) {
  const db = getDb();
  db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id);
  return getTask(id);
}

export function purgeTask(id) {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return { ok: true };
}

export function emptyTrash() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE deleted_at IS NOT NULL').get().c;
  db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL').run();
  return { count };
}

export function postponeTask(id, dueAt) {
  return updateTask(id, { dueAt });
}

export function reorderTasks(items = []) {
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, stage = COALESCE(?, stage), updated_at = ? WHERE id = ?');
  const now = nowIso();
  db.exec('BEGIN');
  try {
    for (const item of items) {
      if (!item?.id) continue;
      stmt.run(Number(item.sortOrder) || 0, item.stage || null, now, item.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
}

export function bulkTasks(action, ids = [], payload = {}) {
  const results = [];
  for (const id of ids) {
    try {
      if (action === 'complete') results.push(setTaskCompleted(id, true).task);
      else if (action === 'uncomplete') results.push(setTaskCompleted(id, false).task);
      else if (action === 'delete') results.push(deleteTask(id));
      else if (action === 'restore') results.push(restoreTask(id));
      else if (action === 'postpone') results.push(postponeTask(id, payload.dueAt));
      else if (action === 'priority') results.push(updateTask(id, { priority: payload.priority }));
    } catch {
      // Keep bulk operations resilient.
    }
  }
  return results;
}

export function createList(input = {}) {
  const db = getDb();
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM lists').get()?.m || 0;
  const id = input.id || uid('list');
  const color = input.color || LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)];
  db.prepare(
    'INSERT INTO lists(id,name,emoji,color,sort_order,is_inbox,view_mode,created_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(id, String(input.name || '新清单').trim() || '新清单', input.emoji || '📋', color, Number(input.sortOrder) || max + 1000, 0, input.viewMode || 'list', nowIso());
  return getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id) ? mapList(getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id)) : null;
}

export function updateList(id, patch = {}) {
  const db = getDb();
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries({ name: 'name', emoji: 'emoji', color: 'color', viewMode: 'view_mode', sortOrder: 'sort_order', archived: 'archived' })) {
    if (!(key in patch)) continue;
    fields.push(`${column} = ?`);
    values.push(key === 'archived' ? (patch[key] ? 1 : 0) : patch[key]);
  }
  if (!fields.length) return null;
  values.push(id);
  db.prepare(`UPDATE lists SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  return row ? mapList(row) : null;
}

export function deleteList(id) {
  const db = getDb();
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  if (!list) throw Object.assign(new Error('清单不存在'), { status: 404 });
  if (list.is_inbox) throw Object.assign(new Error('收集箱不能删除'), { status: 400 });
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE tasks SET list_id = 'inbox', updated_at = ? WHERE list_id = ?").run(nowIso(), id);
    db.prepare('UPDATE lists SET archived = 1, deleted_at = ? WHERE id = ?').run(nowIso(), id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
}

export function createTag(input = {}) {
  const db = getDb();
  const name = String(input.name || '').trim();
  if (!name) throw Object.assign(new Error('标签名不能为空'), { status: 400 });
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
  if (existing) return mapTag(existing);
  const id = uid('tag');
  db.prepare('INSERT INTO tags(id,name,color,created_at) VALUES(?,?,?,?)').run(id, name, input.color || TAG_COLORS[0], nowIso());
  return mapTag(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
}

export function updateTag(id, patch = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  if (!row) throw Object.assign(new Error('标签不存在'), { status: 404 });
  const name = patch.name != null ? String(patch.name).trim() || row.name : row.name;
  const color = patch.color || row.color;
  db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, id);
  if (name !== row.name) {
    const tasks = db.prepare('SELECT id, tags FROM tasks').all();
    const stmt = db.prepare('UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?');
    for (const task of tasks) {
      const tags = parseJson(task.tags, []);
      if (!tags.includes(row.name)) continue;
      const next = tags.map((t) => (t === row.name ? name : t));
      stmt.run(JSON.stringify(next), nowIso(), task.id);
    }
  }
  return mapTag(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
}

export function deleteTag(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  if (!row) return { ok: true };
  const tasks = db.prepare('SELECT id, tags FROM tasks').all();
  const stmt = db.prepare('UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?');
  for (const task of tasks) {
    const tags = parseJson(task.tags, []);
    if (!tags.includes(row.name)) continue;
    stmt.run(JSON.stringify(tags.filter((t) => t !== row.name)), nowIso(), task.id);
  }
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return { ok: true };
}

export function createHabit(input = {}) {
  const db = getDb();
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM habits').get()?.m || 0;
  const id = uid('habit');
  db.prepare(
    'INSERT INTO habits(id,name,emoji,color,goal,step,unit,frequency,notes,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    String(input.name || '新习惯').trim() || '新习惯',
    input.emoji || '✅',
    input.color || '#10b981',
    Number(input.goal) || 1,
    Number(input.step) || 1,
    input.unit || '次',
    JSON.stringify(input.frequency || { type: 'daily' }),
    input.notes || '',
    max + 1000,
    nowIso(),
  );
  return mapHabit(db.prepare('SELECT * FROM habits WHERE id = ?').get(id));
}

export function updateHabit(id, patch = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  if (!row) throw Object.assign(new Error('习惯不存在'), { status: 404 });
  const current = mapHabit(row);
  const next = {
    name: patch.name ?? current.name,
    emoji: patch.emoji ?? current.emoji,
    color: patch.color ?? current.color,
    goal: patch.goal ?? current.goal,
    step: patch.step ?? current.step,
    unit: patch.unit ?? current.unit,
    frequency: JSON.stringify(patch.frequency ?? current.frequency),
    notes: patch.notes ?? current.notes,
    sort_order: patch.sortOrder ?? current.sortOrder,
  };
  db.prepare('UPDATE habits SET name=?, emoji=?, color=?, goal=?, step=?, unit=?, frequency=?, notes=?, sort_order=? WHERE id=?').run(
    next.name,
    next.emoji,
    next.color,
    next.goal,
    next.step,
    next.unit,
    next.frequency,
    next.notes,
    next.sort_order,
    id,
  );
  return mapHabit(db.prepare('SELECT * FROM habits WHERE id = ?').get(id));
}

export function deleteHabit(id) {
  const db = getDb();
  db.prepare('UPDATE habits SET archived = 1, deleted_at = ? WHERE id = ?').run(nowIso(), id);
  return { ok: true };
}

export function checkinHabit(id, date, value = 1, note = '') {
  const db = getDb();
  if (Number(value) <= 0) {
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(id, date);
    return { habitId: id, date, value: 0 };
  }
  db.prepare('INSERT OR REPLACE INTO habit_logs(habit_id,date,value,note,updated_at) VALUES(?,?,?,?,?)').run(
    id,
    date,
    Number(value),
    note,
    nowIso(),
  );
  return { habitId: id, date, value: Number(value), note };
}

export function addFocusSession(input = {}) {
  const db = getDb();
  const id = input.id || uid('focus');
  db.prepare(
    'INSERT INTO focus_sessions(id,task_id,mode,duration,started_at,ended_at,completed) VALUES(?,?,?,?,?,?,?)',
  ).run(
    id,
    input.taskId || null,
    input.mode || 'focus',
    Math.max(1, Math.round(Number(input.duration) || 25)),
    input.startedAt || nowIso(),
    input.endedAt || nowIso(),
    input.completed === false ? 0 : 1,
  );
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
  return mapFocus(row);
}

export function createFilter(input = {}) {
  const db = getDb();
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM filters').get()?.m || 0;
  const id = uid('filter');
  db.prepare('INSERT INTO filters(id,name,icon,color,query,sort_order,created_at) VALUES(?,?,?,?,?,?,?)').run(
    id,
    String(input.name || '新过滤器').trim() || '新过滤器',
    input.icon || 'Filter',
    input.color || '#4f76f6',
    JSON.stringify(input.query || {}),
    max + 1000,
    nowIso(),
  );
  return mapFilter(db.prepare('SELECT * FROM filters WHERE id = ?').get(id));
}

export function deleteFilter(id) {
  getDb().prepare('DELETE FROM filters WHERE id = ?').run(id);
  return { ok: true };
}

export function saveSettings(patch = {}) {
  const db = getDb();
  const current = readSettings();
  const merged = deepMerge(current, patch);
  const stmt = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries(patch)) {
    stmt.run(key, JSON.stringify(merged[key]));
  }
  return readSettings();
}

export function exportData() {
  return { app: 'dida-local', version: 1, exportedAt: nowIso(), ...getState() };
}

export function replaceAll(data) {
  if (!data || !Array.isArray(data.tasks)) {
    throw Object.assign(new Error('备份格式不正确'), { status: 400 });
  }
  const lists = Array.isArray(data.lists) ? data.lists : [];
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM tasks; DELETE FROM lists; DELETE FROM tags; DELETE FROM habits; DELETE FROM habit_logs; DELETE FROM focus_sessions; DELETE FROM filters;');
    const listStmt = db.prepare(
      'INSERT INTO lists(id,name,emoji,color,sort_order,is_inbox,view_mode,archived,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    for (const l of lists) {
      listStmt.run(l.id, l.name, l.emoji || '📋', l.color || '#4f76f6', Number(l.sortOrder) || 0, l.isInbox ? 1 : 0, l.viewMode || 'list', l.archived ? 1 : 0, l.createdAt || nowIso());
    }
    const taskStmt = db.prepare(`
      INSERT INTO tasks(id,list_id,title,notes,status,priority,due_at,all_day,completed_at,created_at,updated_at,sort_order,tags,subtasks,repeat_rule,reminders,estimate,focused_seconds,stage,pinned,deleted_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const t of data.tasks) {
      taskStmt.run(
        t.id,
        t.listId || 'inbox',
        t.title || '未命名任务',
        t.notes || '',
        t.status || 'open',
        Number(t.priority) || 0,
        t.dueAt || null,
        t.allDay ? 1 : 0,
        t.completedAt || null,
        t.createdAt || nowIso(),
        t.updatedAt || nowIso(),
        Number(t.sortOrder) || 0,
        JSON.stringify(t.tags || []),
        JSON.stringify(t.subtasks || []),
        t.repeatRule ? JSON.stringify(t.repeatRule) : null,
        JSON.stringify(t.reminders || []),
        Number(t.estimate) || 0,
        Number(t.focusedSeconds) || 0,
        t.stage || 'todo',
        t.pinned ? 1 : 0,
        t.deletedAt || null,
      );
    }
    const tagStmt = db.prepare('INSERT OR IGNORE INTO tags(id,name,color,created_at) VALUES(?,?,?,?)');
    for (const t of data.tags || []) tagStmt.run(t.id || uid('tag'), t.name, t.color || '#4f76f6', t.createdAt || nowIso());
    const habitStmt = db.prepare(
      'INSERT INTO habits(id,name,emoji,color,goal,step,unit,frequency,notes,sort_order,archived,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const h of data.habits || []) {
      habitStmt.run(h.id, h.name, h.emoji || '✅', h.color || '#10b981', Number(h.goal) || 1, Number(h.step) || 1, h.unit || '次', JSON.stringify(h.frequency || { type: 'daily' }), h.notes || '', Number(h.sortOrder) || 0, h.archived ? 1 : 0, h.createdAt || nowIso());
    }
    const logStmt = db.prepare('INSERT OR REPLACE INTO habit_logs(habit_id,date,value,note,updated_at) VALUES(?,?,?,?,?)');
    for (const l of data.habitLogs || []) logStmt.run(l.habitId, l.date, Number(l.value) || 0, l.note || '', l.updatedAt || nowIso());
    const focusStmt = db.prepare('INSERT INTO focus_sessions(id,task_id,mode,duration,started_at,ended_at,completed) VALUES(?,?,?,?,?,?,?)');
    for (const f of data.focusSessions || []) focusStmt.run(f.id, f.taskId || null, f.mode || 'focus', Number(f.duration) || 25, f.startedAt || nowIso(), f.endedAt || nowIso(), f.completed === false ? 0 : 1);
    const filterStmt = db.prepare('INSERT INTO filters(id,name,icon,color,query,sort_order,created_at) VALUES(?,?,?,?,?,?,?)');
    for (const f of data.filters || []) filterStmt.run(f.id, f.name, f.icon || 'Filter', f.color || '#4f76f6', JSON.stringify(f.query || {}), Number(f.sortOrder) || 0, f.createdAt || nowIso());
    if (data.settings) {
      const merged = deepMerge(DEFAULT_SETTINGS, data.settings);
      const stmt = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
      for (const [key, value] of Object.entries(merged)) stmt.run(key, JSON.stringify(value));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getState();
}

export function resetAll() {
  resetDatabase();
  return getState();
}