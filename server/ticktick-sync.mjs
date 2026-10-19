import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, bumpRevision } from './db.mjs';
import { importTickTick, defaultTickTickPath } from './importer.mjs';
import { localDate } from './time.mjs';

const META = {
  enabled: 'ticktick_sync_enabled',
  scope: 'ticktick_sync_scope',
  source: 'ticktick_sync_source',
  lastSync: 'ticktick_sync_last',
  lastError: 'ticktick_sync_error',
  stats: 'ticktick_sync_stats',
  conflicts: 'ticktick_sync_conflicts',
  hash: 'ticktick_sync_hash',
};

let timer = null;
let running = false;
let lastSignature = '';

function getMeta(key, fallback = '') {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

function setMeta(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)').run(key, String(value ?? ''));
}

function nowIso() {
  return new Date().toISOString();
}

function sourcePath() {
  return getMeta(META.source) || defaultTickTickPath();
}

function signatureOf(file) {
  try {
    const main = fs.statSync(file);
    let wal = '';
    try {
      const w = fs.statSync(`${file}-wal`);
      wal = `${w.mtimeMs}:${w.size}`;
    } catch {
      // No WAL.
    }
    return `${main.mtimeMs}:${main.size}:${wal}`;
  } catch {
    return 'missing';
  }
}

function parseCount(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function fingerprintOf(data) {
  return crypto.createHash('sha256').update(JSON.stringify({
    tasks: data.tasks,
    lists: data.lists,
    tags: data.tags,
    habits: data.habits,
    habitLogs: data.habitLogs,
    focusSessions: data.focusSessions,
  })).digest('hex');
}

export function getTickTickSyncStatus() {
  const file = sourcePath();
  return {
    enabled: getMeta(META.enabled, '0') === '1',
    scope: getMeta(META.scope, 'all'),
    source: file,
    sourceExists: fs.existsSync(file),
    running,
    lastSync: getMeta(META.lastSync, '') || null,
    lastError: getMeta(META.lastError, '') || null,
    stats: parseCount(getMeta(META.stats, '{}')),
    conflicts: Number(getMeta(META.conflicts, '0')) || 0,
  };
}

export function setTickTickSyncSettings(patch = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
    setMeta(META.enabled, patch.enabled ? '1' : '0');
  }
  if (patch.scope === 'all' || patch.scope === 'future') {
    setMeta(META.scope, patch.scope);
  }
  if (typeof patch.source === 'string' && patch.source.trim()) {
    setMeta(META.source, patch.source.trim());
    lastSignature = '';
  }
  const status = getTickTickSyncStatus();
  if (status.enabled) {
    setImmediate(() => {
      syncTickTick({ force: true }).catch(() => {});
    });
  }
  return status;
}

function taskStatements(db) {
  const insert = db.prepare(`
    INSERT INTO tasks (
      id, list_id, title, notes, status, priority, due_at, all_day, completed_at,
      created_at, updated_at, sort_order, tags, subtasks, repeat_rule, reminders,
      estimate, focused_seconds, stage, pinned, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE tasks SET
      list_id = ?, title = ?, notes = ?, status = ?, priority = ?, due_at = ?,
      all_day = ?, completed_at = ?, created_at = ?, updated_at = ?, sort_order = ?,
      tags = ?, subtasks = ?, repeat_rule = ?, reminders = ?, estimate = ?,
      focused_seconds = ?, stage = ?, pinned = ?, deleted_at = NULL
    WHERE id = ?
  `);
  const insertArgs = (task) => [
    task.id, task.listId, task.title, task.notes, task.status, task.priority, task.dueAt,
    task.allDay ? 1 : 0, task.completedAt, task.createdAt, task.updatedAt, task.sortOrder,
    JSON.stringify(task.tags || []), JSON.stringify(task.subtasks || []),
    task.repeatRule ? JSON.stringify(task.repeatRule) : null,
    JSON.stringify(task.reminders || []), task.estimate || 0, task.focusedSeconds || 0,
    task.stage || 'todo', task.pinned ? 1 : 0, task.deletedAt || null,
  ];
  return {
    insert,
    update,
    insertArgs,
    updateArgs: (task) => {
      const args = insertArgs(task);
      args.shift();
      args.pop();
      args.push(task.id);
      return args;
    },
  };
}

function mergeSnapshot(data, lastSyncAt) {
  const db = getDb();
  const tasksStmt = taskStatements(db);
  const listStmt = db.prepare(`
    INSERT INTO lists (id, name, emoji, color, sort_order, is_inbox, view_mode, archived, created_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, emoji = excluded.emoji, color = excluded.color,
      sort_order = excluded.sort_order, is_inbox = excluded.is_inbox,
      view_mode = excluded.view_mode, archived = 0, deleted_at = NULL
  `);
  const tagStmt = db.prepare(`
    INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET color = excluded.color
  `);
  const habitStmt = db.prepare(`
    INSERT INTO habits (id, name, emoji, color, goal, step, unit, frequency, notes, sort_order, archived, created_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, emoji = excluded.emoji, color = excluded.color,
      goal = excluded.goal, step = excluded.step, unit = excluded.unit,
      frequency = excluded.frequency, notes = excluded.notes,
      sort_order = excluded.sort_order, archived = 0, deleted_at = NULL
  `);
  const checkinStmt = db.prepare(`
    INSERT INTO habit_logs (habit_id, date, value, note, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const focusStmt = db.prepare(`
    INSERT OR IGNORE INTO focus_sessions (id, task_id, mode, duration, started_at, ended_at, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const existingTasks = new Map(
    db.prepare('SELECT id, updated_at FROM tasks').all().map((row) => [row.id, row.updated_at]),
  );
  const existingLists = new Set(db.prepare('SELECT id FROM lists').all().map((row) => row.id));
  const existingHabits = new Set(db.prepare('SELECT id FROM habits').all().map((row) => row.id));
  const incomingTasks = new Set(data.tasks.map((task) => task.id));
  const changed = { added: 0, updated: 0, removed: 0, conflicts: 0, lists: 0, tags: 0, habits: 0, checkins: 0, focus: 0 };
  const now = nowIso();

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const list of data.lists) {
      listStmt.run(list.id, list.name, list.emoji, list.color, list.sortOrder, list.isInbox ? 1 : 0, list.viewMode, list.archived ? 1 : 0, list.createdAt || now);
      if (!existingLists.has(list.id)) changed.lists += 1;
    }

    for (const task of data.tasks) {
      const localUpdated = existingTasks.get(task.id);
      const locallyEdited = Boolean(lastSyncAt && localUpdated && localUpdated > lastSyncAt);
      if (locallyEdited) {
        changed.conflicts += 1;
        continue;
      }
      if (!localUpdated) {
        tasksStmt.insert.run(...tasksStmt.insertArgs(task));
        changed.added += 1;
      } else if (localUpdated !== task.updatedAt) {
        tasksStmt.update.run(...tasksStmt.updateArgs(task));
        changed.updated += 1;
      }
    }

    for (const [id, updatedAt] of existingTasks) {
      if (!id.startsWith('tt-task-') || incomingTasks.has(id)) continue;
      if (lastSyncAt && updatedAt > lastSyncAt) {
        changed.conflicts += 1;
        continue;
      }
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      changed.removed += 1;
    }

    for (const tag of data.tags) {
      tagStmt.run(tag.id, tag.name, tag.color, tag.createdAt || now);
      changed.tags += 1;
    }

    for (const habit of data.habits) {
      habitStmt.run(
        habit.id, habit.name, habit.emoji, habit.color, habit.goal, habit.step,
        habit.unit, JSON.stringify(habit.frequency), habit.notes, habit.sortOrder,
        habit.createdAt || now,
      );
      if (!existingHabits.has(habit.id)) changed.habits += 1;
    }

    for (const log of data.habitLogs) {
      checkinStmt.run(log.habitId, log.date, log.value, log.note || '', now);
      changed.checkins += 1;
    }

    for (const session of data.focusSessions) {
      focusStmt.run(session.id, session.taskId, session.mode, session.duration, session.startedAt, session.endedAt, session.completed ? 1 : 0);
      changed.focus += 1;
    }

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Transaction already closed.
    }
    throw error;
  }

  return changed;
}

export async function syncTickTick({ force = false } = {}) {
  const status = getTickTickSyncStatus();
  if (!status.enabled && !force) return { ok: true, skipped: true, reason: 'disabled' };
  if (running) return { ok: true, skipped: true, reason: 'running' };
  if (!status.sourceExists) {
    setMeta(META.lastError, `找不到官方滴答数据库：${status.source}`);
    return { ok: false, error: `找不到官方滴答数据库：${status.source}` };
  }

  const signature = signatureOf(status.source);
  if (!force && signature === lastSignature) {
    return { ok: true, skipped: true, reason: 'unchanged', status: getTickTickSyncStatus() };
  }

  running = true;
  setMeta(META.lastError, '');
  try {
    const fromDate = status.scope === 'future' ? localDate() : null;
    const built = importTickTick(status.source, {
      fromDate,
      includeHabits: true,
      keepFilters: true,
      dryRun: true,
    });
    const fingerprint = fingerprintOf(built.data);
    if (!force && fingerprint === getMeta(META.hash, '')) {
      lastSignature = signature;
      return { ok: true, skipped: true, reason: 'unchanged', status: getTickTickSyncStatus() };
    }
    const lastSync = getMeta(META.lastSync, '') || null;
    const changed = mergeSnapshot(built.data, lastSync);
    bumpRevision();
    const next = nowIso();
    setMeta(META.hash, fingerprint);
    setMeta(META.lastSync, next);
    setMeta(META.stats, JSON.stringify({ ...built.stats, ...changed }));
    setMeta(META.conflicts, changed.conflicts);
    lastSignature = signature;
    return { ok: true, syncedAt: next, stats: built.stats, changed, status: getTickTickSyncStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMeta(META.lastError, message);
    return { ok: false, error: message, status: getTickTickSyncStatus() };
  } finally {
    running = false;
  }
}

export function startTickTickSync() {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    const status = getTickTickSyncStatus();
    if (!status.enabled) return;
    const signature = signatureOf(status.source);
    if (signature === lastSignature) return;
    syncTickTick().catch(() => {});
  }, 5000);
  timer.unref?.();
}

export function stopTickTickSync() {
  if (timer) clearInterval(timer);
  timer = null;
}
