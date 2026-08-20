# ProfessionalStation — 任务计划网站

一个「方法无关」的个人任务计划网站：同一套任务引擎，可切换 GTD / 看板 / 四象限 / PARA / 时间块等工作流视图。

- 研究与方法论依据：[docs/methodology-research.md](docs/methodology-research.md)
- 产品与技术方案：[docs/product-spec.md](docs/product-spec.md)

## 快速开始

```bash
npm install
npm run dev        # 开发服务器 http://localhost:3000
npm run test       # 运行状态机等单元测试
npm run build      # 生产构建
```

## 目录结构

```
src/
  app/            # Next.js App Router 页面与 API 路由
  components/     # UI 组件（各方法论视图）
  lib/
    engine/       # 状态机引擎（纯函数，唯一状态转换真相源）
    domain/       # 领域类型与常量
    db/           # 持久化仓储（MVP 文件存储）
    parsing/      # 自然语言日期解析
  store/          # 客户端 Zustand 状态
```

## 核心不变量

视图层不允许绕过状态机引擎直接修改任务状态。所有状态迁移都通过 `lib/engine` 的纯函数完成，保证多视图数据一致。
