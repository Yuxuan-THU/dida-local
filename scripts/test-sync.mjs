import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('data-test-sync');
process.env.DIDA_DATA_DIR = dataDir;
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

const source = process.env.TICKTICK_DB || path.join(process.env.APPDATA || '', 'Tick_Tick', 'TickTick.db');
if (!fs.existsSync(source)) {
  console.log(`Skipped: no TickTick database at ${source}. Set TICKTICK_DB to test sync.`);
  process.exit(0);
}

const { getState } = await import('../server/store.mjs');
const { closeDb } = await import('../server/db.mjs');
const { setTickTickSyncSettings, syncTickTick, getTickTickSyncStatus } = await import('../server/ticktick-sync.mjs');

const before = getState();
setTickTickSyncSettings({ enabled: false, scope: 'all', source });
const first = await syncTickTick({ force: true });
const state = getState();
const mirrors = state.tasks.filter((t) => t.id.startsWith('tt-task-'));
const second = await syncTickTick({ force: true });
const status = getTickTickSyncStatus();
const outcome = {
  sourceExists: fs.existsSync(source),
  beforeTasks: before.tasks.length,
  firstOk: first.ok,
  firstChanged: first.changed,
  secondOk: second.ok,
  mirrorTasks: mirrors.length,
  totalTasks: state.tasks.length,
  officialLists: state.lists.filter((l) => l.id.startsWith('tt-list-')).length,
  officialHabits: state.habits.filter((h) => h.id.startsWith('tt-habit-')).length,
  checkins: state.habitLogs.length,
  conflicts: status.conflicts,
  lastSync: status.lastSync,
  sample: mirrors.slice(0, 3).map((t) => ({ title: t.title, dueAt: t.dueAt, status: t.status })),
};
console.log(JSON.stringify(outcome, null, 2));
closeDb();
fs.rmSync(dataDir, { recursive: true, force: true });
if (!first.ok || mirrors.length === 0 || outcome.officialLists < 3 || outcome.officialHabits < 1) process.exit(1);
