# REA 逆向分析与复刻依据

本文件记录「滴答 · 本地清单」的逆向取样过程、证据、数据映射和边界。
目标是**理解交互与数据结构，然后独立实现**，不是复制官方代码或资源。

---

## 1. 目标环境

| 项 | 值 |
| --- | --- |
| 软件 | 滴答清单（TickTick）Windows 桌面版 |
| 版本 | `4.3.4.0` |
| 安装目录 | `<TickTick 安装目录>\` |
| 技术栈 | WPF / .NET（C#）+ Kotlin Multiplatform + SQLite |
| 主程序 | `TickTick.exe`（约 15 MB） |
| 数据库 | `%APPDATA%\Tick_Tick\TickTick.db`（快照约 4.86 MB） |
| 分析日期 | 2026-10-18 |

关键结论：**它不是 Electron 应用**，所以不能直接拆 `app.asar`。可行的证据链是：

1. REA 的 .NET 静态程序集检查（元数据、字段、方法名、CIL 锚点，不加载执行）
2. SQLite schema + 真实数据分布
3. Windows UI Automation 树 + 窗口截图

---

## 2. REA 工具链

使用 `rea-agents@6.5.0`，全部命令在本机执行，未上传安装包或数据库。

### 2.1 任务服务类型

```powershell
npx -y rea-agents@latest inspect-managed-members `
  "<TickTick 安装目录>\TickTickHandler.dll" `
  --type TickTickHandler.TickTickTask `
  --format md
```

证据：

| 项 | 值 |
| --- | --- |
| evidence_id | `ev_be3a75b725fd5a619492898780f9ea513c26918085ed124ca683f5faa8df3ebe` |
| SHA-256 | `1536e785f2b5d18da158ea8876dc0f0e516a6bb045287b9d02d8f957041524e6` |
| MVID | `116f44c5-f431-4268-a40f-1d0d96c9256e` |
| 架构 | x86_64 |
| Provider | `rea-dotnet-static` v1 |

观察到的字段（任务服务委托）：

```text
GetTaskByIdFun
UpdateTaskFun
UpdateTaskAndRemindersFun
CreateTaskFun
CloneTaskFun
GetTaskDefaultReminderParamsFun
UpdateCheckListItemsFun
DeletePomodoroSummariesFun
```

这组方法名直接支撑了本地版的任务 CRUD、提醒、子任务清单、番茄记录和“创建副本”功能的建模。
完整输出未随仓库分发（避免公开第三方程序集元数据）。

### 2.2 悬浮任务窗口模型

```powershell
npx -y rea-agents@latest inspect-managed-members `
  "<TickTick 安装目录>\TickTickModels.dll" `
  --type TickTickModels.TaskStickyModel `
  --format md
```

证据：

| 项 | 值 |
| --- | --- |
| evidence_id | `ev_7769fb35989f3d2e32cfa1aa5f696b49ba1a08fe69b72f39b3a176915a1117a8` |
| SHA-256 | `2188eb3b1151fcda0b1ec909b3eb5f55c2f421734935628f97606f27aca5f3a9` |
| MVID | `7424ff1c-9a75-46fa-8853-0ffc6ec5fe05` |
| 架构 | x86 |

字段：`TaskId`、`TopMost`、`Expand`、`Closed`、`Top`、`Left`、`Width`、`Height`、`UserId`、`Color`、`LastCloseDate`。

说明：这是“任务悬浮窗”的模型，不是主任务表；这里用它验证 WPF 侧的模型命名和字段风格，
主任务字段仍以 SQLite schema 为准。完整输出见
原始输出未随仓库分发。

### 2.3 失败的 SQLite 子命令（重要限制）

```powershell
npx -y rea-agents@latest inspect-sqlite-database `
  "<TickTick 数据库快照>.db" --format json --full-output
```

返回：

```json
{
  "ok": false,
  "error": {
    "code": "capability_unavailable",
    "message": "SQLite inspection requires the native DatabaseSync.limits API ... Use Node.js 24.15 or newer ..."
  }
}
```

本机 Node 为 **v24.13.0**，低于 REA 要求的 24.15，因此该子命令被安全拒绝。
没有绕过这个限制；数据库结构改用 `node:sqlite` 只读快照和 SQL 查询交叉验证。
这在 README 中也明确标注。

### 2.4 取样快照

```text
源：`%APPDATA%\Tick_Tick\TickTick.db`
快照：`<TickTick 数据库快照>.db`
SHA-256：BB7D59DFB5643DFBA6FDE4668B301F4EC61107517ECCC307A1B934EBD9AB5FA9
大小：4,857,856 bytes
方式：SQLite backup API（只读打开，避免干扰正在运行的客户端）
```

### 2.5 UI 结构

Windows UI Automation 树中可直接观察到：

```text
Window: 滴答清单
  ListItem  ticktick_WPF.ViewModels.SmartProjectViewModel
  ListItem  ticktick_WPF.ViewModels.InboxProjectViewModel
  ListItem  ticktick_WPF.ViewModels.NormalProjectViewModel
  ListItem  ticktick_WPF.ViewModels.DisplayItemModel
  Custom    CalendarControl / CalendarHead / MonthGridControl / MonthWeekControl
  Custom    ProjectMenuControl / LeftMenuBar
  Text      TitleText
```

对照窗口截图确认的布局：

```text
左侧图标栏 100 px（物理像素）
项目侧栏   424 px
任务区     ~1596 px
右侧详情   ~488 px（未选中任务时显示占位插画）
```

本地版按逻辑像素复刻为 `70 / 258 / 自适应 / 466`，保持同样的阅读顺序与视觉层级。
原版日历在 4.3.4.0 中对非 Pro 账号弹出升级浮层；本地版不设置付费墙。

---

## 3. 数据库结构

快照中的关键表：

| 表 | 行数 | 用途 |
| --- | ---: | --- |
| `TaskModel` | 3,065 | 任务（含历史完成） |
| `ProjectModel` | 4 | 清单 |
| `TaskReminderModel` | 1,320 | 任务提醒 |
| `HabitModel` | 2 | 习惯 |
| `HabitCheckInModel` | 60 | 习惯打卡 |
| `PomodoroModel` | 0 | 番茄记录 |
| `TaskSyncedJsonModel` | 2,413 | 云端同步 JSON 缓存 |
| `TagModel` | 0 | 标签（该账号未使用） |

### 3.1 任务字段（节选）

```sql
TaskModel(
  id, projectId, parentId, title, content, desc,
  status, priority, startDate, dueDate, isAllDay,
  repeatFlag, reminder, tag, completedTime,
  createdTime, modifiedTime, sortOrder, deleted,
  childrenString, timeZone, ...
)
```

状态分布：

```text
status = 0   未完成     233
status = 2   已完成   2,645
status = -1  已放弃       2
deleted = 0 且 status ∈ {0,2,-1}   2,880
```

优先级分布：

```text
0 → 3,045    1 → 10    3 → 3    5 → 7
```

本地版把 `1/3/5` 映射为 `低/中/高`，`0` 为无优先级。

### 3.2 清单

```sql
ProjectModel(id, name, color, Isinbox, sortOrder,
             viewMode, kind, delete_status, ...)
```

真实清单：

```text
收集箱
👋欢迎
🏠个人备忘
🏃锻炼计划（viewMode = kanban）
```

### 3.3 习惯

```sql
HabitModel(Id, Name, IconRes, Color, Type, Goal, Step, Unit,
           RepeatRule, TargetDays, SortOrder, ...)
HabitCheckInModel(HabitId, CheckinStamp, CheckinTime, Value,
                  Goal, Status, ...)
```

`RepeatRule` 使用 RRULE 文本，例如：

```text
RRULE:FREQ=DAILY;INTERVAL=1
```

导入器把 `DAILY / WEEKLY / BYDAY / MONTHLY / YEARLY` 转成本地 `RepeatRule` 对象。

---

## 4. 从证据到实现

| 原版行为/结构 | 本地实现 | 证据来源 |
| --- | --- | --- |
| `TaskModel` 字段 | `server/db.mjs` 的 `tasks` 表 | SQLite schema |
| 左栏：今天 / 7 天 / 收集箱 / 清单 / 标签 / 过滤器 | `Sidebar.tsx` | UIA + 截图 |
| 任务分组：已过期 / 今天 / 已完成 | `lib/selectors.ts` | 截图 + UIA 文本 |
| 任务行：勾选、标题、子任务计数、标签、日期、清单、优先级 | `TaskRow.tsx` | 截图 + UIA |
| 右侧详情面板 | `DetailPane.tsx` | 截图 |
| 日历月/周视图、右侧当日列表 | `CalendarView.tsx` | `CalendarControl` + 截图 |
| 番茄、习惯、矩阵、摘要 | `FocusView` / `HabitsView` / `MatrixView` / `SummaryView` | 公开产品形态 + 侧栏结构 |
| 任务完成/克隆/提醒/子任务 | 服务端 CRUD + 重复任务生成 | `TickTickTask` 方法名 |
| 2,880 条真实任务迁移 | `server/importer.mjs` | SQLite 快照 |

### 动效复刻

不是逐帧复制，而是对齐交互语义：

- 勾选：SVG path 从 0 到 1 绘制，任务行在完成后移动到「已完成」分组
- 侧栏选中：`framer-motion` 的 `layoutId` 做滑动高亮
- 视图切换：淡入 + 轻微上移
- 快速添加：高度展开 + parsed chip 即时反馈
- 详情/弹窗：spring 过渡
- 专注/习惯完成：彩纸粒子
- 计时环：按剩余时间连续收缩
- 设置/搜索/右键菜单：缩放 + 透明度过渡
- 尊重 `prefers-reduced-motion`

---

## 5. 独立实现的边界

**没有做**：

- 反编译或复制官方 C# / Kotlin 业务代码
- 提取官方图标、插画、字体、音频
- 绕过登录、授权、Pro 付费墙
- 读取或上传登录 token、密码、附件内容
- 复刻云端团队协作、评论、@成员、账号同步

**做了**：

- 读取本机用户自己的 SQLite 业务数据，用于本地迁移
- 静态读取程序集元数据，理解字段/方法语义
- 独立重写全部 UI、样式、服务端与数据模型
- 用真实快照验证导入正确性

---

## 6. 复现命令

```powershell
# 1. 任务服务类型
npx -y rea-agents@latest inspect-managed-members `
  "<TickTick 安装目录>\TickTickHandler.dll" `
  --type TickTickHandler.TickTickTask --format md

# 2. 悬浮窗模型
npx -y rea-agents@latest inspect-managed-members `
  "<TickTick 安装目录>\TickTickModels.dll" `
  --type TickTickModels.TaskStickyModel --format md

# 3. SQLite（本机 Node 24.13 下会被拒绝）
npx -y rea-agents@latest inspect-sqlite-database `
  "<TickTick 数据库快照>.db" --format json --full-output

# 4. 本地导入验证
npm run test:import
```

---

## 7. 证据留存

- 本文保留了关键类型、方法名、SHA-256、MVID 和 evidence ID，便于复核；
- 原始 REA 输出、官方 APK 分析记录、数据库快照和对比截图**未随仓库分发**，
  因为它们包含第三方程序集元数据或本机个人数据；
- 复现方法见上一节。换一台机器或升级滴答清单后，MVID / 地址 / 字段都可能变化，需要重新取样。

> 本项目只做本地数据互操作和交互研究，不包含官方源代码、图片、字体或签名材料。
