# 生产链路 P5 FFmpeg

更新时间：2026-10-12

最终导出任务创建前新增输入文件、FFmpeg/FFprobe 预检，沿用现有工作区 FFmpeg 工厂和插件安装状态。缺少输入片段时返回 `409`，缺少任一工具时接口立即返回 `424 FFMPEG_REQUIRED`，不会留下一个必然失败的导出任务；真正执行时仍保留任务取消、进度回写和失败文件清理。

Mock 视频继续使用宿主 FFmpeg 生成真实 MP4，导出继续使用同一工作区 FFmpeg 工厂按镜头顺序合并，避免 Provider 和交付阶段出现两套路径边界。

验证：Server/Provider TypeScript、Web Vue 类型检查、Web Vite 构建和 `git diff --check` 通过；使用内置下载器安装 macOS arm64 FFmpeg 6.1.1 后，Mock MP4 生成、输入预检和两段视频合并导出均已通过。
