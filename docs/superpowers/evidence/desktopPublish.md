# 生产链路 P6 桌面发布

更新时间：2026-10-12

桌面配置已确认生产链路所需资源会进入安装包：

- `build/web` 复制为 `views/mainview`。
- `packages/providers/src` 复制为 `providers`，包含 `mockVideo.ts`、Draw Things 及其他内置 Provider。
- 桌面宿主通过 `@toonflow/server/app` 复用 Server，并把安装包内 `providers` 目录传给 `createApp`。
- `server.requestTimeout = 0`，长时间媒体任务不会被桌面 Server 的默认请求超时提前终止。
- 设置、工作区和 FFmpeg 下载目录仍由既有桌面数据目录规范管理，不写入可更新的 WebView 资源目录。

验证：桌面 TypeScript 检查通过；本机没有 Bun/Electrobun 原生打包链路，因此 `bun run build:desktop`、安装包启动、FFmpeg 插件安装和增量发布尚未执行。
