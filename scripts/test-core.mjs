import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('data-test-core');
process.env.DIDA_DATA_DIR = dataDir;
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

const store = await import('../server/store.mjs');
const { closeDb } = await import('../server/db.mjs');
const { localDate, addDays } = await import('../server/time.mjs');

const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error('FAIL', name, detail);
};

let state = store.getState();
check('no lists exposed', state.lists.length === 0, `${state.lists.length}`);
check('seed tasks', state.tasks.length >= 10, `${state.tasks.length}`);

const task = store.createTask({
  title: '每天阅读',
  priority: 2,
  dueAt: localDate(),
  allDay: true,
  tags: ['学习'],
  subtasks: [{ id: 'a', title: '第一章', done: false }],
  repeatRule: { freq: 'daily', interval: 1 },
  reminders: [0, 30],
});
check('create task', task?.title === '每天阅读');
check('task tags', task.tags.includes('学习'));
check('task reminders', task.reminders.length === 2);

const updated = store.updateTask(task.id, { priority: 3, notes: '今晚读', subtasks: [{ id: 'a', title: '第一章', done: true }] });
check('update task', updated.priority === 3 && updated.notes === '今晚读');
check('subtask done', updated.subtasks[0].done === true);

const completion = store.setTaskCompleted(task.id, true);
check('complete task', completion.task.status === 'completed');
check('repeat next task', completion.nextTask?.dueAt === addDays(localDate(), 1), completion.nextTask?.dueAt);
check('repeat next reset subtasks', completion.nextTask?.subtasks[0].done === false);
check('repeat next open', completion.nextTask?.status === 'open');

const restored = store.setTaskCompleted(task.id, false);
check('uncomplete task', restored.task.status === 'open');

store.deleteTask(task.id);
check('soft delete', Boolean(store.getTask(task.id).deletedAt));
store.restoreTask(task.id);
check('restore', store.getTask(task.id).deletedAt === null);

const tag = store.createTag({ name: '测试标签', color: '#ef4444' });
check('create tag', tag?.name === '测试标签');
store.updateTask(task.id, { tags: ['测试标签'] });
const renamed = store.updateTag(tag.id, { name: '改名标签', color: '#10b981' });
check('rename tag', renamed.name === '改名标签');
check('tag follows rename', store.getTask(task.id).tags.includes('改名标签'));
store.deleteTag(tag.id);
check('tag removed from tasks', !store.getTask(task.id).tags.includes('改名标签'));

const filter = store.createFilter({ name: '高优', query: { priority: [3] } });
check('create filter', filter?.name === '高优');
store.deleteFilter(filter.id);
check('delete filter', !store.getState().filters.some((f) => f.id === filter.id));

store.saveSettings({ theme: 'dark', dailyTaskGoal: 7 });
const settings = store.getState().settings;
check('save settings', settings.theme === 'dark' && settings.dailyTaskGoal === 7);

const exportData = store.exportData();
check('export state', exportData.app === 'dida-local' && Array.isArray(exportData.tasks));
store.replaceAll(exportData);
check('restore state', store.getState().tasks.length === exportData.tasks.length);

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
closeDb();
fs.rmSync(dataDir, { recursive: true, force: true });
if (failed.length) process.exit(1);
