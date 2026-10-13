# 生产链路运行时验收记录

更新时间：2026-10-12

## 环境

- Server：通过临时 `npm exec --yes bun` 启动 Bun `1.4.3`。
- 失败路径数据目录：`/tmp/toonflow-p0-run`，未安装 FFmpeg/ffprobe。
- 成功路径数据目录：`/tmp/toonflow-p7-run/data`，通过内置下载器安装 macOS arm64 FFmpeg 6.1.1。
- 成功路径工作区：`/tmp/toonflow-p7-run/workspaces/success`。

## 已通过

1. `/api/ai/media/models` 返回内置 `mockVideo/mock-video` 能力；健康接口返回 `reachable: true` 和 `modelAvailable: true`。
2. `POST /api/production/shots/fromScript` 将两行脚本生成两个有序视频镜头。
3. 批量生成两个 Mock 视频任务成功创建，修复任务文件并发锁后不再返回 `EBUSY`。
4. 无 FFmpeg 时两个任务都进入 `failed`，错误码为 `FFMPEG_REQUIRED`；生产清单同步为 `needsRedo`。
5. 重试任务后 `attempt` 从 1 增加到 2，并再次得到 `FFMPEG_REQUIRED`。
6. 准备两个输入片段后提交导出，在任务创建前立即返回 HTTP `424`，响应错误码为 `FFMPEG_REQUIRED`。
7. 安装 FFmpeg/ffprobe 后，两个 Mock 视频任务均完成，`attempt` 为 1，输出 MP4 落盘；同步后镜头状态为 `review` 并回写 `outputPath`。
8. 两个视频片段按镜头顺序成功导出，导出任务进度达到 100%，生产清单回写 `exportedPath`。
9. 运行中任务取消后得到 `cancelled/CANCELLED`；立即重试不会被旧执行器覆盖，重试成功且 `attempt` 增加到 2。
10. 使用合法的遗留 `running` 任务记录触发服务重启恢复，任务被标记为 `failed/SERVICE_RESTARTED`。

## 待补验

- Draw Things Local API 图片生成。
- 桌面安装包启动和桌面内完整生产流程。
