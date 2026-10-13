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

type ModelPreset = {
  type: "image";
  steps: number;
  cfg: number;
  parameters?: Record<string, unknown>;
};

const modelPresets: Record<string, ModelPreset> = {
  "z_image_turbo_1.0_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "z_image_1.0_i8x.ckpt": { type: "image", steps: 28, cfg: 4 },
  "krea_2_turbo_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "qwen_image_2.1_i8x.ckpt": { type: "image", steps: 40, cfg: 1, parameters: { shift: 1 } },
  "qwen_image_2.1_turbo_i8x.ckpt": { type: "image", steps: 8, cfg: 1, parameters: { sampler: "DDIM Trailing", shift: 6.5 } },
  "ideogram_4_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "ideogram_4_fast_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
  "ideogram_4_instant_i8x.ckpt": { type: "image", steps: 8, cfg: 1 },
};

export function validateDrawThingsModelId(value: string) {
  const model = value.trim();
  if (!model || (!modelPresets[model] && !/\.(?:ckpt|safetensors)$/i.test(model))) {
    throw new Error("Draw Things 模型 ID 必须是已知预设或以 .ckpt/.safetensors 结尾的模型文件名");
  }
  return model;
}

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
    return validateParameters(parsed as Record<string, unknown>);
  } catch (error) {
    throw new Error(`Draw Things 额外请求参数无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "negative_prompt", "seed", "subseed", "subseed_strength", "sampler", "sampler_name", "seed_mode", "steps", "cfg_scale", "guidance_scale",
    "shift", "tea_cache", "tiled_diffusion", "tiled_decoding", "clip_skip", "denoising_strength", "stochastic_sampling_gamma",
    "speed_up_with_guidance_embed", "restore_faces", "upscaler", "hires_fix", "hires_fix_strength", "image_guidance", "loras", "strength",
  ]);
  for (const key of Object.keys(parameters)) if (!allowed.has(key)) throw new Error(`Draw Things 不支持模型参数“${key}”`);
  const numberRules: Record<string, [number, number]> = {
    seed: [-1, Number.MAX_SAFE_INTEGER], subseed: [-1, Number.MAX_SAFE_INTEGER], subseed_strength: [0, 1], steps: [1, 200],
    cfg_scale: [0, 50], guidance_scale: [0, 50], shift: [0, 20], clip_skip: [0, 12], denoising_strength: [0, 1],
    stochastic_sampling_gamma: [0, 10], hires_fix_strength: [0, 1], image_guidance: [0, 50], strength: [0, 1],
  };
  for (const [key, [min, max]] of Object.entries(numberRules)) {
    if (parameters[key] === undefined) continue;
    if (typeof parameters[key] !== "number" || !Number.isFinite(parameters[key]) || parameters[key] < min || parameters[key] > max) {
      throw new Error(`Draw Things 参数“${key}”必须是 ${min} 到 ${max} 之间的数字`);
    }
  }
  for (const key of ["sampler", "sampler_name", "seed_mode"]) {
    if (parameters[key] !== undefined && (typeof parameters[key] !== "string" || !parameters[key].trim())) throw new Error(`Draw Things 参数“${key}”必须是非空字符串`);
  }
  for (const key of ["tea_cache", "tiled_diffusion", "tiled_decoding", "speed_up_with_guidance_embed", "restore_faces", "hires_fix"]) {
    if (parameters[key] !== undefined && typeof parameters[key] !== "boolean") throw new Error(`Draw Things 参数“${key}”必须是布尔值`);
  }
  if (parameters.upscaler !== undefined && parameters.upscaler !== null && (typeof parameters.upscaler !== "string" || !parameters.upscaler.trim())) throw new Error("Draw Things 参数“upscaler”必须是字符串或 null");
  if (parameters.negative_prompt !== undefined && typeof parameters.negative_prompt !== "string") throw new Error("Draw Things 参数“negative_prompt”必须是字符串");
  if (parameters.guidance_scale !== undefined && parameters.cfg_scale !== undefined) throw new Error("Draw Things 参数不能同时设置 guidance_scale 和 cfg_scale");
  if (parameters.loras !== undefined && (!Array.isArray(parameters.loras) || parameters.loras.some(item => {
    const lora = object(item);
    return typeof lora.name !== "string" || !lora.name.trim() || (lora.weight !== undefined && (typeof lora.weight !== "number" || !Number.isFinite(lora.weight) || lora.weight < 0 || lora.weight > 2));
  }))) throw new Error("Draw Things 参数“loras”必须是 [{name, weight}] 数组");
  return parameters;
}

export function validateDrawThingsParameters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Draw Things 参数必须是 JSON 对象");
  return validateParameters(value as Record<string, unknown>);
}

function modelParameters(value: unknown): Record<string, unknown> {
  return value === undefined ? {} : validateDrawThingsParameters(value);
}

function requestTimeoutMinutes(value: unknown) {
  const minutes = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 10;
}

function apiBaseUrl(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "http://127.0.0.1:7888";
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("Draw Things 地址无效"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Draw Things 地址必须是无凭据或片段的 HTTP/HTTPS 地址");
  return raw.replace(/\/$/, "");
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
  if (model === "qwen_image_2.1_i8x.ckpt" || model === "qwen_image_2.1_turbo_i8x.ckpt") {
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

function getPreset(model: string) {
  const preset = modelPresets[model];
  if (!model) return { type: "image", steps: 20, cfg: 4 } satisfies ModelPreset;
  if (!preset && /\.(?:ckpt|safetensors)$/i.test(model)) return { type: "image", steps: 20, cfg: 4 } satisfies ModelPreset;
  if (!preset) throw new Error(`Draw Things 未配置图片模型“${model}”的参数`);
  return preset;
}

async function responseErrorMessage(context: ProviderContext, response: Response) {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    const value = /json/i.test(contentType) ? await response.clone().json() : await response.clone().text();
    return context.tool.errorMessage(value);
  } catch { return ""; }
}

function apiError(message: string) {
  return Object.assign(new Error(message), { name: "DrawThingsApiError" });
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
    if (!response.ok) {
      const detail = await responseErrorMessage(context, response);
      throw apiError(`Draw Things ${mediaType === "image" ? "图片" : "视频"}请求失败：HTTP ${response.status}${detail ? `：${detail}` : ""}`);
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType?.startsWith(`${mediaType}/`)) {
      return [{ mediaType, type: "binary", mimeType: contentType, data: new Uint8Array(await response.arrayBuffer()) } satisfies MediaAsset];
    }
    const result = await response.json() as unknown;
    const found = findAsset(result, mediaType);
    if (!found) throw apiError(`Draw Things 未返回已编码${mediaType === "image" ? "图片" : "视频"}`);
    return [found];
  } catch (error) {
    if (context.signal?.aborted) throw error;
    if (timeoutSignal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      throw new Error(`Draw Things 请求超时（${timeout / 60_000} 分钟），请在媒体供应商配置中增加请求超时时间`);
    }
    if (error instanceof Error && error.name === "DrawThingsApiError") throw error;
    if (error instanceof SyntaxError) throw apiError("Draw Things 返回了无效的 JSON 响应");
    throw new Error(`无法连接 Draw Things Local API：${error instanceof Error ? error.message : String(error)}`);
  }
}

export default {
  id: "drawThings",
  label: "Draw Things Local",
  version,
  readme: "Draw Things Local API 图片供应商。请先开启 Local API Server。Draw Things 不提供模型列表接口：本机地址可从注册表和 Models 目录读取已安装模型，远程地址请手动填写模型 ID。当前仅开放图片模型。供应商级额外请求参数填写 JSON 对象，例如 {\"seed\":123456}；编辑具体模型时，还可以配置该模型专用参数，模型参数优先于供应商级参数。请求默认超时 10 分钟，可在编辑窗口调整，最长 24 小时。",
  rules,
  models: [],
  async healthCheck() {
    const baseUrl = apiBaseUrl(this.config.baseUrl);
    let response: Response | undefined;
    let lastError: unknown;
    for (const path of ["/", "/sdapi/v1/options"]) {
      try {
        response = await this.tool.fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          let currentModel = "";
          try {
            const value = await response.clone().json() as unknown;
            const model = object(value).model;
            if (typeof model === "string") currentModel = model.trim();
          } catch { /* ACT: HTTP 可达即可判断连接成功。 */ }
          return { reachable: true, message: currentModel ? `Draw Things 已连接，当前模型：${currentModel}` : "Draw Things 已连接" };
        }
      } catch (error) { lastError = error; }
    }
    return { reachable: false, message: response ? `Draw Things 接口返回 HTTP ${response.status}` : `无法连接 Draw Things Local API：${lastError instanceof Error ? lastError.message : String(lastError ?? "未知错误")}` };
  },
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    const model = request.model?.trim() ?? "";
    const preset = getPreset(model);
    const size = dimensions(model, request.ratio, request.size);
    const parameters = {
      ...preset.parameters,
      ...extraParameters(this.config.extraParameters),
      ...modelParameters(request.other?.modelParameters),
    };
    if (request.images?.length && parameters.guidance_scale !== undefined && parameters.cfg_scale !== undefined) {
      throw new Error("Draw Things 图生图不能同时设置 guidance_scale 和 cfg_scale");
    }
    const body: Record<string, unknown> = {
      negative_prompt: "", steps: preset.steps,
      ...(request.images?.length
        ? { cfg_scale: parameters.guidance_scale === undefined && parameters.cfg_scale === undefined ? preset.cfg : undefined }
        : { guidance_scale: parameters.guidance_scale === undefined && parameters.cfg_scale === undefined ? preset.cfg : undefined }),
      ...parameters,
      prompt: request.prompt, ...(model ? { model } : {}), width: size.width, height: size.height, batch_size: 1,
    };
    if (body.cfg_scale === undefined) delete body.cfg_scale;
    if (body.guidance_scale === undefined) delete body.guidance_scale;
    if (request.images?.length) body.init_images = request.images.map(mediaUrl);
    return requestMedia(this, apiBaseUrl(this.config.baseUrl), request.images?.length ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img", body, "image");
  },
} satisfies ProviderDefinition<typeof rules>;
