const rules = [
  {
    type: "input",
    field: "baseUrl" as const,
    title: "Draw Things 地址",
    value: "http://127.0.0.1:7888",
    props: { placeholder: "http://127.0.0.1:7888" },
  },
  {
    type: "input",
    field: "extraParameters" as const,
    title: "额外请求参数",
    value: "",
    props: {
      type: "textarea",
      rows: 5,
      placeholder: '{"seed": 123456, "negative_prompt": "low quality"}',
    },
  },
  {
    type: "inputNumber",
    field: "requestTimeoutMinutes" as const,
    title: "请求超时（分钟）",
    value: 10,
    props: { min: 1, max: 1440, step: 1, stepStrictly: true },
  },
] as const;

const version = "0.5.0";
const defaultImageModel = "z_image_turbo_1.0_i8x.ckpt";
const defaultVideoModel = "minimax_h3_ref2va_i6x.ckpt";

type ModelPreset = {
  type: "image" | "video";
  steps: number;
  cfg: number;
  parameters?: Record<string, unknown>;
  fps?: number;
  supportsAudio?: boolean;
};

const modelPresets: Record<string, ModelPreset> = {
  "z_image_turbo_1.0_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "z_image_1.0_i8x.ckpt": { type: "image", steps: 28, cfg: 4 },
  "krea_2_turbo_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "qwen_image_2.1_i8x.ckpt": { type: "image", steps: 40, cfg: 1, parameters: { shift: 1 } },
  "ideogram_4_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "ideogram_4_fast_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "ideogram_4_instant_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "minimax_h3_ref2va_i6x.ckpt": { type: "video", steps: 4, cfg: 1, fps: 24, supportsAudio: true },
  "minimax_h3_ref2va_i8x.ckpt": { type: "video", steps: 8, cfg: 1, fps: 24, supportsAudio: true },
  "minimax_h3_fl2va_i8x.ckpt": { type: "video", steps: 8, cfg: 1, fps: 24, supportsAudio: true },
};

function mediaUrl(input: MediaInput) {
  if (input.type === "url") return input.url;
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data;
  return data.startsWith("data:") ? data : `data:${input.mimeType};base64,${data}`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function extraParameters(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("必须是 JSON 对象");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Draw Things 额外请求参数无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

function modelParameters(value: unknown): Record<string, unknown> {
  return object(value);
}

function requestTimeoutMinutes(value: unknown) {
  const minutes = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 10;
}

function asset(value: unknown, mediaType: "image" | "video", mimeType: string): MediaAsset | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const result = value.trim();
  if (/^https?:\/\//i.test(result)) return { mediaType, type: "url", url: result };
  const match = new RegExp(`^data:(${mediaType}\\/[^;,]+);base64,([\\s\\S]+)$`, "i").exec(result);
  if (match) return { mediaType, type: "base64", mimeType: match[1], data: match[2] };
  if (/^[a-zA-Z0-9+/]+=*$/.test(result) && result.length % 4 !== 1) {
    return { mediaType, type: "binary", mimeType, data: Buffer.from(result, "base64") };
  }
  return undefined;
}

function findAsset(value: unknown, mediaType: "image" | "video"): MediaAsset | undefined {
  const mimeType = mediaType === "image" ? "image/png" : "video/mp4";
  const direct = asset(value, mediaType, mimeType);
  if (direct) return direct;
  const data = object(value);
  for (const key of ["image", "video", "image_url", "video_url", "imageUrl", "videoUrl", "url", "result"]) {
    const found = asset(data[key], mediaType, mimeType);
    if (found) return found;
  }
  for (const key of ["images", "videos", "outputs", "data"]) {
    if (data[key] === undefined || data[key] === null) continue;
    const items = Array.isArray(data[key]) ? data[key] : [data[key]];
    for (const item of items) {
      if (item === undefined || item === null || item === value) continue;
      const found = findAsset(item, mediaType);
      if (found) return found;
    }
  }
  return undefined;
}

const qwenImageDimensions: Record<string, [number, number]> = {
  "4:3": [2400, 1792],
  "3:4": [1792, 2400],
  "3:2": [2528, 1696],
  "2:3": [1696, 2528],
};

function dimensions(model: string, ratio: string | undefined, requestedSize?: string) {
  if (model === "qwen_image_2.1_i8x.ckpt") {
    const fallback = qwenImageDimensions[ratio ?? "4:3"] ?? qwenImageDimensions["4:3"];
    const parsed = /^(\d+)x(\d+)$/i.exec(requestedSize ?? "");
    if (parsed) {
      const width = Number(parsed[1]);
      const height = Number(parsed[2]);
      const matchesRatio = Math.abs(width / height - fallback[0] / fallback[1]) < 0.01;
      if (matchesRatio && width > 0 && height > 0 && width <= fallback[0] && height <= fallback[1]) return { width, height };
    }
    return { width: fallback[0], height: fallback[1] };
  }
  if (ratio === "9:16") return { width: 512, height: 768 };
  if (ratio === "16:9") return { width: 768, height: 512 };
  return { width: 512, height: 512 };
}

function frameCount(duration: number | undefined, fps: number) {
  if (!duration) return undefined;
  const requested = Math.round(duration * fps);
  return Math.max(5, Math.min(362, 5 + 17 * Math.round((requested - 5) / 17)));
}

function getPreset(model: string, type: "image" | "video") {
  const preset = modelPresets[model];
  if (!preset || preset.type !== type) throw new Error(`Draw Things 未配置 ${type === "image" ? "图片" : "视频"}模型“${model}”的参数`);
  return preset;
}

async function requestMedia(context: ProviderContext, baseUrl: string, path: string, body: Record<string, unknown>, mediaType: "image" | "video") {
  const timeout = requestTimeoutMinutes(context.config.requestTimeoutMinutes) * 60_000;
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = AbortSignal.any([timeoutSignal, ...(context.signal ? [context.signal] : [])]);
  let response: Response;
  try {
    response = await context.tool.fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(`Draw Things 请求超时（${timeout / 60_000} 分钟），请在媒体供应商配置中增加请求超时时间`);
    }
    if (context.signal?.aborted) throw error;
    throw new Error(`无法连接 Draw Things Local API：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`Draw Things ${mediaType === "image" ? "图片" : "视频"}请求失败：HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType?.startsWith(`${mediaType}/`)) {
    return [{ mediaType, type: "binary", mimeType: contentType, data: new Uint8Array(await response.arrayBuffer()) } satisfies MediaAsset];
  }
  const result = await response.json() as unknown;
  const found = findAsset(result, mediaType);
  if (!found) throw new Error(`Draw Things 未返回已编码${mediaType === "image" ? "图片" : "视频"}`);
  return [found];
}

export default {
  id: "drawThings",
  label: "Draw Things Local",
  version,
  readme: "本机 Draw Things Local API 图片与视频供应商。请先开启 Local API Server。模型列表会从本机 Draw Things Models 目录筛选已配置模型，也可在媒体模型设置中切换；参数会按模型类型自动选择。供应商级额外请求参数填写 JSON 对象，例如 {\"seed\":123456}；编辑具体模型时，还可以在模型参数中配置该模型专用的 steps、seed、loras 等参数，模型参数优先于供应商级参数。请求默认超时 10 分钟，可在编辑窗口调整，最长 24 小时。",
  rules,
  models: [],
  async healthCheck() {
    const baseUrl = (this.config.baseUrl?.trim() || "http://127.0.0.1:7888").replace(/\/$/, "");
    try {
      const response = await this.tool.fetch(`${baseUrl}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return { reachable: true, message: `Draw Things 已连接，但模型列表接口返回 HTTP ${response.status}` };
      const value = await response.json() as unknown;
      const models = Array.isArray(value) ? value.flatMap(item => {
        const data = object(item);
        return typeof data.title === "string" ? [data.title] : typeof data.model_name === "string" ? [data.model_name] : [];
      }) : [];
      return { reachable: true, models };
    } catch (error) {
      return { reachable: false, message: `无法连接 Draw Things Local API：${error instanceof Error ? error.message : String(error)}` };
    }
  },
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    const model = request.model || defaultImageModel;
    const preset = getPreset(model, "image");
    const size = dimensions(model, request.ratio, request.size);
    const body: Record<string, unknown> = {
      negative_prompt: "", steps: preset.steps, guidance_scale: preset.cfg,
      ...preset.parameters,
      ...extraParameters(this.config.extraParameters),
      ...modelParameters(request.other?.modelParameters),
      prompt: request.prompt, model, width: size.width, height: size.height, batch_size: 1,
    };
    if (request.images?.length) body.init_images = request.images.map(mediaUrl);
    return requestMedia(this, (this.config.baseUrl?.trim() || "http://127.0.0.1:7888").replace(/\/$/, ""), request.images?.length ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img", body, "image");
  },
  async generateVideo(request: VideoRequest): Promise<MediaAsset[]> {
    const model = request.model || defaultVideoModel;
    const preset = getPreset(model, "video");
    if (request.lastFrame || request.videos?.length || request.audios?.length) throw new Error("Draw Things Local 当前不支持尾帧、视频或音频参考");
    const size = dimensions(model, request.ratio);
    const body: Record<string, unknown> = {
      negative_prompt: "", steps: preset.steps, cfg_scale: preset.cfg, num_frames: frameCount(request.duration, preset.fps ?? 24), fps: preset.fps ?? 24,
      ...extraParameters(this.config.extraParameters),
      ...modelParameters(request.other?.modelParameters),
      prompt: request.prompt, model, width: size.width, height: size.height, batch_size: 1,
    };
    const firstFrame = request.firstFrame ?? request.images?.[0];
    if (firstFrame) body.init_images = [mediaUrl(firstFrame)];
    if (request.generateAudio !== undefined && preset.supportsAudio) body.generate_audio = request.generateAudio;
    return requestMedia(this, (this.config.baseUrl?.trim() || "http://127.0.0.1:7888").replace(/\/$/, ""), firstFrame ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img", body, "video");
  },
} satisfies ProviderDefinition<typeof rules>;
