# 把马力装进 Hermes

ProfessionalStation 的教练「马力」在 Web UI 里跑着一份（秒回对话 + 主动开口）。
这个目录是他的**第二个身体**：一个 Hermes profile，有真工具，干重活、定时活。

两边共用一套人格——`profiles/mali/SOUL.md` 从 `src/lib/agent/persona.ts` 的
roaster 模板逐段移植。**改人格要两边同步改。**

## 拓扑

```
工作本（Mac）                         开发服务器 10.112.9.44
┌──────────────────┐                ┌──────────────────────────┐
│ Hermes Agent     │──── HTTP ─────▶│ ProfessionalStation :3000 │
│ ~/.hermes/       │  内网+BasicAuth │   /api/agent/view         │
│  profiles/mali/  │                │   /api/agent/observe      │
│  skills/personal/│                │   /api/tasks/…            │
└──────────────────┘                └──────────────────────────┘
```

Hermes 在工作本上，任务系统在服务器上，中间只有 HTTP。
Hermes **看不到**服务器的文件系统——想让马力读 git log / CI 结果，
得另外开一条 SSH 通道（还没做）。

## 装

在**工作本**上：

```bash
git clone https://github.com/youguoda/ProfessionalStation.git   # 首次
cd ProfessionalStation && git pull

bash deploy/hermes/install.sh
```

脚本会把 skill 铺到 `~/.hermes/skills/personal/professional-station`，
profile bundle 铺到 `~/.hermes/profiles/mali/`，并调 `hermes profile create mali`。

然后把凭据加进 `~/.zshrc`：

```bash
export PS_BASE_URL=http://10.112.9.44:3000
export PS_AUTH_USER=<用户名>
export PS_AUTH_PASS=<密码>
```

> **凭据只走环境变量，不进仓库。** 这一点和 model-test-agents 里
> API key 明文写在 config.yaml 的做法不同——那边是历史包袱，别在这里重复。

验证：

```bash
~/.hermes/skills/personal/professional-station/scripts/pstation doctor
```

## 用

```bash
hermes -p mali chat -s personal/professional-station
```

或者直接问一句：

```bash
hermes -p mali chat -s personal/professional-station -q "我今天该干什么"
```

## 定时唤醒（Phase 3，可选）

`GET /api/agent/observe` 返回观察器结论的**纯文本**，配 cron 的监视模式用：

```
cronjob create
  schedule: "0 9,14 * * 1-5"
  monitor_url: http://10.112.9.44:3000/api/agent/observe
  profile: mali
```

**关键设计**：这个端点的输出**刻意不带日期**。同一个模式持续成立 = 输出哈希不变
= cron 静默跳过；只有情况真的变了才唤醒马力。

这样「罕见」这条红线就从一句提示词规则，变成了一条基础设施保证——
一个有定时器的教练，如果每天准点唠叨，第三天就会被无视。

> ⚠️ `monitor_url` 支不支持 Basic Auth 我没验过。不支持就改用
> `monitor_script`，跑 `pstation observe`（它自己带认证），效果一样。

## 目录

```
deploy/hermes/
├── install.sh                       # 工作本上跑这个
├── skills/professional-station/
│   ├── SKILL.md                     # 给 Hermes 读的使用说明与权限边界
│   └── scripts/pstation             # CLI（Python 3 标准库，无需 pip）
└── profiles/mali/
    ├── SOUL.md                      # 人格（与 persona.ts 同源）
    ├── profile.yaml
    └── config.yaml                  # 模型与 toolsets
```

CLI 不叫 `ps`——那会和系统的进程命令撞名。

## 边界

马力现在有真工具了，所以边界写死在 SKILL.md 和 SOUL.md 里：

- 新建任务默认进**收件箱**，不直接进「下一步」——他记下它，你决定它是什么
- `done` / `cancel` / `trash` 只在你明确说了之后执行——走到终局是你的决定
- 失败如实报：连不上就说连不上，绝不凭记忆回答任务状态
- WIP 被硬拦（409）不是要绕过的障碍，**那正是这个系统唯一的价值**
