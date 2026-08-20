# 产品与技术方案（Product & Technical Spec）

> 本文档是任务计划网站的实现真相源。方法论依据见 `methodology-research.md`。

## 1. 产品定位

**一句话**：一个「方法无关（methodology-agnostic）」的任务引擎 + 多种工作流视图的个人任务计划网站。

- **目标用户**：个人使用优先（MVP 单用户，团队能力后置）。
- **方法论组织**：多方法论可切换——GTD / 看板 / 四象限 / PARA / 时间块 是同一套任务引擎的不同视图与规则。
- **首版范围**：核心任务管理 MVP（捕获、澄清、组织、排期、执行、反思 + 多视图）。

## 2. 设计原则（来自研究，共 8 条）

1. 外化优先：3 秒捕获，收件箱永远可清空。
2. 状态机统一：一个显式状态机服务所有方法论，视图只是投影。
3. 可视化 + WIP 限制。
4. 重要 vs 紧急分离。
5. 有限聚焦：今日视图青蛙优先。
6. 节奏与反思：周回顾 + 数据驱动。
7. 项目=行动容器，领域=长期责任。
8. 结果可度量：项目可挂 OKR。

## 3. 核心概念

| 概念 | 定义 | 对应方法论 |
|---|---|---|
| 收件箱 Inbox | 唯一捕获入口，所有念头先落这里 | GTD / Inbox Zero |
| 任务 Task | 最小原子单元，带状态机 + 属性 | GTD / Kanban |
| 项目 Project | 有明确目标/截止的行动容器 | PARA / GTD |
| 领域 Area | 长期责任/持续维护，如「健康」「财务」 | PARA |
| 标签/上下文 Tag/Context | @context 与自由标签统一 | GTD |
| 工作流模式 Mode | 可切换的视图+规则组合 | 全部 |
| 周回顾 Weekly Review | 引导式反思流程 | GTD / Scrum |

## 4. 领域模型与状态机（技术心脏）

### 4.1 统一状态机（两维正交）

- **澄清阶段 `phase`**（GTD 澄清结果）：`inbox` → `action` / `waiting` / `someday` / `reference` / `trash`
- **执行状态 `status`**（看板列）：`todo` → `doing` → `done`（+ `canceled`）

**关键设计**：GTD 的「下一步行动」= `phase:action, status:todo`；看板的「列」= `status` 投影；四象限 = `action` 类任务按 `priority × effort` 投影。一个数据模型，多套视图，状态不重复存储。

### 4.2 状态机引擎（纯函数）

`nextState(task, event) -> Task`，是**唯一**的状态转换真相源。非法迁移返回错误而非静默。

- 事件：`clarify`（收件箱澄清）、`start`（开始）、`complete`、`reopen`、`defer`（推迟到某日）、`wait`（标记等待）、`someday`（将来也许）、`reference`（转为资料）、`trash`、`restore`。

## 5. 实体 Schema（草案）

```
Task
  id, title, notes(Markdown)
  phase: inbox|action|waiting|someday|reference|trash
  status: todo|doing|done|canceled
  priority: 1|2|3|4          // P1 最高
  effort: 1|2|3|5|8          // 斐波那契
  dueDate, startDate, scheduledAt, completedAt
  projectId?, areaId?, parentId?, order
  tags[], contexts[]
  isFrog: bool
  createdAt, updatedAt

Project  id, name, goal?, deadline, mode, archived
Area     id, name, description, icon, archived
Tag      id, name, kind: tag|context
```

## 6. 方法论视图 ↔ 数据映射

| 视图 | 读取规则 |
|---|---|
| 收件箱 | `phase = inbox` |
| 下一步行动 | `phase = action, status = todo`，按 context 分组 |
| 看板 | `status` 列（todo/doing/done），支持 WIP 上限 |
| 四象限 | `phase = action` 未完成，按 优先级(重要) × 截止(紧急) 落 4 象限 |
| 今日/聚焦 | 今日到期 + 手动置顶 + 青蛙标记，默认「青蛙优先」 |
| PARA | 任务按 Project / Area / Resource(=tag) 树形组织 |
| 周回顾 | 引导清单 + 统计（滞留>7天、超期、无下一步行动的项目） |

## 7. 技术架构

- **框架**：Next.js（App Router）+ TypeScript
- **UI**：React + Tailwind CSS；拖拽用 `@dnd-kit`
- **状态**：Zustand（视图/过滤）+ 服务端数据层
- **数据**：MVP 用轻量持久层（文件/SQLite），保留迁移到 PostgreSQL 的空间
- **校验**：Zod（前后端共享）
- **快捷键/命令面板**：自建 Command-K 风格捕获条

**分层**：`engine`（状态机纯函数）→ `repository`（CRUD）→ `api`（路由）→ `view`（各方法论视图只消费引擎投影）→ `capture`（快速输入）。

**核心不变量**：视图层不允许绕过引擎直接改状态。

## 8. 分阶段实施

- **阶段 0**：文档落盘 + 脚手架 + 工程规范。
- **阶段 1（MVP）**：状态机引擎、数据模型、极速捕获、五类视图、项目/领域/标签、优先级排序、搜索过滤、周回顾、快捷键。
- **阶段 2**：PARA 树视图、时间块/日历、番茄、重复任务、依赖/Waiting 流转。
- **阶段 3**：自动化、习惯追踪、AI 辅助、多端同步/团队协作。

## 9. 边界情况与失败模式

- 非法状态迁移：引擎白名单校验，返回错误。
- 删除 vs 归档：`trash` 软删除可恢复，`reference` 保留资料。
- 重复/循环依赖：子任务不能成为祖先；`blockedBy` 不允许成环。
- 并发：MVP 单用户，乐观更新 + 失败回滚，服务端为准。
- 时区：时间存 UTC，展示按用户时区。
- 收件箱堆积：周回顾统计「滞留>7天」。
- 看板 WIP 超限：拖入超限列给出警示。
- 自然语言解析失败：回退「无日期 + 手动选」，不阻塞捕获。

## 10. 测试与验收

- 单元：状态机所有合法/非法迁移、四象限落位、日期解析。
- 集成：CRUD、澄清流转、五视图投影一致性。
- E2E：捕获 → 澄清 → 入项目 → 看板拖到 doing → 完成 → 周回顾统计。
- 验收清单：3 秒捕获、5 视图一致切换、完整生命周期、周回顾可用、搜索+快捷键。
