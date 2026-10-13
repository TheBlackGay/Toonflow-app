import { mkdir, readFile, unlink } from "@toonflow/file";
import { join } from "node:path";
import { getStatus } from "@/utils/ffmpeg";

export type MockVideoRequest = {
  prompt: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
};

function dimensions(ratio: string | undefined, resolution: string | undefined) {
  const height = resolution === "360p" ? 360 : resolution === "1080p" ? 1080 : 480;
  const match = /^(\d+):(\d+)$/.exec(ratio ?? "16:9");
  const width = match ? Math.max(2, Math.round(height * Number(match[1]) / Number(match[2]))) : Math.round(height * 16 / 9);
  return { width: width % 2 ? width + 1 : width, height };
}

function ffmpegRequired(): never {
  throw Object.assign(new Error("Mock 视频生成需要 FFmpeg，请先在插件市场下载安装或配置可用版本。"), {
    name: "FfmpegRequiredError",
    code: "FFMPEG_REQUIRED",
    status: 424,
  });
}

export async function createMockVideo(cwd: string, request: MockVideoRequest, signal?: AbortSignal): Promise<{
  mediaType: "video";
  type: "binary";
  mimeType: "video/mp4";
  data: Uint8Array;
}> {
  signal?.throwIfAborted();
  const status = await getStatus();
  const ffmpeg = status.tools.ffmpeg.path;
  if (!ffmpeg || status.tools.ffmpeg.error) ffmpegRequired();

  const duration = Math.min(30, Math.max(1, Number.isFinite(request.duration) ? request.duration! : 2));
  const { width, height } = dimensions(request.ratio, request.resolution);
  const output = join(cwd, ".toonflow", `mockVideo-${crypto.randomUUID()}.mp4`);
  await mkdir(join(cwd, ".toonflow"), { recursive: true });
  try {
    const child = Bun.spawn([
      ffmpeg,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${width}x${height}:rate=24:duration=${duration}`,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output,
    ], { stdout: "ignore", stderr: "pipe", signal, windowsHide: true });
    const [stderr, code] = await Promise.all([child.stderr.text(), child.exited]);
    signal?.throwIfAborted();
    if (code !== 0) throw new Error(`Mock 视频生成失败${stderr.trim() ? `：${stderr.trim().slice(0, 1000)}` : ""}`);
    return { mediaType: "video", type: "binary", mimeType: "video/mp4", data: await readFile(output) };
  } finally {
    await unlink(output).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.warn(`Mock 视频临时文件清理失败：${output}`, error);
    });
  }
}
