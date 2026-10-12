import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", validateFields({ providerId: z.string().regex(/^[a-z][a-zA-Z0-9]{0,95}$/), modelId: z.string().trim().min(1).max(256).optional(), baseUrl: z.string().trim().min(1).max(2048).optional() }, "query"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const providerInfo = await u.mediaProvider.getMediaProvider(req.query.providerId as string);
  const modelId = req.query.modelId as string | undefined;
  const baseUrl = req.query.baseUrl as string | undefined;
  const model = modelId ? providerInfo.models.find(item => item.id === modelId) : undefined;
  if (modelId && !model) { res.status(404).json({ code: 404, data: null, message: "媒体模型不存在" }); return; }
  const configurations = u.conf.get("settings", {}).mediaProviderConfigs;
  const config = configurations && typeof configurations === "object" && !Array.isArray(configurations)
    ? (configurations as Record<string, unknown>)[providerInfo.id] : undefined;
  const provider = await u.mediaProvider.loadMediaProviderSource(providerInfo.source, config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {});
  if (providerInfo.id === "drawThings") {
    const configuredBaseUrl = typeof config === "object" && config && typeof (config as Record<string, unknown>).baseUrl === "string"
      ? String((config as Record<string, unknown>).baseUrl) : undefined;
    const health = await u.mediaProvider.checkDrawThingsConnection(baseUrl ?? configuredBaseUrl);
    res.json(success({ providerId: providerInfo.id, modelId, model, ...health, capabilityKnown: true, modelAvailable: undefined }));
    return;
  }
  if (!provider.healthCheck) {
    res.json(success({ providerId: providerInfo.id, modelId, model, reachable: true, capabilityKnown: false, message: "供应商未声明健康检查" }));
    return;
  }
  const health = await provider.healthCheck();
  const modelAvailable = modelId && health.models?.length ? health.models.includes(modelId) : undefined;
  res.json(success({ providerId: providerInfo.id, modelId, model, ...health, modelAvailable, capabilityKnown: true }));
});
