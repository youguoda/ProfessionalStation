# 产品与技术方案（Product & Technical Spec）

> 本文档是任务计划网站的实现真相源。方法论依据见 `methodology-research.md`。

## 1. 产品定位

**一句话**：一个给**单个使用者**的任务系统——把多种方法论里唯一值钱的**约束**提取出来焊死在界面里，然后把方法论本身藏起来。

- **目标用户**：作者本人（单用户，清单派，不排期）。
- **核心主张**：方法论不该做成视图，该做成约束。用户需要的是一条不用思考的固定动线，而不是在 GTD / 看板 / 四象限之间挑一个。
- **不做什么**：多端同步、团队协作、日历集成。

## 2. 核心设计决策

### 2.1 方法论 → 约束

每个方法论只保留一条真正值钱的东西，视图本身删除：

| 方法论 | 提取出的约束 | 落点 |
|---|---|---|
| GTD | 收件箱必须能清空，一次性澄清 | 收件箱 + 一次一条的澄清流 |
| 看板 | **限制在制品** | 全局 WIP 计数器（`maxDoing`，硬拦） |
| Ivy Lee | **每天只写 N 件事** | 今日容量条（`maxToday`，软提示） |
| 艾森豪威尔 | 重要 ≠ 紧急 | 周回顾里的一个提醒（Q2 清单） |
| 时间块 | 承诺到具体时刻 | 退化为「今天做不做」；`scheduledAt` 只留给会议 |
| PARA | 容器组织 | 侧边栏的项目 / 领域 / 笔记分组 |
| Atomic Habits | 不断链 | 习惯打卡 |

**结果**：没有「视图模式」这个选择。每个范围只有一种正确的展示方式。

### 2.2 两个正交维度不冲突

- `phase` 是 GTD 的**库存**维度：可以无限长，不设上限。
- `status` 是看板的**流动**维度：`doing` 有全局硬上限。

**库存无限，在制有限。**

### 2.3 承诺 ≠ 要求

- `dueDate` = 世界对我的要求（外部约束）
- `plannedFor` = 我对自己的承诺（内部意图）

「今天」只读 `plannedFor`，不从 `dueDate` 推导——自己放进来的会做，系统塞的会视而不见。唯一的例外是**逾期置顶**：逾期是历史欠账，会显示但不占今天的额度。

### 2.4 笔记不是任务

`reference` 从 phase 里拆出去，成为独立的 `Note` 实体：没有 status / priority / dueDate，只有内容、时间、标签和可搜索性。

## 3. 任务生命周期

```
                    ┌── 存成笔记 → Note（离开任务系统）
                    ├── 以后再说 → someday ──┐
  捕获 → inbox ─澄清─┼── 等别人   → waiting  │
   (3秒)            ├── 删掉     → trash     │
                    └── 现在要做 → action ←──┘
                                   │
                        ┌──────────┴──────────┐
                 plannedFor = 今天        在「下一步」里等
                    （承诺）                  （库存）
                        │
                     「开始」→ status = doing   ← 全局硬上限
                        │
                 ┌──────┴──────┐
               完成           放回待办
                 ↓
           done + completedAt → 已完成日志 → 周回顾结算
```

**四种终局，只有一种是「完成」**：

| 终局 | 含义 | 触发 |
|---|---|---|
| `done` | 做了 | 勾选 |
| `canceled` | 有意识地决定不做（带原因） | 详情页 / 周回顾结算台 |
| `trash` | 根本不该存在 | 删除 |
| 转化 | 拆成子任务 / 转成笔记 | 详情页 |

**健康指标**：每条任务最终都必须走到某个终局，不能永远悬着。

## 4. 状态机（技术心脏）

`transition(task, event) -> Task | error`，是**唯一**的状态转换真相源。非法迁移返回错误而非静默。

- 事件：`clarify`（action/waiting/someday）、`start`、`stop`（放回待办）、`complete`、`reopen`、`cancel(reason?)`、`trash`、`restore`。
- 仓储层额外施加两条业务约束：**依赖阻断**（被阻塞不能 start）与**WIP 上限**（超限不能 start）。
- `start` 会顺带把任务放进今天（开始做 = 就是今天做）。

## 5. 实体 Schema

```
Task
  id, title, notes(Markdown)
  phase: inbox|action|waiting|someday|trash
  status: todo|doing|done|canceled
  priority: 1|2|3|4          // 高级字段，默认 P3，默认隐藏
  effort: 1|2|3|5|8|null     // 高级字段
  dueDate                    // 世界的要求
  plannedFor                 // 我的承诺 ← 今天视图的唯一来源
  startDate, scheduledAt     // scheduledAt = 固定时刻（hard landscape）
  startedAt                  // 进入 doing 的时刻 → 「已进行 N 天」
  completedAt, canceledReason
  projectId?, areaId?, parentId?, order
  blockedBy[], repeatRule?, waitingFor?, nudgedAt
  tags[]
  history[]                  // 活动记录，上限 50
  createdAt, updatedAt

Note     id, content(md), tags[], projectId?, taskId?, createdAt, updatedAt
Project  id, name, goal?, deadline?, archived
Area     id, name, description, icon, archived
Tag      id, name
Settings maxToday=6, maxDoing=3, staleDays=7, theme, automations
```

## 6. 导航 = 生命周期的空间投影

三个分组的名字就是动线：**处理 → 库存 → 结算**（「组织」是横切的容器）。

| 分组 | 范围 | 读取规则 |
|---|---|---|
| 处理 | 收件箱 | `phase = inbox`，一次一条澄清 |
| | 今天 `N/6` | `plannedFor = today` + 逾期置顶 |
| | 进行中 `N/3` | `status = doing`，超限硬拦 |
| | 等待 | `phase = waiting`，显示已等天数 |
| 库存 | 下一步 | `phase = action, status = todo` |
| | 未来 7 天 | 承诺日或截止日落在 (今天, +7] |
| | 将来/也许 | `phase = someday` |
| 组织 | 项目 / 领域 | 容器，项目页带目标、截止、进度环 |
| | 笔记 / 习惯 | 独立实体 |
| 结算 | 周回顾 | 结算台：逼你对停滞条目做决定 |
| | 已完成日志 | 按 `completedAt` 倒序，含已取消 |

## 7. 技术架构

- **框架**：Next.js（App Router）+ TypeScript
- **UI**：React + Tailwind CSS（shadcn 语义 token + 三态主题）；图标 `lucide-react`；拖拽 `@dnd-kit`
- **状态**：Zustand（视图/过滤）+ 服务端数据层
- **数据**：文件持久层（`.data/db.json`，串行化读改写），读取时自动迁移旧数据形态
- **校验**：Zod（前后端共享）
- **快捷键**：`Cmd+K` 命令面板、`Q` 快速捕获、`Cmd+Z` 撤销、列表 `↑↓/Enter/Space/T/1-4`、澄清流 `1-5`

**分层**：`engine`（状态机 + 投影，纯函数）→ `db`（仓储 + 业务约束）→ `api` → `view`。

**核心不变量**：视图层不允许绕过引擎直接改状态；所有失败都要经 toast 说明原因。

## 8. 自动化的边界

自动化只做**机械清理**，不替用户做决定：

- ✅ 完成/取消后自动移出「今天」
- ✅ 等待停滞提醒（只发通知，不改数据）
- ❌ 不自动打优先级标记、不自动排期、不自动判断「该不该继续做」

「该不该继续做」属于周回顾的结算台——那是人的工作。

## 9. 马力：从助手到教练

马力不再只是「你问他答」。个人效率真正的难点全在**你不会开口的时刻**——连着五天推同一件事、等待挂了三周、今天排了一堆一件没动。这些时候你不会去问 AI，所以 AI 必须自己出现。

**三层管道**（`observer.ts` → `loop.ts` → `CoachBar`）：

1. **观察**（纯函数，不调 LLM）：从任务数据与活动历史里识别 11 类模式，按严重度排序。
2. **开口**（LLM，`nudge` 模式）：把最狠的那一条客观事实，用人格说成一句话。调用失败时降级到 observer 里写好的兜底文案——**兜底文案同样是他那张嘴**。
3. **呈现**：主内容区顶部一行，可「回他一句」（打开对话）、跳到那条任务、或直接关掉。

**三条红线（在 API 层强制）**：

| 红线 | 实现 |
|---|---|
| 罕见 | 没有模式成立就返回 null——大多数日子应该是 null |
| 一天最多一次 | `db.lastNudge` 按 `day` 节流；当天重复请求复用同一条，不重新生成 |
| 可关 | `settings.coachEnabled`，设置页一个开关 |

被忽略后当天彻底闭嘴。**罕见才有杀伤力**：如果它天天出现，第三天就会被无视。

**人格**：默认模板 `roaster`（损友）——聪明、毒舌、不留情面，但只攻击想法不攻击人。模板多一段 `tactics`（情绪调动策略），不开放自定义覆盖。从未自定义过的旧「战友」档案会自动升级；改过任何一段自定义指令的档案原样保留。

> 注意：`chatWithMessages` 默认走 `response_format: json_object`（结构化路径依赖它），
> 但纯文本路径**必须**传 `format: "text"`——否则模型会把一句话包进 JSON，
> 且 DeepSeek 在 json_object 模式下若 prompt 未出现 "json" 会直接返回 400。

## 10. 边界情况与失败模式

- 非法状态迁移：引擎白名单校验，返回错误并经 toast 显示原因。
- WIP 超限：`start` 被硬拦，错误信息给出解法（结掉一件或放回待办）。
- 今日超额：**不拦**，但容量条变色并明说超了多少。
- 删除 vs 归档：`trash` 软删除可恢复；转存笔记同样保留可恢复。
- 重复/循环依赖：子任务不能成为祖先；`blockedBy` 不允许成环。
- 并发：单用户，乐观更新 + 失败回滚，服务端为准。
- 旧数据：`normalizeDb` 负责迁移（`reference` → Note、`isFrog` → `plannedFor`、丢弃 `contexts`/`durationMinutes`、`autoClearFrogOnDone` → `autoClearPlanOnDone`）。
- 自然语言解析失败：回退「无日期 + 手动选」，不阻塞捕获。

## 10. 测试与验收

- 单元：状态机所有合法/非法迁移、容量计算、停滞检测、结算台聚合、日期解析、数据迁移。
- 集成：CRUD、澄清流转、WIP 硬拦、笔记转化、承诺日校验。
- 验收清单：3 秒捕获、收件箱可清空、今日有容量约束、在制有硬上限、每条任务都能走到终局、周回顾能把停滞项清零。
