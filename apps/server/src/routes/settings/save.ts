import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { maxSystemPromptLength } from "@/agent/runtime/prompt";
import { t } from "@/lib/i18n";
import { createHash } from "node:crypto";

const router = Router();

export default router.put("/", validateFields({ revision: z.string().regex(/^[a-f0-9]{64}$/).optional(), settings: z.record(z.string(), z.json()).and(z.object({
  agentSystemPrompt: z.string().max(maxSystemPromptLength, { error: () => t`系统提示词不能超过 ${maxSystemPromptLength} 个字符` }).optional(),
  desktopUpdateSource: z.enum(["official", "github", "custom"]).optional(),
  desktopUpdateCustomUrl: z.string().max(2048).refine(value => !value || u.desktop.isValidUpdateUrl(value),
    "自定义更新源必须是不含账号、查询参数或锚点的 HTTP(S) 地址").optional(),
  mcp: z.object({ enabled: z.boolean().optional(), token: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
})).refine(value => value.desktopUpdateSource !== "custom" || !!value.desktopUpdateCustomUrl, {
  path: ["desktopUpdateCustomUrl"], message: "选择自定义更新源前，请先填写有效地址",
}) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { settings, revision } = req.body;
  u.removeLegacySettings(settings);
  const previousSettings = u.conf.get("settings", {});
  const currentRevision = createHash("sha256").update(JSON.stringify(previousSettings)).digest("hex");
  if (revision && revision !== currentRevision) {
    res.status(409).json(error("设置已被其他页面修改，请刷新后再保存", { code: "SETTINGS_CONFLICT" }, 409));
    return;
  }
  u.conf.set("settings", settings);
  const [models] = await Promise.all([u.ai.refreshProviderModels(previousSettings), u.mcpRuntime.reloadMcpRuntime()]);
  const nextSettings = u.conf.get("settings", {});
  res.set("ETag", createHash("sha256").update(JSON.stringify(nextSettings)).digest("hex"));
  res.json(success(models, "设置已保存"));
});
