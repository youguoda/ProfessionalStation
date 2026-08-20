# 测试方案与用例规范

> 本文档定义任务计划网站的严谨测试方案。所有测试用例都给出**明确输入与预期输出**，自动化测试必须**逐条完全匹配**预期才视为通过。

## 1. 目标与范围

- **目标**：对现有全部功能做可重复、确定性的自动化测试，杜绝「交互逻辑缺陷」。
- **覆盖功能**：
  1. 状态机引擎（phase/status 迁移）
  2. 自然语言日期/时间解析
  3. 重复任务规则
  4. 视图投影（收件箱/下一步/看板/四象限/今日/超期/周回顾统计）
  5. 依赖判断（`isBlocked`）
  6. 存储层（持久化、重复生成、依赖阻断、软硬删除、标签去重、设置）
  7. API 路由（校验、状态机、重复、依赖、bootstrap）
  8. 番茄计时器（计时、暂停、切换、跳过）

## 2. 测试分层

| 层级 | 文件 | 手段 |
|---|---|---|
| 单元 | `src/lib/engine/stateMachine.test.ts` 等 | vitest（纯函数，确定性输入） |
| 集成 | `src/lib/db/store.test.ts` | 临时 `DATA_DIR` + `__resetStore()` 隔离 |
| 端到端 | `src/app/api/api.test.ts` | 直接调用 Next.js 路由 handler，断言 `Response` 状态码与 JSON |
| 客户端 | `src/store/usePomodoro.test.ts` | vitest fake timers |

## 3. 运行方式

```bash
npm run test       # vitest run（全量，含上述 4 层）
npm run typecheck  # tsc --noEmit
npm run build      # 生产构建
```

---

## 4. 用例与预期输出

### 4.1 状态机引擎 `transition(task, event)`

前置：`createTask()` 默认 `phase=inbox, status=todo, priority=3, effort=null, completedAt=null, blockedBy=[], repeatRule=null, waitingFor=null`。

| # | 前置任务 | 事件 | 预期输出 |
|---|---|---|---|
| 1 | inbox | clarify→action | ok，`phase=action, status=todo` |
| 2 | inbox | clarify→waiting/someday/reference | ok，`phase` 为对应值 |
| 3 | action | clarify | 失败（只有收件箱可澄清） |
| 4 | action(todo) | start | ok，`status=doing` |
| 5 | waiting | start | 失败（非 action） |
| 6 | action(doing) | complete | ok，`status=done, completedAt≠null` |
| 7 | waiting | complete | ok，`status=done` |
| 8 | reference | complete | 失败 |
| 9 | action(done) | complete | 失败（已完成） |
| 10 | action(done) | reopen | ok，`status=todo, completedAt=null` |
| 11 | action(todo/doing) | cancel | ok，`status=canceled` |
| 12 | action(done) | cancel | 失败 |
| 13 | action | setStatus→done | ok，`status=done, completedAt≠null` |
| 14 | action(done) | setStatus→todo | ok，`completedAt=null` |
| 15 | inbox | setStatus | 失败（非 action） |
| 16 | action | trash | ok，`phase=trash` |
| 17 | trash | trash | 失败 |
| 18 | trash | restore | ok，`phase=inbox, status=todo` |
| 19 | inbox→clarify action→start→complete | transitionMany | ok，`status=done` |
| 20 | inbox→start | transitionMany | 失败（中途停止） |

### 4.2 自然语言日期解析 `parseNaturalDate(input, now=2025-01-08 周三)`

| 输入 | 预期 date | 预期 time | 预期 remainder |
|---|---|---|---|
| 今天 开会 | 2025-01-08 | null | 开会 |
| 明天 开会 | 2025-01-09 | null | 开会 |
| 后天 开会 | 2025-01-10 | null | 开会 |
| 大后天 开会 | 2025-01-11 | null | 开会 |
| 昨天 开会 | 2025-01-07 | null | 开会 |
| 前天 开会 | 2025-01-06 | null | 开会 |
| 3天后 交报告 | 2025-01-11 | null | 交报告 |
| 下午3点 开会 | null | 15:00 | 开会 |
| 上午9点半 复盘 | null | 09:30 | 复盘 |
| 中午12点 午饭 | null | 12:00 | 午饭 |
| 晚上8点 运动 | null | 20:00 | 运动 |
| 15:30 站会 | null | 15:30 | 站会 |
| call 3pm | null | 15:00 | call |
| pay bill tomorrow | 2025-01-09 | null | pay bill |
| submit in 2 days | 2025-01-10 | null | submit |
| 周一 复盘 | 2025-01-13 | null | 复盘 |
| 周五 周报 | 2025-01-10 | null | 周报 |
| 下周三 会议 | 2025-01-15 | null | 会议 |
| 下周 计划 | 2025-01-13 | null | 计划 |
| 2025-01-20 发布 | 2025-01-20 | null | 发布 |
| 写一篇博客 | null | null | 写一篇博客（matched=false） |

### 4.3 重复规则 `nextDueDate(rule, from)`

| rule | from | 预期 |
|---|---|---|
| daily | 2025-01-15 | 2025-01-16 |
| weekly | 2025-01-15 | 2025-01-22 |
| monthly | 2025-01-15 | 2025-02-15 |
| monthly | 2025-01-31 | 2025-02-28（月末钳制） |
| every:3:days | 2025-01-15 | 2025-01-18 |
| null | 2025-01-15 | null |

### 4.4 视图投影 `selectors`（now=2025-01-08）

- `selectInbox/selectNextActions/selectWaiting/selectSomeday/selectTrash`：按 `phase`（与 status）精确过滤。
- `selectKanban`：返回 `[todo,doing,done,canceled]` 4 列，任务按 `priority→order` 升序，`wip` 取自 settings。
- `quadrantOf`：重要=priority≤2，紧急=dueDate 距今≤7 天（含超期）。
  - 重要+紧急→q1；重要不紧急→q2；不重要紧急→q3；其余→q4。
- `selectToday`：`dueDate==今天 或 startDate==今天 或 isFrog`，排序青蛙优先→priority→order。
- `selectOverdue`：`dueDate < 今天` 且未完成。
- `selectReviewStats`：`inboxStale`（收件箱滞留>7天）、`overdue`、`projectsWithoutAction`、`waitingCount`、`total`。
- `isBlocked`：存在依赖且依赖未完成（未 done/未 canceled/未 trash）→ true；依赖缺失→ false。
- 排序：`byOrderThenPriority`（priority 升序，再 order 升序）、`byFrogThenPriority`（青蛙优先）。

### 4.5 存储层 `store`（临时目录隔离）

| 用例 | 预期 |
|---|---|
| createTask 两次 | 两条任务，`order` 依次为 0、1；`listTasks` 长度 2 |
| updateTask(title) | 返回合并后任务，`id/createdAt` 不变，`updatedAt` 更新 |
| 完成带 repeatRule=daily 的任务 | 返回 done；`listTasks` 多一条：`phase=action,status=todo,dueDate=+1天,repeatRule 保留` |
| start 被 blockedBy 阻塞的任务 | 返回 `{ok:false, error:"存在未完成的依赖任务，无法开始"}` |
| 依赖完成后 start | 返回 ok，`status=doing` |
| deleteTask（非 trash） | 软删除 → `phase=trash`（仍在列表中） |
| deleteTask（已 trash） | 硬删除 → 从列表移除 |
| getOrCreateTag 同名同 kind | 返回同一个 id（去重） |
| deleteProject | 项目移除，且其下任务的 `projectId` 置 null |
| updateSettings | 返回更新后的 settings |

### 4.6 API 路由（直接调用 handler）

| 用例 | 预期 |
|---|---|
| POST /api/tasks `{}` | 400（标题不能为空） |
| POST /api/tasks 合法 | 201，返回完整 task，`phase=inbox` |
| PATCH /api/tasks/[id] 未知 id | 404 |
| POST transition clarify→action | 200，`phase=action` |
| POST transition complete（reference） | 409 |
| POST transition start（被依赖阻塞） | 409，错误信息精确匹配 |
| POST transition complete（repeatRule） | 200 done；bootstrap 中出现新实例 |
| POST /api/projects `{name:""}` | 400 |
| POST /api/areas、/api/tags 合法 | 201 |
| GET /api/bootstrap | 返回含 `tasks/projects/areas/tags/weeklyReviews/settings` 的对象 |

### 4.7 番茄计时器 `usePomodoro`（fake timers）

| 用例 | 预期 |
|---|---|
| start() | `status=running, mode=focus, secondsLeft=1500, cycles=0` |
| 前进 1s | `secondsLeft=1499` |
| pause() 后再前进 | `secondsLeft` 不变、`status=paused` |
| resume() | `status=running` |
| 前进 25 分钟整 | `mode=break, cycles=1, secondsLeft=300` |
| skip() | focus→break，`secondsLeft=300`；break→focus，`secondsLeft=1500` |
| reset() | `status=idle, mode=focus, secondsLeft=1500, focusTaskId=null` |

---

## 5. 验收标准

1. `npm run test` 全部通过、0 失败、无跳过。
2. `npm run typecheck` 无错误。
3. `npm run build` 成功。
4. 每个断言均基于本文档的预期输出，不做「模糊匹配」。

## 6. 测试暴露并修复的缺陷

1. **自然语言「下周三」解析错误**：原实现把「下周三」拆成「下周」+「三」，导致落到下周一；重写「下 + 周几」的匹配，`(target+6)%7`（周一=0）后「下周三」正确落在下周三。
2. **四象限「紧急」边界错误**：`daysUntil` 原用截止日 `23:59:59` 与当日 `00:00` 相减，导致「第 7 天」被判为不紧急；改为日期级比较后，第 7 天正确判为紧急、第 8 天不紧急。
3. **番茄计时器 `cycles` 未复位**：`start()` / `reset()` 未把专注周期计数清零，导致跨会话累计；已修复为每次 `start`/`reset` 归零。
