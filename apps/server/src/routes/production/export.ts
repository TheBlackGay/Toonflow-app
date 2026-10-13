import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ directory: z.string().min(1).max(4096), outputPath: z.string().min(1).max(4096), inputPaths: z.array(z.string().min(1).max(4096)).min(1).max(1000) }), async (req, res) => {
  const directory = await u.workspace.resolveWorkspace(req, req.body.directory);
  const manifestInputs = u.production.getProductionExportInputs(await u.production.readProductionManifest(directory));
  if (manifestInputs.length !== req.body.inputPaths.length || manifestInputs.some((path, index) => path !== req.body.inputPaths[index])) {
    throw Object.assign(new Error("导出片段必须完整覆盖当前生产清单，并按镜头顺序提交"), { status: 409 });
  }
  await u.ffmpeg.createWorkspaceFfmpeg(directory);
  res.status(202).json(success(await u.production.createExportTask(directory, req.body.outputPath, req.body.inputPaths)));
});
