import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { canTransitionShotStatus, validateProductionManifest } from "@/utils/production/contracts";

export default Router().put("/", validateFields({ directory: z.string().min(1).max(4096), shots: z.array(z.unknown()).max(10000) }), async (req, res) => {
  const directory = await u.workspace.resolveWorkspace(req, req.body.directory);
  const shots = req.body.shots.map((value: unknown) => u.production.validateShot(value)).sort((left: { order: number }, right: { order: number }) => left.order - right.order);
  const manifest = validateProductionManifest({ version: 1, updatedAt: new Date().toISOString(), shots });
  const current = await u.production.readProductionManifest(directory);
  for (const shot of manifest.shots) {
    const previous = current.shots.find(item => item.id === shot.id);
    if (previous && !canTransitionShotStatus(previous.status, shot.status)) {
      throw Object.assign(new Error(`镜头状态不能从 ${previous.status} 变更为 ${shot.status}`), { status: 409 });
    }
  }
  res.json(success(await u.production.writeProductionManifest(directory, manifest)));
});
