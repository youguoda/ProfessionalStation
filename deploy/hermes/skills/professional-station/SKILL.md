---
name: professional-station
description: "读写 ProfessionalStation 个人任务系统：查今天/在制/停滞/待结算、建任务、改承诺日、走状态机迁移、取观察器结论与周复盘素材。当用户问「我今天要做什么」「手上有什么挂着」「帮我记一条」「这周干了什么」，或马力需要基于真实任务数据给建议时使用。"
version: 1.0.0
author: guoda.you
metadata:
  hermes:
    tags: [productivity, personal, task-management, gtd]
    related_skills: [mali]
---

# ProfessionalStation

个人任务系统的 CLI 接口。系统跑在开发服务器上，本 skill 通过内网 HTTP 读写它。

> **系统的核心主张**：方法论不做成视图，做成约束。所有建议都必须落在这三条约束上，
> 脱离额度谈计划就是空话。

| 约束 | 默认 | 行为 |
|---|---|---|
| 今天最多几条 | 6 | 超了不拦，但要明说超了 |
| 同时最多做几件 | 3 | **硬拦**，API 会返回 409 |
| 停滞判定 | 7 天 | 超时的进周回顾结算台 |

## 配置

```bash
export PS_BASE_URL=http://10.112.9.44:3000   # 默认值，通常不用改
export PS_AUTH_USER=<用户名>
export PS_AUTH_PASS=<密码>
```

凭据**只从环境变量读**，不写进仓库。先跑 `pstation doctor` 验证连通性。

## 命令

`pstation` 在本 skill 的 `scripts/` 下（下文简写 `pstation`，实际用绝对路径调用）。

### 读

```bash
pstation view              # 全局快照：容量 + 各范围清单（最常用，一条命令看全局）
pstation today             # 今天承诺的
pstation doing             # 在制品（⏸ 标记的是「等结果」，不占名额）
pstation settlement        # 待结算的欠账：停滞的在制/等待/收件箱
pstation next              # 下一步库存
pstation inbox / waiting / overdue / awaiting
pstation show <ref>        # 一条任务的详情与活动记录
pstation observe           # 观察器结论：现在最该说的那一条
pstation review            # 本周复盘初稿
```

任何命令加 `--json` 出原始 JSON。

### 写

```bash
pstation add "标题"                      # 默认进**收件箱**，等用户澄清
pstation add "标题" --action --plan today # 直接进下一步并承诺今天做
pstation add "标题" --due 2026-09-20
pstation plan <ref> today|YYYY-MM-DD|none # 改承诺日
pstation do <ref> <动作>                  # 走状态机
pstation note <ref> "文本"                # 追加备注
```

`do` 的动作：`start` / `done` / `stop` / `await`（等结果，让出在制名额）/
`resume`（重新上手）/ `cancel --reason "…"` / `trash` / `activate` / `defer` / `reopen`。

### ref 怎么写

任务 id 是 uuid，列表里显示前 8 位。`<ref>` 接受 **id 前缀**或**标题片段**，
但**必须唯一**——匹配到多条会列出候选并报错，不会替你猜。

## 两个必须理解的概念

- `dueDate` 截止日 = **世界对我的要求**
- `plannedFor` 承诺日 = **我对自己的承诺**

「今天」只读承诺日。逾期任务会置顶，但**不占今天的额度**——历史欠账要还，
但别让它决定今天做什么。

「等结果」= 活在跑，但跑的不是他（等机器/等构建/等上游）。留在「进行中」里灰着，
**不占在制名额**，但已进行天数照跑。在制约束的是**他的注意力**，不是世界上正在发生的事。

## 权限边界（重要）

这个系统属于用户，不属于你。

1. **新建任务默认进收件箱**，不直接进「下一步」。你记下它，让他决定它是什么。
   只有他明确说了「放到今天」「现在就做」才用 `--action --plan today`。
2. **不替他做终局判断。** `done` / `cancel` / `trash` 只在他明确说了之后执行——
   任务走到终局是他的决定，不是你的观察结论。
3. **不批量改。** 一次对话里改动超过两三条就停下来问他。
4. **失败就如实报。** 连不上、409 被硬拦、ref 有歧义——原样告诉他，
   绝不凭记忆回答任务状态，也绝不声称做了没做成的事。

WIP 被硬拦（409）不是要绕过的障碍，**那正是这个系统唯一的价值**。
撞上了就告诉他：先结掉一件，或者把一件放回待办。

## 观察器

`pstation observe` 走的是系统内置的 11 类模式识别（纯函数，不调 LLM）：
今天空排、超额承诺、排了没开工、WIP 超限、在制停滞、等待停滞、反复推迟、
临近截止没动作、一周零终局、进出比失衡、收件箱堆积。

它按严重度排序，**只取第一条**。没有模式成立时返回 `quiet`——
大多数日子应该是 quiet，这是设计，不是故障。
