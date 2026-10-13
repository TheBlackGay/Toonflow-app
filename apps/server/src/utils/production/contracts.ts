import { z } from "zod";

export const mediaTypeSchema = z.enum(["image", "video", "audio"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const shotStatusSchema = z.enum(["draft", "queued", "generating", "review", "approved", "needsRedo", "completed"]);
export type ShotStatus = z.infer<typeof shotStatusSchema>;

export const mediaTaskStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type MediaTaskStatus = z.infer<typeof mediaTaskStatusSchema>;

export const exportTaskStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type ExportTaskStatus = z.infer<typeof exportTaskStatusSchema>;

export const workspaceRelativePathSchema = z.string().trim().min(1).max(4096).refine(
  value => !/^[\\/]|[:\u0000-\u001f]/.test(value) && value.split(/[\\/]/).every(part => part && part !== "." && part !== ".."),
  "路径必须是工作区内的相对路径",
);

const providerIdSchema = z.string().trim().regex(/^[a-z][a-zA-Z0-9]{0,95}$/, "供应商 ID 无效");
const modelIdSchema = z.string().trim().min(1).max(256);

export const productionShotSchema = z.object({
  id: z.string().trim().min(1).max(128),
  order: z.number().int().min(0).max(100000),
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(100000),
  status: shotStatusSchema,
  providerId: providerIdSchema.optional(),
  modelId: modelIdSchema.optional(),
  mediaType: mediaTypeSchema.optional(),
  taskId: z.uuid().optional(),
  outputDirectory: workspaceRelativePathSchema.optional(),
  outputPath: workspaceRelativePathSchema.optional(),
  model: modelIdSchema.optional(),
  duration: z.number().finite().positive().max(3600).optional(),
});
export type ProductionShot = z.infer<typeof productionShotSchema>;

export const productionManifestSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().trim().min(1),
  exportedPath: workspaceRelativePathSchema.optional(),
  shots: z.array(productionShotSchema).max(10000),
}).superRefine((manifest, context) => {
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const [index, shot] of manifest.shots.entries()) {
    if (ids.has(shot.id)) context.addIssue({ code: "custom", path: ["shots", index, "id"], message: "镜头 id 不能重复" });
    if (orders.has(shot.order)) context.addIssue({ code: "custom", path: ["shots", index, "order"], message: "镜头 order 不能重复" });
    ids.add(shot.id);
    orders.add(shot.order);
  }
});
export type ProductionManifest = z.infer<typeof productionManifestSchema>;

const allowedTransitions: Record<ShotStatus, readonly ShotStatus[]> = {
  draft: ["queued", "generating"],
  queued: ["generating", "draft"],
  generating: ["review", "needsRedo", "draft"],
  review: ["approved", "needsRedo", "generating"],
  approved: ["completed", "needsRedo", "generating"],
  needsRedo: ["queued", "generating", "draft"],
  completed: ["needsRedo", "generating"],
};

export function canTransitionShotStatus(from: ShotStatus, to: ShotStatus) {
  return from === to || allowedTransitions[from].includes(to);
}

function contractError(message: string, cause?: unknown) {
  return Object.assign(new Error(message, cause instanceof Error ? { cause } : undefined), { status: 400 });
}

export function validateProductionShot(value: unknown): ProductionShot {
  const result = productionShotSchema.safeParse(value);
  if (!result.success) throw contractError(result.error.issues[0]?.message || "镜头数据无效");
  return result.data;
}

export function validateProductionManifest(value: unknown): ProductionManifest {
  const result = productionManifestSchema.safeParse(value);
  if (!result.success) throw contractError(result.error.issues[0]?.message || "生产清单格式无效");
  return result.data;
}
