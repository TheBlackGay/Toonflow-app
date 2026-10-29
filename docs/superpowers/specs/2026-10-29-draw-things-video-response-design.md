# Draw Things 视频响应兼容设计

## 目标

让 Toonflow 的 Draw Things 视频 Provider 同时兼容两类 Local API 响应：已经编码的视频文件，以及 `images` 字段返回的图片帧序列。两类结果都统一落盘为工作区内的 MP4 视频。

## 方案

Draw Things Provider 负责识别响应结构并保留所有帧。`MediaAsset` 增加可选的 `sequence: { fps: number }` 描述；帧资产标记为 `mediaType: "video"`，但保留实际图片 MIME，宿主据此只对完整帧序列做转换。已经编码的视频资产直接返回。服务器媒体生成层在确认视频资产实际为图片帧时，使用现有 `createWorkspaceFfmpeg` 注入的宿主 FFmpeg 将帧按描述中的 FPS 编码为 H.264 MP4。

## 数据流

```text
Draw Things HTTP
  ├─ video/* 或 ftyp → 直接作为 video asset
  └─ images[PNG/JPEG...] → 多个 video frame asset
                         ↓
                  server FFmpeg 编码
                         ↓
                    video/mp4
```

Provider 不根据 Draw Things UI 的保存选项猜测格式，而是以响应内容文件头为准。仅当 `images` 是非空数组且每一项都能解析为同一图片格式时才视为帧序列；帧序列按响应顺序编码，FPS 使用请求中实际发送的 FPS（默认 24）。已编码的 MP4/MOV/WEBM 由现有 MIME 和文件头识别后直接返回，最终输出扩展名跟随识别结果；PNG/JPEG 帧序列统一输出 MP4。

## 错误处理与清理

- 空数组、混合视频/图片结果、超过 1000 帧或累计超过 100 MB 的帧序列返回明确的媒体格式错误。
- FFmpeg 不可用时沿用现有 `FfmpegRequiredError`，不自动安装或重试 Draw Things 请求。
- 临时帧文件和临时 MP4 在成功、失败、取消路径均清理；FFmpeg 命令监听 `AbortSignal` 并调用 `command.kill()`。
- 编码沿用现有视频处理参数：`libx264`、偶数边填充、`yuv420p` 和 `+faststart`。
- 已编码视频不经过二次转码。

## 验证

- 运行 server 和 provider 类型检查。
- 通过 Draw Things Local API 实际提交一次参考图视频任务，确认 PNG 帧能够保存为可识别的 MP4。
- 再验证已编码视频分支的 MIME 和文件头判断。

