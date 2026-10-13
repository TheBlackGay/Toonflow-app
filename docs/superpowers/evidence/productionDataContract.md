# 生产链路 P1 数据契约

更新时间：2026-10-12

## 已统一的边界

- 生产清单固定为 `version: 1`，镜头 `id`、`order`、标题、提示词、状态、媒体类型、输出路径和时长均有长度、类型及工作区边界校验。
- 生产清单禁止重复镜头 ID 和重复排序号，读取、写入和更新都走同一份校验。
- 镜头状态变更有显式转换表；生产接口拒绝跳过阶段的状态修改，任务同步仍负责把媒体任务状态映射为 `generating`、`review`、`needsRedo` 或 `draft`。
- 媒体任务创建和恢复时按图片、视频、音频选择同一套生成请求 Schema，持久化记录损坏会明确失败，不会按不完整数据继续执行。
- 导出任务的输入片段、输出路径、状态和进度按同一工作区相对路径契约校验。
- 生产批量生成前校验 Provider、模型和媒体类型来自当前 `/api/ai/media/models` 能力清单；前端模型类型增加 Provider 版本字段，便于后续能力迁移。

## 当前状态转换

```text
draft -> queued -> generating -> review -> approved -> completed
                      |             |         |
                      v             v         v
                   draft         needsRedo  needsRedo
```

重做允许回到 `queued` 或 `generating`；取消任务由任务层记录为 `cancelled`，生产清单同步为 `draft`。

## 验证

- Server TypeScript：通过。
- Provider TypeScript：通过。
- Web Vue 类型检查：通过。
- `git diff --check`：通过。
- Web Vite 生产构建：通过。

P1 仍依赖 P0 中记录的 Bun/FFmpeg 运行时环境，真实任务、媒体文件和导出链路需在具备依赖的环境继续验收。
