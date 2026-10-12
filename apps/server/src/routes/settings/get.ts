import u from "@/utils";
import { Router } from "express";
import { createHash } from "node:crypto";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store");
  const settings = u.conf.get("settings", {});
  res.set("ETag", createHash("sha256").update(JSON.stringify(settings)).digest("hex"));
  res.json(success(settings));
});
