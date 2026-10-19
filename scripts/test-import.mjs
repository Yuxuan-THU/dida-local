import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('data-test-import');
process.env.DIDA_DATA_DIR = dataDir;
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

const { inspectTickTick, importTickTick } = await import('../server/importer.mjs');
const { getState } = await import('../server/store.mjs');
const { closeDb } = await import('../server/db.mjs');

const source = path.resolve('../verify/TickTick-copy.db');
const preview = inspectTickTick(source);
console.log('preview', preview);
const started = Date.now();
const result = importTickTick(source);
console.log('imported in ms', Date.now() - started, result.stats);
const state = getState();
const checks = {
  tasks: state.tasks.length,
  lists: state.lists.length,
  tags: state.tags.length,
  habits: state.habits.length,
  completed: state.tasks.filter((t) => t.status === 'completed').length,
  dueTasks: state.tasks.filter((t) => t.dueAt).length,
  inboxTasks: state.tasks.filter((t) => t.listId === state.lists.find((l) => l.isInbox)?.id).length,
  hasChinese: state.tasks.some((t) => /[\u4e00-\u9fa5]/.test(t.title)),
  sample: state.tasks.find((t) => t.status === 'open' && t.title.length > 2),
  listNames: state.lists.map((l) => `${l.emoji}${l.name}`),
};
console.log(JSON.stringify(checks, null, 2));
closeDb();
fs.rmSync(dataDir, { recursive: true, force: true });
