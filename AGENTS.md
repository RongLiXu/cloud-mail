# AGENTS.md

## 项目概览
- 仓库名：`cloud-mail`
- 结构：双子项目仓库，不是 workspace monorepo
  - `mail-worker`：Cloudflare Workers 后端，Hono + Drizzle，负责 API、邮件收发、鉴权、定时任务、静态资源托管
  - `mail-vue`：Vue 3 + Vite 前端，Pinia / Vue Router / Element Plus / PWA
- 根目录当前没有统一 `package.json`；命令需要分别在子项目目录执行，或使用 `pnpm --prefix`

## 技术栈
### 后端 `mail-worker`
- Runtime：Cloudflare Workers
- Web：`hono`
- ORM：`drizzle-orm`
- 测试：`vitest` + `@cloudflare/vitest-pool-workers`
- 部署：`wrangler`
- 关键云资源：D1 / KV / R2 / Workers AI / Assets

### 前端 `mail-vue`
- Framework：Vue 3
- Build：Vite 7
- UI：Element Plus
- State：Pinia + `pinia-plugin-persistedstate`
- Router：Vue Router 4
- HTTP：Axios
- PWA：`vite-plugin-pwa`
- 本地存储：Dexie（IndexedDB）

## 目录要点
### `mail-worker/src`
- `api/`：HTTP API 路由层，文件名基本与前端 `src/request/*` 对应
- `service/`：业务逻辑
- `dao/` / `entity/`：数据访问与实体
- `security/`：认证鉴权
- `email/`：邮件处理、收件入口
- `hono/`：应用装配、中间件、异常
- `init/`：初始化逻辑
- `utils/` / `const/` / `model/`：公共能力

### `mail-vue/src`
- `request/`：API 请求封装
- `views/`：页面
- `store/`：Pinia 状态
- `router/`：前端路由
- `init/`：启动初始化
- `perm/`：权限指令/控制
- `components/` / `layout/`：UI 组件与布局

## 已确认的运行方式
### 前端
在 `mail-vue` 目录：
- 开发：`pnpm dev`
- 远程环境：`pnpm remote`
- 构建发布产物：`pnpm build`
- 预览：`pnpm preview`

环境文件：
- `.env.dev`：API 指向 `http://127.0.0.1:8787/api`
- `.env.remote`：API 指向线上 `https://skymail.ink/api`
- `.env.release`：构建输出到 `../mail-worker/dist`

### 后端
在 `mail-worker` 目录：
- 本地开发：`pnpm dev` 或 `pnpm start`
- 部署：`pnpm deploy`
- 当前 `pnpm test` 实际执行的是 `wrangler deploy --config wrangler-test.toml`，**不是单元测试**

测试配置文件存在：
- `mail-worker/vitest.config.js`
- `mail-worker/test/index.spec.js`

如果要跑 Vitest，请优先显式使用：
- `pnpm exec vitest`

## 部署与耦合关系
- Worker 的 `[build].command` 会先安装并构建前端：
  - `pnpm --prefix ../mail-vue install && pnpm --prefix ../mail-vue run build`
- 前端发布产物输出到：`mail-worker/dist`
- Worker 在 `fetch()` 中：
  - `/api/*` 转发到 Hono 应用
  - `/static/*`、`/attachments/*` 走对象存储读取
  - 其他路径走 `env.assets.fetch(req)`，作为 SPA 静态资源
- 存在 cron：`*/30 * * * *` 与 `0 16 * * *`

## 代码风格与约束
### 通用
- 优先做最小变更，避免无关重构
- 前后端接口名、字段名保持对齐；修改 API 时同步检查：
  - `mail-worker/src/api/*`
  - `mail-vue/src/request/*`
  - 相关 `views/` 与 `store/`
- 不要编造不存在的基础设施、脚本或 workspace 机制

### 后端风格
已观察到配置：
- `mail-worker/.editorconfig`
  - 默认使用 **tab** 缩进
  - `lf` 换行
- `mail-worker/.prettierrc`
  - `singleQuote: true`
  - `semi: true`
  - `useTabs: true`
  - `printWidth: 140`

因此修改 `mail-worker` 下 JS 文件时：
- 保持 tab 缩进
- 保持单引号与分号
- 不要擅自改成空格风格

### 前端风格
- 仓库里未看到前端独立 ESLint/Prettier 配置
- 以现有文件风格为准：ESM、单文件职责清晰、路径别名 `@ -> mail-vue/src`
- 修改前端时优先保持局部文件既有格式，不做大规模格式化

## 修改建议
### 修改后端接口时
1. 先定位 `mail-worker/src/api/*.js`
2. 再检查对应 `service/`、`dao/`、`entity/`
3. 同步检查前端 `mail-vue/src/request/*.js`
4. 如接口影响页面，再检查 `views/`、`store/`

### 修改前端页面时
1. 从 `views/` 或 `layout/` 入手
2. 检查依赖的 `request/`、`store/`、`components/`
3. 若新增配置项，确认 `.env.*` 与后端静态构建输出是否受影响

### 修改部署配置时
- 重点检查：
  - `mail-worker/wrangler.toml`
  - `mail-worker/wrangler-dev.toml`
  - `mail-worker/wrangler-test.toml`
  - `.github/workflows/deploy-cloudflare.yml`
- 注意 GitHub Action 会动态替换 `wrangler-action.toml` 中的占位符，并按条件删除可选段落

## 验证建议
### 小改动后最少验证
- 前端改动：
  - `cd mail-vue && pnpm build`
- 后端改动：
  - `cd mail-worker && pnpm exec vitest`
  - 如涉及 Worker 路由/资源绑定，再执行 `pnpm dev` 做本地联调

### 联调建议
1. `cd mail-vue && pnpm build`
2. `cd ../mail-worker && pnpm dev`
3. 访问 Wrangler 本地地址，确认 `/api` 与静态页面均正常

## 风险提示
- `mail-worker/package.json` 中的 `test` 脚本语义危险，可能触发部署；不要把 `pnpm test` 当作普通测试命令直接运行
- `mail-worker/test/index.spec.js` 仍是默认 “Hello World” 样例，和当前项目实现大概率不一致；依赖其结果前先确认是否已更新
- 本地/测试 wrangler 配置中包含真实资源 ID 痕迹；修改配置前先确认目标环境，避免误连云资源

## 给代理的工作方式
- 先分析再改，优先读取目标模块及其直接依赖
- 一次只改变一个清晰目标，避免把接口变更、样式重构、部署调整混在同一提交
- 输出时说明：改了什么、为什么改、还建议用户执行什么验证
- 若发现文档与代码不一致，以代码和配置为准，并在结果里明确指出漂移点
