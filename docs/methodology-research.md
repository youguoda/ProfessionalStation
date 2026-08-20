# 方法论研究与设计逻辑综合

> 本文档是本任务计划网站的方法论知识库与设计逻辑来源。它汇总了世界范围内关于**工作流、任务管理、物流效率、效率流**以及**知名大师**的核心理念，并收敛为可落地的产品设计原则。所有结论服务于 `product-spec.md` 中的产品与技术方案。

## 目录

1. [研究范围](#研究范围)
2. [任务 / 工作流方法论](#任务--工作流方法论)
3. [物流与效率流](#物流与效率流)
4. [流程引擎与自动化](#流程引擎与自动化)
5. [优先级与排序框架](#优先级与排序框架)
6. [收敛出的 8 条产品设计原则](#收敛出的-8-条产品设计原则)

---

## 研究范围

- **工作流（Workflow）**：GTD、看板、Scrum、BPM、工作流引擎。
- **任务（Task）**：任务捕获、澄清、组织、排期、执行、反思的完整生命周期。
- **物流（Logistics）**：丰田生产方式、精益、六西格玛、约束理论。
- **效率流（Efficiency Flow）**：心流、深度工作、时间块、番茄、原子习惯。
- **知名大师**：David Allen、Merlin Mann、David Anderson、Tiago Forte、Cal Newport、James Clear、Mihaly Csikszentmihalyi、大野耐一、Goldratt、John Doerr 等。

---

## 任务 / 工作流方法论

### 1. David Allen — GTD（Getting Things Done）

- **来源**：[What is GTD?](https://dev.gettingthingsdone.com/2010/02/what-is-gtd/)
- **核心理念**：大脑用于**思考**，而不是用于**记忆**。把所有未竟之事外化到一个可信系统，从而让大脑放空（「心若止水 / mind like water」）。
- **五步法**：
  1. **捕获 Capture**：任何念头立即记下，放入收件箱。
  2. **澄清 Clarify**：逐条问「这是什么？可行动吗？下一步行动是什么？」
  3. **组织 Organize**：放入项目、清单、上下文、日历。
  4. **反思 Reflect**：定期回顾（重点是「周回顾」）。
  5. **执行 Engage**：基于上下文、精力、优先级选择行动。
- **关键设计**：收件箱、**2 分钟法则**（2 分钟内能完成就立即做）、下一步行动（Next Action）、上下文（@home/@errand）、项目 vs 下一步行动、周回顾。
- **设计逻辑（对本产品的启示）**：**外化 + 可信系统**。只有用户信任系统不丢任务，大脑才会放空。产品必须提供 3 秒内完成的极速捕获，以及永远不会「卡住」的澄清流转。

### 2. Merlin Mann — Inbox Zero（收件箱归零）

- **来源**：[Inbox Zero](https://sparkmailapp.com/glossary/inbox-zero)、[Todoist 对 Inbox Zero 的解读](https://www.todoist.com/cs/inspiration/inbox-zero)
- **核心理念**：收件箱是**别人给你安排的任务清单**，不是存储空间。收件箱是「经过地」而不是「目的地」。
- **处理动作 DRDDD**：Delete（删）/ Delegate（委派）/ Respond（回复）/ Defer（推迟）/ Do（立即做）。
- **设计逻辑**：收件箱必须能被清空，逐条澄清而非堆积。产品要提供「清空收件箱」的引导与统计（滞留时长）。

### 3. David Anderson / 丰田 — Kanban（看板）

- **来源**：[Kanban vs Scrum（Atlassian）](https://wac-cdn-a.atlassian.com/agile/kanban/kanban-vs-scrum)
- **核心理念**：**可视化工作流、限制在制品（WIP）、拉动系统、管理流动、持续改进**。
- **关键设计**：看板列（待办/进行中/完成）、每列 WIP 上限、拖动卡片即改变状态。
- **设计逻辑**：WIP 限制暴露瓶颈、减少多任务切换、提高吞吐。产品看板视图必须有每列 WIP 上限与拖动交互。

### 4. Scrum / Agile（敏捷）

- **来源**：[Agile Frameworks: Scrum, Kanban, XP（OpenOK）](https://open.ocolearnok.org/businessprojectmanagement/chapter/chapter-34-agile-frameworks-scrum-kanban-xp-and-more/)
- **核心理念**：冲刺（Sprint）、产品待办（Backlog）、冲刺回顾（Retrospective）、燃尽图。
- **设计逻辑**：短期可承诺目标 + 定期回顾。产品可给项目设「本轮冲刺」范围，并提供回顾模板。

### 5. Eisenhower — 四象限矩阵

- **核心理念**：重要/紧急 2×2 矩阵：**做 / 排期 / 委派 / 删除**。
- **设计逻辑**：**区分重要与紧急**，把时间投入「重要不紧急」。产品依据 `优先级 × 截止日期` 自动把任务落入四个象限。

### 6. Brian Tracy — Eat That Frog / Ivy Lee 方法

- **来源**：[Timeboxing（Thrive / University of Arizona）](https://thrive.arizona.edu/news/tame-time-timeboxing)
- **核心理念**：每天先做最难的「青蛙」；Ivy Lee 方法要求每天只列 6 件最重要的事并按优先级顺序执行。
- **设计逻辑**：**有限优先级清单 + 一次一件**。今日视图默认「青蛙优先」排序，聚焦单一任务。

### 7. Francesco Cirillo — 番茄工作法（Pomodoro）

- **核心理念**：25 分钟专注 + 5 分钟休息的循环。
- **设计逻辑**：时间盒子降低启动阻力。产品内置番茄计时器挂接到单任务（后置）。

### 8. Tiago Forte — PARA / Building a Second Brain

- **来源**：[PARA Method](https://technology.inquirer.net/136015/para-method-organize-your-digital-life-with-this-trick)、[Building a Second Brain Review](https://www.taskade.com/blog/building-a-second-brain-review)
- **核心理念**：
  - **PARA**：Projects（项目，有截止）/ Areas（领域，长期责任）/ Resources（资源，兴趣参考）/ Archives（归档）。
  - **CODE**：Capture → Organize → Distill → Express。
- **设计逻辑**：**项目 = 有目标的行动容器，领域 = 长期责任**。产品数据模型用 `Project / Area` 双轨组织，与 GTD 互补统一。

### 9. Cal Newport — Deep Work / 时间块

- **核心理念**：深度工作 vs 浅层工作；用「时间块（Time Blocking）」给每段时间分配任务。
- **设计逻辑**：注意力是稀缺资源，为重要工作预留不被中断的时间块。产品提供日历/时间块视图，把任务拖进时间段。

### 10. James Clear — Atomic Habits（原子习惯）

- **核心理念**：**系统 > 目标**；每天 1% 的改进；习惯循环（提示-渴望-反应-奖励）。
- **设计逻辑**：身份导向的持续系统，而非一次性的目标冲刺。产品强调「系统化日常」与习惯追踪（后置）。

### 11. Mihaly Csikszentmihalyi — 心流 Flow

- **来源**：[Flow is the Antidote（Claremont）](https://www.cgu.edu/news/2026/05/flow-is-the-antidote/)、[Atlassian 对心流的解读](https://www.atlassian.com/blog/innovation/brain-flow-state)
- **核心理念**：当挑战与技能匹配时进入沉浸状态。
- **设计逻辑**：清晰目标 + 即时反馈 + 适度挑战 + 少打断。产品通过即时反馈、单任务聚焦来呵护心流。

### 12. John Doerr / Andy Grove — OKR；SMART 目标

- **来源**：[What is OKR?](https://blog.weekdone.com/okr-definition/)、[How Google and Others Succeed with OKRs](https://www.entrepreneur.com/growing-a-business/how-google-and-others-succeed-with-okrs/278777)
- **核心理念**：目标（Objective）+ 可度量的关键结果（Key Results）；SMART 目标（具体/可度量/可达成/相关/有时限）。
- **设计逻辑**：结果可度量、目标对齐。产品项目可挂「目标/关键结果」，从任务跃迁到结果。

---

## 物流与效率流

### 13. 丰田生产方式 TPS（大野耐一）

- **来源**：[Toyota Production System（丰田官方）](https://global.toyota/en/company/vision-and-philosophy/production-system/)
- **核心理念**：准时制（JIT）、看板拉动、自働化（Jidoka）、持续改善（Kaizen）、消除 7 大浪费（过量生产/等待/运输/过度加工/库存/动作/缺陷）。
- **设计逻辑**：**拉动式流动 + 消除瓶颈/浪费**。任务系统应是「拉动」而非堆压，聚焦消除流程浪费（多任务切换、等待、库存堆积）。

### 14. Lean / Six Sigma（精益 / 六西格玛）

- **来源**：[Six Sigma in Last Mile Delivery](https://sixsigmadsi.com/six-sigma-in-last-mile-delivery/)
- **核心理念**：DMAIC（定义-测量-分析-改进-控制），用数据量化缺陷与浪费再改进。
- **设计逻辑**：**数据驱动的持续改进**。产品统计「任务滞留时长」「超期率」，辅助周回顾识别卡住的任务。

### 15. Eliyahu Goldratt — 约束理论（TOC）

- **核心理念**：鼓-缓冲-绳（Drum-Buffer-Rope）；**系统的吞吐取决于最弱环节（瓶颈）**。
- **设计逻辑**：先优化瓶颈。看板的 WIP 限制本质是约束管理；产品界面突出「卡住/超期」信号，引导用户聚焦瓶颈。

---

## 流程引擎与自动化

### 16. BPM / 工作流引擎（Camunda / jBPM / Zeebe）

- **来源**：[Camunda Advanced Workflow Engine](https://camunda.com/de/zeebe/advanced-workflow-engine/)、[工作流引擎选型指南](https://developer.baidu.com/article/detail.html?id=7086610)
- **核心理念**：显式状态机、BPMN 流程定义、条件网关、并行/合并、事件驱动。
- **设计逻辑**：**显式状态机 + 可配置流转规则**。产品把任务状态机作为唯一真相源，所有视图只是状态机的投影。

### 17. 自动化平台（Zapier / Make / n8n）

- **来源**：[AI Workflow Automation: Zapier vs Make vs n8n](https://toolchase.com/blog/ai-workflow-automation-guide/)
- **核心理念**：触发器（Trigger）+ 动作（Action）+ 条件逻辑。
- **设计逻辑**：事件驱动，让系统替你执行重复动作。产品后置「自动化」能力（如「到期前提醒」「完成自动归档」）。

---

## 优先级与排序框架

### 18. RICE / MoSCoW / 价值-努力矩阵

- **来源**：[Product Backlog Prioritization Frameworks（Tempo）](https://www.tempo.io/guides/how-to-avoid-common-product-backlog-prioritization-pitfalls)
- **RICE**：`Reach × Impact × Confidence ÷ Effort`，用公式给任务打分排序。
- **MoSCoW**：Must / Should / Could / Won't。
- **价值-努力矩阵**：价值 × 努力，优先做「高价值低努力」。
- **设计逻辑**：用公式/规则排序而非凭感觉。产品支持 `priority × effort`，四象限与排序规则由数据驱动。

---

## 收敛出的 8 条产品设计原则

综合上述全部流派，本产品遵循以下 8 条设计原则（细节在 `product-spec.md`）：

1. **外化优先**：任何入口 3 秒内可捕获念头，收件箱永远可清空（GTD + Inbox Zero）。
2. **状态机统一**：一个显式任务状态机服务所有方法论，视图只是投影，避免数据割裂（BPM + GTD + Kanban）。
3. **可视化 + WIP 限制**：看板列、每列上限，暴露瓶颈（Kanban + TPS + TOC）。
4. **重要 vs 紧急分离**：优先级 + 截止日期自动落四象限（Eisenhower + RICE）。
5. **有限聚焦**：今日视图默认「青蛙优先 + 有限清单」，一次一件（Ivy Lee + Eat That Frog + 番茄）。
6. **节奏与反思**：内置周回顾引导，数据驱动（GTD Reflect + Scrum 回顾 + Six Sigma DMAIC）。
7. **项目=行动容器，领域=长期责任**（PARA 与 GTD 的统一）。
8. **结果可度量**：项目可挂目标/关键结果（OKR + SMART）。

---

*本文档是研究快照，保留来源链接以便后续溯源与迭代。*
