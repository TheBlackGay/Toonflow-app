# 生产链路 P7 回归清单

更新时间：2026-10-12

## 每次提交的静态检查

- [x] Server TypeScript 检查通过。
- [x] Provider TypeScript 检查通过。
- [x] Web Vue 类型检查通过。
- [x] 桌面 TypeScript 检查通过。
- [x] Web Vite 生产构建通过。
- [x] `git diff --check` 通过。
- [x] 未新增测试文件。

## 具备 Bun、FFmpeg/ffprobe 后的手工验收

- [x] 使用临时 Bun 运行 `bun run routes`，确认路由注册表无漂移。
- [x] 启动 Server，读取 `/api/ai/media/models`，确认 `mockVideo/mock-video` 能力可见；健康检查通过。
- [x] 从脚本导入两行镜头，确认 `.toonflow/production.json` 版本和排序正确。
- [x] 安装 FFmpeg 后提交 Mock 视频任务，观察 `queued -> running -> completed`，确认 `attempt`、时间戳、输出 MP4 和镜头 `outputPath`。
- [x] 取消一个运行中任务，确认 `cancelled/CANCELLED`，再重试并确认 attempt 增加。
- [x] 模拟重启后读取任务，确认遗留任务标记为 `failed/SERVICE_RESTARTED`。
- [x] 在缺少 FFmpeg 时提交导出，确认接口立即返回 `424 FFMPEG_REQUIRED` 且不创建导出任务。
- [x] 生成全部镜头后按序导出，确认最终 MP4 和 `exportedPath`。
- [ ] 启动 Draw Things Local API，检查健康探测、模型选择、图片生成和输出文件落盘。
- [ ] 打包桌面应用，确认安装包内 `providers/mockVideo.ts` 存在，桌面面板可完成同一套流程。

当前使用临时 Bun 和临时 FFmpeg 安装目录完成 Mock/导出运行时验收；Draw Things 实际服务和桌面安装包仍待目标环境补验，静态检查结果见 P0–P6 证据记录。
