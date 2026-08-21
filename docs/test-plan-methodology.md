# 工作流方法论全面测试方案

> 本文档为任务计划网站的**每一个工作流方法论**设计测试方法：每个方法论给出「核心不变量 → 用例表（输入 → 预期输出）→ 测试层级映射」。所有自动化测试必须逐条完全匹配预期；UI 交互类用例标注为手工回归清单。运行方式：`npm run test` / `npm run lint` / `npm run typecheck` / `npm run build`。

## 0. 测试分层与方法

| 层级 | 手段 | 文件位置 |
|---|---|---|
| 单元（纯函数） | vitest，确定性输入 | `src/lib/**/*.test.ts(x)` |
| 集成（存储/迁移） | 临时 `DATA_DIR` + `__resetStore` | `src/lib/db/store.test.ts` |
| 端到端（路由） | 直接调用 Next 路由 handler + mock fetch | `src/app/api/api.test.ts` |
| 客户端（状态机/计时） | fake timers、mock fetch、zustand `getState` | `src/store/*.test.ts` |
| 手工回归（UI 交互） | 验收清单 | 见各节「手工」 |

---

## 1. GTD（捕获 → 澄清 → 组织 → 反思 → 执行）

**不变量**
- G1 捕获永远可用：无日期输入不阻塞捕获，标题原样保留。
- G2 澄清只允许从收件箱（或回收站）发生；澄清为 action 后 `status=todo`。
- G3 视图一致性：同一任务在「今天/下一步/收件箱/未来 7 天」出现与否由投影规则唯一决定（dueDate/startDate/scheduledAt/isFrog/phase/status）。
- G4 周回顾草稿持久化，切走视图不丢；完成回顾后草稿清空。
- G5 同时最多一只青蛙（硬约束）。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| G1.1 | 自然语言日期解析 | 「明天 下午3点 开会」 | date=明天, time=15:00, remainder=开会 |
| G1.2 | 无日期捕获 | 「写一篇博客」 | matched=false, remainder 原样 |
| G1.3 | 批量捕获拆分 | 多行+空行 | 去空行、trim |
| G2.1 | 澄清到行动/等待/将来/参考 | inbox + clarify | phase 正确、action 时 status=todo |
| G2.2 | 非法澄清 | action + clarify | 拒绝（只有收件箱可澄清） |
| G3.1 | 今日投影 | dueDate/startDate/scheduledAt 今天、isFrog | 全部进入 selectToday |
| G3.2 | 逾期置顶 | 逾期 3 天 vs 逾期 1 天 vs 今天 | 顺序：逾期3天 → 逾期1天 → 今天（青蛙优先组内） |
| G3.3 | 未来 7 天投影 | due/scheduled 在 [今天, 今天+7] | 进入 selectUpcoming，按日期升序；第 8 天与超期排除 |
| G3.4 | 下一步/等待/将来/收件箱投影 | 混合任务 | 各清单精确过滤 |
| G4.1 | 草稿持久化 | 保存 checklist/notes → 重读 | 内容一致 |
| G4.2 | 完成回顾 | createWeeklyReview | 新增记录且草稿清空 |
| G4.3 | 触发判断 | 从未回顾 / 6 天前 / 8 天前 | needsWeeklyReview = true / false / true |
| G5.1 | 青蛙约束 | 已有青蛙 + 设第二只 | 拒绝 INVALID_FROG，错误含已有青蛙标题 |
| G5.2 | 替换流程 | 取消旧青蛙 → 设新青蛙 | 成功 |

**层级映射**：G1/G3 → `naturalDate.test` `capture.test` `selectors.test`；G2/G5 → `stateMachine.test` `store.test`；G4 → `store.test`（新增）；周回顾触发卡片、上下文分组 → 手工。

---

## 2. 看板 Kanban

**不变量**
- K1 看板是 `status` 的投影：列 = todo/doing/done/canceled，只含 action 任务。
- K2 范围隔离：看板只显示当前 scope（今天/未来 7 天/项目/领域）内的任务。
- K3 列间移动走状态机 `setStatus`；非 action 任务拒绝。
- K4 WIP 上限来自设置，数据不写入任务本身。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| K1.1 | 列投影与排序 | 混合 status 的 action 任务 | 4 列、组内 priority→order 升序、wip 取自 settings |
| K2.1 | 项目范围看板 | scopeSource(project:X) | 只含该项目 action 任务（含已完成入 done 列） |
| K2.2 | 领域范围看板 | scopeSource(area:X) | 只含该领域 action 任务 |
| K3.1 | setStatus 到 done | action 任务 | done + completedAt 写入 |
| K3.2 | setStatus 回 todo | done 任务 | completedAt 清空 |
| K3.3 | 非 action setStatus | inbox 任务 | 拒绝 |
| K4.1 | WIP 设置 | PATCH settings kanbanWip | 返回更新后 settings，selectKanban wip 反映 |

**层级映射**：K1-K3 → `selectors.test` `stateMachine.test`（新增 K2）；K4 → `api.test`；拖拽手感、WIP 警示视觉 → 手工。

---

## 3. 四象限 Eisenhower

**不变量**
- M1 重要 = priority≤2；紧急 = 截止日期距今 ≤7 天（含超期）。
- M2 已完成/已取消任务不参与象限。
- M3 四象限是「当前范围」的投影（有边界才有决策价值）。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| M1.1 | 边界 | due 第 7 天 / 第 8 天 | 紧急 / 不紧急 |
| M1.2 | 超期即紧急 | due 昨天 | 紧急 |
| M1.3 | 重要判断 | priority 1/2/3/4 | 前二重要、后二不重要 |
| M2.1 | 完成排除 | done + 今天到期 | 不入任何象限 |
| M3.1 | 范围投影 | selectMatrix(scopeSource(project:X)) | 只落位该项目任务 |

**层级映射**：`selectors.test`（新增 M3）；象限配色/落位视觉 → 手工。

---

## 4. PARA（项目/领域/资源/归档）

**不变量**
- P1 项目=有截止的行动容器；领域=长期责任；归档=已完成/已归档。
- P2 项目删除/归档不产生孤儿任务引用。
- P3 已完成日志按 completedAt 倒序。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| P1.1 | 项目范围任务 | tasksForScope(project:X) | 只含该项目未完成任务 |
| P2.1 | 删除项目解绑 | deleteProject | 项目移除、任务 projectId=null |
| P2.2 | 删除领域解绑 | deleteArea | 任务 areaId=null |
| P3.1 | 日志排序 | 不同 completedAt 的 done 任务 | selectLog 倒序 |
| P3.2 | 归档项目排除 | archived 项目 | 不计入无行动项目统计 |

**层级映射**：`selectors.test` `store.test`；进度环、重命名 → 手工。

---

## 5. 时间块 Time Blocking

**不变量**
- T1 块高度 = durationMinutes 比例；时长合法域 [15, 480]。
- T2 排期落在时段内；时段外任务进溢出区；dueDate=当天且未排期进全天区。
- T3 智能排期建议：确定性（同输入同输出）、避开已占用槽位、每天上限。
- T4 迁移：旧数据无 durationMinutes 时默认 30。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| T1.1 | 模型默认 | createTask() | durationMinutes=30 |
| T1.2 | 校验边界 | PATCH durationMinutes=5 / 480 / 999 | 400 / 200 / 400 |
| T2.1 | 建议排序 | 不同优先级/努力值 | 按 优先级↑ 努力值↓ 分配 |
| T2.2 | 避让占用 | 已排期 09:00 | 建议跳过 09:00 |
| T2.3 | 每天上限 | maxPerDay=1、5 个任务 | 分布 5 天 |
| T3.1 | AI 建议降级 | 未配置 Key / 非法输出 | source=heuristic |
| T4.1 | 迁移 | 旧 db 任务无 durationMinutes | normalizeDb 后 =30 |

**层级映射**：T1/T4 → `store.test` `api.test`（新增）；T2/T3 → `scheduler.test` `planner.test`；红线/拖拽/把手 → 手工。

---

## 6. 习惯追踪 Atomic Habits

**不变量**
- H1 打卡切换幂等：同一天重复切换在 true/false 间往返。
- H2 删除习惯连带清理打卡记录。
- H3 检索统计基于最近 7 天。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| H1.1 | 打卡/取消 | toggle 两次 | checked true → false，记录数 1 → 0 |
| H1.2 | 未知习惯 | toggle 不存在 id | null（API 404） |
| H2.1 | 删除清理 | 打卡后删除习惯 | habits 与 checks 均空 |
| H3.1 | 上下文注入 | 近 7 天打卡 2 次 | buildAgentContext 显示「阅读 2/7」 |

**层级映射**：`store.test` `api.test` `context.test`；streak 连续天数（未实现，评审遗留项）→ 标注待实现后补测。

---

## 7. 自动化规则引擎

**不变量**
- A1 幂等：已应用的修改不重复应用。
- A2 默认关闭「自动标青蛙」（不惊扰存量数据）。
- A3 规则只产出补丁与通知，由存储层落地。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| A1.1 | 超期标青蛙（开启） | 超期未标记 | 补丁 isFrog=true + 通知；再跑 applied=0 |
| A1.2 | 默认关闭 | 超期未标记 | 无补丁 |
| A2.1 | 完成清除青蛙 | done + isFrog | 补丁 isFrog=false |
| A3.1 | 等待超时提醒 | waiting 创建 >7 天（开启） | 通知含标题 |
| A3.2 | 规则关闭 | 同上（关闭） | 无通知 |

**层级映射**：`automations.test` `store.test` `api.test`。

---

## 8. 番茄计时器

**不变量**
- P1 start/reset 重置 cycles；skip 在 focus/break 间切换并累计。
- P2 pause 后秒数不再变化。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| P1.1 | 启动 | start() | running/focus/1500/cycles=0 |
| P1.2 | 计时 | 前进 1s | 1499 |
| P2.1 | 暂停 | pause 后前进 5s | 秒数不变 |
| P1.3 | 专注结束 | 前进 25 分钟 | break/cycles=1/300 |
| P1.4 | 跳过/重置 | skip×2、reset | 模式切换、回到 idle 且 cycles=0 |

**层级映射**：`usePomodoro.test`（fake timers）；dock 显隐、抽屉遮挡 → 手工。

---

## 9. 马力 AI 助手

**不变量**
- M1 人格分层：模板 + 自定义合并，底线规则（JSON 输出、HITL 声明）不可覆盖。
- M2 HITL：模型只产出建议，写入必须走现有状态机 API。
- M3 容错：未配置 Key / 非法输出 / 服务失败 → 降级或友好错误。
- M4 记忆分层：摘要滚动窗口（>16 条触发）、事实提炼去重、检索注入。

**用例表**

| # | 用例 | 输入 | 预期输出 |
|---|---|---|---|
| M1.1 | 人格组装 | 模板+自定义 | 自定义在模板后、BASE_RULES 始终在最后 |
| M1.2 | reply 模式 | assemble(reply) | 无工具段、要求纯文本 |
| M2.1 | 建议校验 | 合法/非法 tool+args | 保留/丢弃；未知工具拒绝 |
| M2.2 | 建议执行 | executeProposalTool(create_task) | 走 store.addTask → 任务入库 |
| M2.3 | 状态机错误回显 | 依赖未完成时 start | 错误含任务标题 |
| M3.1 | 未配置 Key | runAgentTurn | 抛「未配置 AI_API_KEY」 |
| M3.2 | 流式降级 | 上游 500 | 抛 HTTP 500；schedule 回 heuristic |
| M4.1 | 摘要窗口 | 20 条消息 | keep=8、toSummarize=12 |
| M4.2 | 事实提炼 | 含日期事实 | 过滤掉；新事实保留、去重 |
| M4.3 | SSE 全链路 | 路由 + mock 流 | token 事件 → done 事件含建议卡片 |

**层级映射**：`persona/context/tools/memory/loop/summary/facts/planner` 单测 + `api.test` SSE 路由 + `execute.test`（新增）；流式停止、修改后执行 → 手工。

---

## 10. 横切关注点

| 关注点 | 用例 | 层级 |
|---|---|---|
| 撤销/Toast | show/dismiss 5s、toastWithUndo 注册与触发、completedFx 1.6s 过期 | `useToast.test`（新增） |
| 主题三态 | nextTheme 循环 system→light→dark | `theme.test`（新增） |
| 到期提醒 | 纯函数 reminderMessages：今天到期/逾期、会话去重、未授权返回空 | `reminders.test`（新增，需纯函数化） |
| 数据导出 | /api/export json/csv/md 内容与头、未知格式 400 | `api.test`（新增） |
| 活动历史 | 完成/改优先级等追加 history，上限 50 | `store.test`（新增） |
| 设置时段 | PATCH dayStartHour/dayEndHour 边界 | `api.test`（新增） |
| 视图一致性回归 | selectToday 与时间块排期、逾期置顶 | `selectors.test` |

---

## 11. 验收标准

1. `npm run test` 全绿、无跳过（本方案落地后 266 用例，全部通过）。
2. `npm run lint` / `npm run typecheck` / `npm run build` 通过；CI 自动运行。
3. 手工回归清单（各节标注「手工」项）在每批发布前人工过一遍。

> 视图入口变更：显示模式切换按钮（列表/看板/四象限/时间块）已移除，任务范围固定为列表视图；看板/四象限/时间块的选择器、调度器与状态机代码及测试保留，仅不再暴露 UI 入口。收件箱澄清改为拖拽到澄清桶（`clarifyDrop`）。

## 12. 已知未实现（评审遗留，补实现后需补测）

- 习惯 streak（连续天数）与月视图。
- 看板列自定义。
- 任务到期的服务端推送（当前仅客户端加载时提醒）。
- 搜索全局化（当前仅列表视图与命令面板）。
