import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({ baseUrl: z.string().trim().min(1).max(2048).optional() }, "query"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.json(success(await u.mediaProvider.listDrawThingsModels(req.query.baseUrl as string | undefined)));
});
