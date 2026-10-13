import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { canTransitionShotStatus } from "@/utils/production/contracts";

export default Router().patch("/", validateFields({ directory: z.string().min(1).max(4096), shot: z.unknown() }), async (req, res) => {
  const directory = await u.workspace.resolveWorkspace(req, req.body.directory);
  const shot = u.production.validateShot(req.body.shot);
  let missing = false;
  const manifest = await u.production.updateProductionManifest(directory, current => {
    const index = current.shots.findIndex(item => item.id === shot.id);
    if (index < 0) { missing = true; return; }
    if (!canTransitionShotStatus(current.shots[index]!.status, shot.status)) {
      throw Object.assign(new Error(`镜头状态不能从 ${current.shots[index]!.status} 变更为 ${shot.status}`), { status: 409 });
    }
    current.shots[index] = shot;
    current.shots.sort((left, right) => left.order - right.order);
  });
  if (missing) { res.status(404).json({ code: 404, data: null, message: "镜头不存在" }); return; }
  res.json(success(manifest));
});
