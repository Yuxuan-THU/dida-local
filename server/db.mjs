import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS } from './defaults.mjs';
import { localDate, localDateTime, addDays } from './time.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
export const DATA_DIR = process.env.DIDA_DATA_DIR || path.join(appRoot, 'data');
export const DB_PATH = path.join(DATA_DIR, 'dida.db');

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📋',
  color TEXT NOT NULL DEFAULT '#4f76f6',
  sort_order REAL NOT NULL DEFAULT 0,
  is_inbox INTEGER NOT NULL DEFAULT 0,
  view_mode TEXT NOT NULL DEFAULT 'list',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  subtasks TEXT NOT NULL DEFAULT '[]',
  repeat_rule TEXT,
  reminders TEXT NOT NULL DEFAULT '[]',
  estimate INTEGER NOT NULL DEFAULT 0,
  focused_seconds INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'todo',
  pinned INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#4f76f6',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#10b981',
  goal REAL NOT NULL DEFAULT 1,
  step REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '次',
  frequency TEXT NOT NULL DEFAULT '{"type":"daily"}',
  notes TEXT NOT NULL DEFAULT '',
  sort_order REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  mode TEXT NOT NULL DEFAULT 'focus',
  duration INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Filter',
  color TEXT NOT NULL DEFAULT '#4f76f6',
  query TEXT NOT NULL DEFAULT '{}',
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seedIfEmpty();
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

function q(name) {
  return db.prepare(`SELECT value FROM meta WHERE key = ?`).get(name)?.value;
}

function setMeta(key, value) {
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)').run(key, String(value));
}

export function getRevision() {
  getDb();
  return Number(q('revision') || 0);
}

export function bumpRevision() {
  getDb();
  const next = getRevision() + 1;
  setMeta('revision', next);
  return next;
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
  if (count > 0) return;

  const now = new Date().toISOString();
  const today = localDate();
  const at = (dayOffset, time = '09:00') => localDateTime(new Date(`${addDays(today, dayOffset)}T${time}:00`));

  const tasks = [
    {
      id: 'seed-1',
      list: 'welcome',
      title: '欢迎来到滴答 · 本地任务',
      notes: '这是一组完全运行在你电脑上的任务。\n\n· 按 Q 快速添加任务\n· 按 Ctrl/⌘ + K 搜索一切\n· 点击任务标题打开详情\n· 在「设置 → 数据」里可以一键导入已有的滴答清单数据',
      priority: 0,
      due: today,
      time: null,
      tags: [],
      stage: 'todo',
      subtasks: [
        { id: 'st-1', title: '添加第一个任务', done: true },
        { id: 'st-2', title: '试试番茄专注', done: false },
        { id: 'st-3', title: '给自己创建一个习惯', done: false },
      ],
    },
    {
      id: 'seed-2',
      list: 'welcome',
      title: '把今天安排得刚刚好',
      notes: '',
      priority: 2,
      due: today,
      time: '10:00',
      tags: ['生活'],
      stage: 'todo',
    },
    {
      id: 'seed-3',
      list: 'work',
      title: '整理上周会议纪要',
      notes: '把行动项拆成可以执行的小任务，并同步给相关同事。',
      priority: 3,
      due: addDays(today, -2),
      time: '18:00',
      tags: ['工作'],
      stage: 'doing',
      subtasks: [
        { id: 'st-4', title: '汇总讨论要点', done: true },
        { id: 'st-5', title: '拆解行动项', done: false },
      ],
    },
    {
      id: 'seed-4',
      list: 'work',
      title: '回复产品评审意见',
      notes: '',
      priority: 3,
      due: today,
      time: '11:30',
      tags: ['工作'],
      stage: 'doing',
      estimate: 2,
    },
    {
      id: 'seed-5',
      list: 'work',
      title: '准备季度复盘提纲',
      notes: '目标、结果、偏差、下一步。控制在 8 页内。',
      priority: 2,
      due: addDays(today, 1),
      time: '15:00',
      tags: ['工作'],
      stage: 'todo',
      estimate: 3,
    },
    {
      id: 'seed-6',
      list: 'personal',
      title: '给妈妈打电话',
      notes: '',
      priority: 1,
      due: today,
      time: '20:00',
      tags: ['生活'],
      stage: 'todo',
    },
    {
      id: 'seed-7',
      list: 'personal',
      title: '续费域名和云服务器',
      notes: '',
      priority: 2,
      due: addDays(today, -1),
      time: null,
      tags: ['生活'],
      stage: 'todo',
    },
    {
      id: 'seed-8',
      list: 'fitness',
      title: '跑步 5 公里',
      notes: '轻松跑，心率控制在 150 以下。',
      priority: 1,
      due: today,
      time: '19:00',
      tags: ['健康'],
      stage: 'todo',
      estimate: 1,
    },
    {
      id: 'seed-9',
      list: 'personal',
      title: '读完《深度工作》第 3 章',
      notes: '',
      priority: 1,
      due: addDays(today, 2),
      time: '21:00',
      tags: ['学习'],
      stage: 'todo',
    },
    {
      id: 'seed-10',
      list: 'inbox',
      title: '整理灵感',
      notes: '把散落在备忘录里的想法归到一个地方。',
      priority: 0,
      due: null,
      time: null,
      tags: [],
      stage: 'todo',
    },
    {
      id: 'seed-11',
      list: 'work',
      title: '预约牙医',
      notes: '',
      priority: 1,
      due: addDays(today, 4),
      time: '09:30',
      tags: ['生活'],
      stage: 'todo',
    },
    {
      id: 'seed-12',
      list: 'work',
      title: '提交周报',
      notes: '',
      priority: 2,
      due: addDays(today, -3),
      time: '17:00',
      tags: ['工作'],
      stage: 'todo',
    },
    {
      id: 'seed-13',
      list: 'welcome',
      title: '下班前清空收件箱',
      notes: '',
      priority: 0,
      due: addDays(today, -1),
      time: null,
      tags: ['生活'],
      stage: 'todo',
      status: 'completed',
      completedAt: at(-1, '18:20'),
    },
    {
      id: 'seed-14',
      list: 'fitness',
      title: '晨间拉伸 10 分钟',
      notes: '',
      priority: 0,
      due: today,
      time: '07:30',
      tags: ['健康'],
      stage: 'done',
      status: 'completed',
      completedAt: at(0, '07:42'),
    },
    {
      id: 'seed-15',
      list: 'personal',
      title: '整理书桌',
      notes: '',
      priority: 0,
      due: addDays(today, 1),
      time: '10:00',
      tags: ['生活'],
      stage: 'todo',
    },
    {
      id: 'seed-16',
      list: 'work',
      title: '和设计对齐新版首页',
      notes: '',
      priority: 2,
      due: addDays(today, 3),
      time: '14:00',
      tags: ['工作'],
      stage: 'todo',
      repeat: { freq: 'weekly', interval: 1, weekdays: [3] },
      estimate: 1,
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks(id,list_id,title,notes,status,priority,due_at,all_day,completed_at,created_at,updated_at,sort_order,tags,subtasks,repeat_rule,reminders,estimate,stage)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  tasks.forEach((t, i) => {
    insertTask.run(
      t.id,
      t.list || '',
      t.title,
      t.notes,
      t.status || 'open',
      t.priority,
      t.due ? (t.time ? `${t.due}T${t.time}` : t.due) : null,
      t.time ? 0 : 1,
      t.completedAt || null,
      now,
      now,
      i * 1000,
      JSON.stringify(t.tags || []),
      JSON.stringify(t.subtasks || []),
      t.repeat ? JSON.stringify(t.repeat) : null,
      JSON.stringify([]),
      t.estimate || 0,
      t.stage || 'todo',
    );
  });

  const tags = [
    ['tag-work', '工作', '#4f76f6'],
    ['tag-life', '生活', '#f59e0b'],
    ['tag-study', '学习', '#10b981'],
    ['tag-health', '健康', '#8b5cf6'],
  ];
  const insertTag = db.prepare('INSERT INTO tags(id,name,color,created_at) VALUES(?,?,?,?)');
  for (const t of tags) insertTag.run(t[0], t[1], t[2], now);

  const habits = [
    {
      id: 'habit-1',
      name: '早起',
      emoji: '🌅',
      color: '#f59e0b',
      goal: 1,
      unit: '次',
      frequency: { type: 'daily' },
      sort: 1000,
    },
    {
      id: 'habit-2',
      name: '锻炼身体',
      emoji: '🏃',
      color: '#8b5cf6',
      goal: 1,
      unit: '次',
      frequency: { type: 'daily' },
      sort: 2000,
    },
    {
      id: 'habit-3',
      name: '阅读 30 分钟',
      emoji: '📖',
      color: '#10b981',
      goal: 1,
      unit: '次',
      frequency: { type: 'weekly', days: [1, 3, 5, 0] },
      sort: 3000,
    },
  ];
  const insertHabit = db.prepare(
    'INSERT INTO habits(id,name,emoji,color,goal,step,unit,frequency,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  );
  for (const h of habits) insertHabit.run(h.id, h.name, h.emoji, h.color, h.goal, 1, h.unit, JSON.stringify(h.frequency), h.sort, now);

  const insertLog = db.prepare('INSERT OR REPLACE INTO habit_logs(habit_id,date,value,updated_at) VALUES(?,?,?,?)');
  for (let d = 1; d <= 21; d += 1) {
    const date = addDays(today, -d);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if ([1, 2, 3, 4, 5].includes(weekday) && d % 3 !== 0) insertLog.run('habit-1', date, 1, now);
    if ([1, 3, 5].includes(weekday)) insertLog.run('habit-2', date, 1, now);
    if ([1, 3, 5, 0].includes(weekday) && d % 2 === 0) insertLog.run('habit-3', date, 1, now);
  }

  const insertFocus = db.prepare(
    'INSERT INTO focus_sessions(id,task_id,mode,duration,started_at,ended_at,completed) VALUES(?,?,?,?,?,?,?)',
  );
  for (let d = 0; d < 7; d += 1) {
    const start = new Date();
    start.setDate(start.getDate() - d);
    start.setHours(10, 0, 0, 0);
    const count = d === 1 || d === 4 ? 3 : d === 0 ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      start.setMinutes(0);
      start.setHours(10 + i * 2);
      const end = new Date(start.getTime() + 25 * 60000);
      insertFocus.run(
        `focus-seed-${d}-${i}`,
        i === 0 && d === 0 ? 'seed-4' : null,
        'focus',
        25,
        start.toISOString(),
        end.toISOString(),
        1,
      );
    }
  }

  const insertFilter = db.prepare('INSERT INTO filters(id,name,icon,color,query,sort_order,created_at) VALUES(?,?,?,?,?,?,?)');
  insertFilter.run('filter-work-high', '重要工作', 'Star', '#ef4444', JSON.stringify({ priority: [2, 3], tag: '工作' }), 1000, now);

  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, JSON.stringify(value));
  }
  setMeta('seeded_at', now);
  setMeta('schema_version', 1);
  setMeta('revision', 0);
}

export function resetDatabase() {
  getDb();
  db.exec(`
    DELETE FROM tasks;
    DELETE FROM lists;
    DELETE FROM tags;
    DELETE FROM habits;
    DELETE FROM habit_logs;
    DELETE FROM focus_sessions;
    DELETE FROM filters;
    DELETE FROM settings;
    DELETE FROM meta;
  `);
  seedIfEmpty();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function sqliteAvailable() {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}