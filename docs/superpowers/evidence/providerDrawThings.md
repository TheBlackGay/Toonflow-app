# 生产链路 P4 Provider / Draw Things

更新时间：2026-10-12

生产面板在提交批量生成前调用媒体供应商健康检查：供应商不可达或明确报告模型不可用时，不创建任务，直接显示可读错误。模型列表仍来自 `/api/ai/models`，生成接口服务端再次校验 Provider、模型和媒体类型，避免仅依赖前端选择。

当前 Provider 能力：

- `mockVideo/mock-video`：本地健康检查始终可用，实际生成依赖 FFmpeg。
- `drawThings`：探测本地 Draw Things Local API（`/` 或 `/sdapi/v1/options`），返回当前模型信息；本机模型列表从 Draw Things 注册表和 Models 目录读取，远程地址需手动配置模型 ID。
- 已内置 `qwen_image_2.1_turbo_i8x.ckpt` 预设：8 步、CFG/Text Guidance 1、`DDIM Trailing`、Shift 6.5，并沿用 Qwen Image 的 4:3 默认尺寸；模型文件发现后只需刷新并保存模型列表，不必重复填写这些参数。
- Draw Things 请求保留超时、错误正文脱敏和输出媒体类型校验。

验证：Server/Provider TypeScript、Web Vue 类型检查、Web Vite 构建和 `git diff --check` 通过；当前环境没有 Draw Things/FFmpeg 服务，实际连通性和生成结果待对应机器补验。
