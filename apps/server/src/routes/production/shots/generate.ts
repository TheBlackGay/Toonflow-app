import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { canTransitionShotStatus, mediaTypeSchema } from "@/utils/production/contracts";

export default Router().post("/", validateFields({ directory: z.string().min(1).max(4096), shotIds: z.array(z.uuid()).min(1).max(1000), providerId: z.string().regex(/^[a-z][a-zA-Z0-9]{0,95}$/), modelId: z.string().trim().min(1).max(256), mediaType: z.enum(["image", "video", "audio"]).optional() }), async (req, res) => {
  const directory = await u.workspace.resolveWorkspace(req, req.body.directory);
  const mediaType = req.body.mediaType ? mediaTypeSchema.parse(req.body.mediaType) : undefined;
  const model = (await u.mediaGeneration.listMediaModels()).find(item => item.providerId === req.body.providerId && item.modelId === req.body.modelId && (!mediaType || item.type === mediaType));
  if (!model) throw Object.assign(new Error("所选媒体 Provider 或模型不存在，或模型类型不匹配"), { status: 400 });
  const manifest = await u.production.readProductionManifest(directory);
  const selected = new Set(req.body.shotIds as string[]);
  const chosen = manifest.shots.filter(shot => selected.has(shot.id));
  if (chosen.length !== selected.size) throw Object.assign(new Error("部分镜头不存在"), { status: 404 });
  const created: { shotId: string; taskId: string }[] = [];
  for (const shot of chosen) {
    const shotMediaType = mediaType ?? shot.mediaType ?? model.type;
    if (shotMediaType !== model.type || !canTransitionShotStatus(shot.status, "generating")) {
      throw Object.assign(new Error(`镜头“${shot.title}”当前状态或媒体类型不允许生成`), { status: 409 });
    }
    const task = await u.mediaTasks.createMediaTask(directory, shotMediaType, {
      providerId: req.body.providerId, modelId: req.body.modelId, prompt: shot.prompt,
      outputDirectory: shot.outputDirectory ?? `assets/production/${shot.id}`,
      ...(shot.duration ? { duration: shot.duration } : {}),
    });
    shot.providerId = req.body.providerId;
    shot.modelId = req.body.modelId;
    shot.mediaType = shotMediaType;
    shot.taskId = task.id;
    shot.status = "generating";
    created.push({ shotId: shot.id, taskId: task.id });
  }
  await u.production.writeProductionManifest(directory, manifest);
  res.status(202).json(success({ tasks: created, manifest }));
});
