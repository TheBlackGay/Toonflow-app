# 生产链路 P0 基线

更新时间：2026-10-12

这份记录固定当前生产链路的可验证边界，作为后续 P1 至 P7 的对照基线。当前视频服务仍使用内置 `mockVideo`，真实生视频 Provider 后续再接入。

## 当前链路

```text
脚本导入
  -> 生产清单（.toonflow/production.json）
  -> 镜头任务（.toonflow/mediaTasks.json）
  -> Provider/模型生成
  -> 媒体文件写入工作区
  -> 同步镜头状态
  -> FFmpeg 合并导出
```

生产面板通过 `/api/ai/media/models` 动态读取可用媒体模型。当前 Mock 视频入口为：

- Provider：`mockVideo`
- Model：`mock-video`
- 类型：`video`
- 生成方式：宿主 FFmpeg `testsrc2` 生成真实 MP4
- 限制：当前只支持 360p/480p，单段时长 1–30 秒；Mock 生成需要 FFmpeg，最终合并导出还需要 ffprobe

## 静态验证矩阵

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| Server TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p apps/server/tsconfig.json` | 通过 |
| Provider TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p packages/providers/tsconfig.json` | 通过 |
| Web Vue 类型检查 | `node apps/web/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p apps/web/tsconfig.json` | 通过 |
| Web 生产构建 | 在 `apps/web` 执行 `node node_modules/vite/bin/vite.js build` | 通过 |
| Diff 格式检查 | `git diff --check` | 通过 |
| Server 路由注册表 | `apps/server/src/router.ts` 已包含生产、媒体任务和模型路由 | 已确认 |

仓库规范要求的 Bun 命令仍以 Bun 为准；本机当前没有 `bun`，上表使用已安装的 Node 工具完成等价的静态检查。Web 构建保留现有 Vite 原生配置提示和大 chunk 提示，它们不影响构建退出码。

## 运行时验收

已通过临时 Bun Server 完成模型发现、脚本导入、双镜头任务创建、无 FFmpeg 失败回写、任务重试和导出前置 `424 FFMPEG_REQUIRED` 验收。详细请求结果见 [productionRuntimeVerification.md](./productionRuntimeVerification.md)。

当前仍没有 `ffmpeg`/`ffprobe`，因此真实 MP4 生成、成功合并导出、运行中取消、服务重启恢复、Draw Things 实际生成和桌面宿主验收尚未覆盖。

缺少 FFmpeg 时，Mock Provider 会返回 `FFMPEG_REQUIRED`，提示先在插件市场安装或配置 FFmpeg；不会伪造成功结果。

## P0 验收结论

P0 的代码基线、路由注册、任务持久化结构、生产清单结构、Provider 模型发现和前端生产面板已经具备静态可构建状态；核心失败路径已通过真实 HTTP 验收。成功媒体生成和交付路径仍需在具备 FFmpeg/ffprobe 的环境补齐。

下一阶段 P1 应统一并收紧以下数据契约：生产清单版本、镜头状态转换、媒体任务状态映射、Provider/模型能力字段以及错误结构；P1 不应先扩展新的 Provider。
