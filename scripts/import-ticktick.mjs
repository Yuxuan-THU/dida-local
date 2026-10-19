import { importTickTick, defaultTickTickPath } from '../server/importer.mjs';
import { localDate } from '../server/time.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const source = args.find((arg) => !arg.startsWith('--')) || defaultTickTickPath();
const fromDate = all ? null : localDate();
console.log(`正在读取：${source}`);
console.log(all ? '导入范围：全部历史' : `导入范围：${fromDate} 及以后`);
const result = importTickTick(source, { fromDate, includeHabits: true, keepFilters: false });
console.log('导入完成：');
console.log(`  任务 ${result.stats.tasks}（已完成 ${result.stats.completed}）`);
console.log(`  清单 ${result.stats.lists} / 标签 ${result.stats.tags}`);
console.log(`  习惯 ${result.stats.habits} / 打卡 ${result.stats.checkins}`);
console.log(`  导入前备份：${result.backupPath}`);
