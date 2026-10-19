import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('data-test-future');
process.env.DIDA_DATA_DIR = dataDir;
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
const { importTickTick, inspectTickTick } = await import('../server/importer.mjs');
const { getState } = await import('../server/store.mjs');
const { closeDb } = await import('../server/db.mjs');
const source = process.env.TICKTICK_DB || path.join(process.env.APPDATA || '', 'Tick_Tick', 'TickTick.db');
if (!fs.existsSync(source)) {
  console.log(`Skipped: no TickTick database at ${source}. Set TICKTICK_DB to test import.`);
  process.exit(0);
}
const fromDate = new Date().toISOString().slice(0, 10);
const preview = inspectTickTick(source, { fromDate });
const result = importTickTick(source, { fromDate, includeHabits: true, keepFilters: false });
const state = getState();
const early = state.tasks.filter((t) => !t.dueAt || t.dueAt.slice(0, 10) < fromDate);
const outcome = {
  preview,
  stats: result.stats,
  tasks: state.tasks.length,
  lists: state.lists.length,
  habits: state.habits.length,
  logs: state.habitLogs.length,
  filters: state.filters.length,
  early: early.length,
  dates: [...new Set(state.tasks.map((t) => t.dueAt?.slice(0, 10)))].sort(),
  sample: state.tasks.slice(0, 5).map((t) => ({ title: t.title, dueAt: t.dueAt, allDay: t.allDay })),
  listNames: state.lists.map((l) => `${l.emoji}${l.name}`),
  userName: state.settings.userName,
};
console.log(JSON.stringify(outcome, null, 2));
closeDb();
fs.rmSync(dataDir, { recursive: true, force: true });
if (outcome.early !== 0 || state.filters.length !== 0) process.exit(1);
