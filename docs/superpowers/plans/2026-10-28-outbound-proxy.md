# 全局服务端出站代理 Implementation Plan

> **For agentic workers:** 按本计划逐项执行；仓库规则禁止新增测试文件，因此使用类型检查、构建和手动验证。

**Goal:** 在设置页配置服务端全局出站代理，并让运行中的服务端 fetch 请求即时使用该代理。

**Architecture:** 新增网络代理运行时模块，保存当前代理地址并包装原始 `fetch`，通过 Bun 的 `RequestInit.proxy` 注入代理。应用启动和设置保存分别初始化、更新该运行时；前端新增独立设置面板，复用现有 settings store。

**Tech Stack:** Bun、TypeScript、Express、Vue 3、Element Plus、Pinia 风格 settings store。

---

## Chunk 1: 服务端代理运行时

### Task 1: 新增代理模块

**Files:**
- Create: `apps/server/src/utils/network/proxy.ts`

- [ ] 实现 `parseOutboundProxy(value)`：空值返回 `undefined`；仅接受 `http`、`https`、`socks5`、`socks5h`；拒绝用户名/密码缺失以外的非法 URL 结构、路径、查询和片段；返回规范化字符串或抛出参数错误。
- [ ] 在模块加载时保存原始 `globalThis.fetch`，维护当前代理变量。
- [ ] 实现 `configureOutboundProxy(value)` 更新当前代理；代理存在时将 `globalThis.fetch` 设置为包装函数，透传 input/init 并添加 `proxy`；代理关闭时恢复原始 fetch。
- [ ] 保留 `preconnect` 等 Bun fetch 扩展属性，避免 provider 依赖丢失。

### Task 2: 接入应用启动与设置保存

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/settings/save.ts`
- Modify: `apps/server/src/utils.ts`

- [ ] 在 `createApp` 动态路由加载前读取 settings.network.outboundProxy 并调用配置函数。
- [ ] 在设置保存路由中增加 `network.outboundProxy` 字段 Zod 校验，并在持久化成功后调用配置函数。
- [ ] 通过 `utils.ts` 统一导出代理模块，遵循服务端工具入口规范。
- [ ] 确保无效代理地址返回 400，代理配置更新失败不吞错。

## Chunk 2: 前端网络代理设置页

### Task 3: 新增设置面板

**Files:**
- Create: `apps/web/src/components/settings/panels/networkProxy.vue`
- Modify: `apps/web/src/components/settings/index.vue`

- [ ] 新增“网络代理”设置面板，文件名和模板类名使用小驼峰。
- [ ] 从 `settings.value.network.outboundProxy` 读取当前值，输入框支持空值关闭，使用 `dir="ltr"` 和清晰的无障碍标签。
- [ ] 添加简短说明和示例 `socks5://127.0.0.1:1080`，不增加测试连接、额外开关或未要求的行为。
- [ ] 在设置侧栏“其他”分组注册异步面板。
- [ ] 保存失败时显示 Element Plus 错误消息；成功保存沿用现有深度监听队列。

## Chunk 3: 验证与收尾

### Task 4: 类型检查、构建与手动验证

**Files:**
- No new test files.

- [ ] 执行 `bun run --cwd apps/server typecheck`，修复类型错误。
- [ ] 执行 `bun run --cwd apps/server build`，确认服务端构建通过。
- [ ] 启动临时服务端配置目录，手动验证保存合法 SOCKS5 地址、读取设置、保存空值关闭，以及非法协议返回 400；不覆盖真实 `data/settings.json`。
- [ ] 检查 `git diff` 和 `git status`，确认只包含本功能相关文件。
- [ ] 提交实现，提交信息使用 `feat: add global outbound proxy`。
