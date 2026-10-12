<template>
  <el-dialog
    v-model="visible"
    :title="`编辑媒体供应商：${provider?.label ?? ''}`"
    width="min(800px, calc(100vw - 32px))"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false"
    :closeOnPressEscape="!saving"
    :showClose="!saving">
    <div class="providerEditor">
      <messageMarkdown v-if="provider?.readme" class="providerReadme" :content="provider.readme" />
      <el-form labelPosition="top" :disabled="saving">
        <el-form-item v-if="hasApiKeyRule" label="API Key">
          <el-input v-model="apiKey" :prefixIcon="IconKey" type="password" dir="ltr" showPassword autocomplete="off" aria-label="媒体供应商 API Key" />
        </el-form-item>
        <el-form-item v-if="provider?.id === 'drawThings'" label="Draw Things 地址">
          <el-input v-model="baseUrl" dir="ltr" placeholder="http://127.0.0.1:7888" aria-label="Draw Things 地址" />
          <el-button class="connectionButton" :icon="IconRefresh" :loading="testingConnection" :disabled="saving" @click="testConnection">测试连接</el-button>
        </el-form-item>
        <el-form-item v-if="provider?.id === 'drawThings'">
          <template #label>
            <span class="fieldLabel">额外请求参数</span>
            <el-tooltip content="填写 JSON 对象，会合并到 Draw Things 的图片请求中。例如 {&quot;seed&quot;:123456,&quot;negative_prompt&quot;:&quot;low quality&quot;}。prompt、model、width、height 和 batch_size 由 Toonflow 控制。" placement="top" :showArrow="false">
              <icon-help class="fieldHelp" :size="16" aria-label="额外请求参数说明" />
            </el-tooltip>
          </template>
          <el-input v-model="extraParameters" type="textarea" :rows="5" dir="ltr" placeholder='{&quot;seed&quot;: 123456}' aria-label="Draw Things 额外请求参数" />
        </el-form-item>
        <el-form-item v-if="provider?.id === 'drawThings'">
          <template #label>
            <span class="fieldLabel">请求超时（分钟）</span>
            <el-tooltip content="Draw Things 单次图片请求的最长等待时间，默认 10 分钟，范围 1 分钟到 24 小时。" placement="top" :showArrow="false">
              <icon-help class="fieldHelp" :size="16" aria-label="请求超时说明" />
            </el-tooltip>
          </template>
          <el-input-number v-model="requestTimeoutMinutes" :min="1" :max="1440" :step="1" controlsPosition="right" aria-label="Draw Things 请求超时时间" />
        </el-form-item>
      </el-form>
      <form-create v-if="customRules.length" v-model="customFormValues" v-model:api="customFormApi" :rule="customRules" :option="formOptions" />
      <div class="modelHeader">
        <h4>模型配置 <el-text type="info">{{ models.length }}</el-text></h4>
        <el-button :icon="IconPlus" size="small" :disabled="saving" @click="editModel()">手动添加</el-button>
      </div>
      <div class="modelList">
        <el-card v-for="(item, index) in models" :key="index" class="modelCard" shadow="never">
          <div class="topInfo">
            <div class="modelNameWrap">
              <modelIcon :model="item.id" :size="24" />
              <div class="modelInfo">
                <span class="modelName">{{ item.label }}</span>
                <el-text class="modelId" type="info" size="small">{{ item.id }}</el-text>
              </div>
            </div>
            <div class="actionButtons">
              <el-button text size="small" :icon="IconEdit" :disabled="saving" :aria-label="`编辑模型 ${item.label}`" @click="editModel(index)">编辑</el-button>
              <el-button text size="small" type="danger" :icon="IconTrash" :disabled="saving" :aria-label="`删除模型 ${item.label}`" @click="models.splice(index, 1)">删除</el-button>
            </div>
          </div>
          <div class="modelTags">
            <el-tag size="small">{{ modelTypes[item.type] }}</el-tag>
            <el-tag v-for="(tag, tagIndex) in modelTags(item)" :key="tagIndex" size="small" type="info">{{ tag }}</el-tag>
          </div>
        </el-card>
        <el-text v-if="!models.length" type="info">暂无模型</el-text>
      </div>
    </div>
    <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :icon="IconDeviceFloppy" :loading="saving" @click="saveModels">保存</el-button>
    </template>
    <component
      :is="modelEditorDialog"
      v-model="modelEditorVisible"
      :model="editingModelIndex === undefined ? undefined : models[editingModelIndex]"
      :models="models"
      :providerId="provider?.id"
      @confirmed="confirmModel" />
  </el-dialog>
</template>

<script setup lang="ts">
import { translate } from "@toonflow/i18n/vue";

import axios from "axios";
import { computed, defineAsyncComponent, ref, shallowRef, watch, type Component } from "vue";
import { IconPlus, IconTrash, IconDeviceFloppy, IconEdit, IconKey, IconHelp, IconRefresh } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import formCreate, { type Api, type Options } from "../../formCreate";
import { modelIcon } from "@toonflow/model-icons";
import { validateDrawThingsParameters } from "@toonflow/providers/media/drawThings";
import messageMarkdown from "@/components/messageMarkdown.vue";
import type { MediaProvider, MediaProviderModel } from "./types";
import { reloadSettings, settings } from "@/stores/settings";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";

const { provider } = defineProps<{ provider?: MediaProvider }>();
const modelEditorDialog = shallowRef<Component>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ saved: [provider: MediaProvider] }>();
const models = ref<MediaProviderModel[]>([]);
const modelEditorVisible = ref(false);
const editingModelIndex = ref<number>();
const saving = ref(false);
const testingConnection = ref(false);
const apiKey = ref("");
const baseUrl = ref("");
const extraParameters = ref("");
const requestTimeoutMinutes = ref(10);
const customFormApi = shallowRef<Api>();
const customFormValues = ref<Record<string, unknown>>({});
const revision = ref("");
const formError = ref("");
const modelTypes = { get image() { return translate("图片"); }, get video() { return translate("视频"); }, get audio() { return translate("音频"); }, get text() { return translate("文本"); } };
const modeLabels: Record<string, string> = {
  singleImage: "单图参考", multiReference: "多图参考", startEndRequired: "首尾帧必填",
  endFrameOptional: "尾帧可选", startFrameOptional: "首帧可选",
  imageReference: "图片参考", videoReference: "视频参考", audioReference: "音频参考",
};
const builtInFields = computed(() => new Set(["apiKey", ...(provider?.id === "drawThings" ? ["baseUrl", "extraParameters", "requestTimeoutMinutes"] : [])]));
const hasApiKeyRule = computed(() => provider?.rules ? provider.rules.some(rule => rule.field === "apiKey") : provider?.id !== "drawThings");
const customRules = computed(() => formCreate.copyRules((provider?.rules ?? []).filter(rule => !builtInFields.value.has(rule.field))));
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", disabled: saving.value }, submitBtn: false, resetBtn: false }));

watch(visible, isVisible => {
  if (!isVisible) return;
  formError.value = "";
  modelEditorVisible.value = false;
  editingModelIndex.value = undefined;
  customFormApi.value = undefined;
  const configs = settings.value.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
  const configuredKey = provider && configs?.[provider.id]?.apiKey;
  apiKey.value = typeof configuredKey === "string" ? configuredKey : "";
  const configuredBaseUrl = provider && configs?.[provider.id]?.baseUrl;
  baseUrl.value = typeof configuredBaseUrl === "string" ? configuredBaseUrl : "http://127.0.0.1:7888";
  const configuredExtraParameters = provider && configs?.[provider.id]?.extraParameters;
  extraParameters.value = typeof configuredExtraParameters === "string" ? configuredExtraParameters : "";
  const configuredRequestTimeout = provider && configs?.[provider.id]?.requestTimeoutMinutes;
  requestTimeoutMinutes.value = typeof configuredRequestTimeout === "number" && Number.isInteger(configuredRequestTimeout) && configuredRequestTimeout >= 1 && configuredRequestTimeout <= 1440 ? configuredRequestTimeout : 10;
  const currentConfig = provider && configs?.[provider.id];
  customFormValues.value = Object.fromEntries((provider?.rules ?? [])
    .filter(rule => !builtInFields.value.has(rule.field))
    .map(rule => [rule.field, currentConfig?.[rule.field] ?? rule.value]));
  revision.value = provider?.revision ?? "";
  models.value = JSON.parse(JSON.stringify(provider?.models ?? []));
}, { immediate: true });

function modelTags(model: MediaProviderModel) {
  const modes = Array.isArray(model.mode) ? model.mode.flat().filter((mode): mode is string => typeof mode === "string") : [];
  return modes.map(mode => {
    if (mode === "text") return model.type === "image" ? translate("文生图") : translate("文生视频");
    const reference = /^(imageReference|videoReference|audioReference):(\d+)$/.exec(mode);
    return reference ? `${modeLabels[reference[1]!]} ×${reference[2]}` : modeLabels[mode] ?? mode;
  });
}

function editModel(index?: number) {
  modelEditorDialog.value ??= defineAsyncComponent(() => import("./modelEditorDialog.vue"));
  editingModelIndex.value = index;
  modelEditorVisible.value = true;
}

function confirmModel(model: MediaProviderModel) {
  const index = editingModelIndex.value;
  if (index === undefined) models.value.push(model);
  else models.value.splice(index, 1, model);
}

async function testConnection() {
  if (testingConnection.value || provider?.id !== "drawThings") return;
  testingConnection.value = true;
  formError.value = "";
  try {
    const value = baseUrl.value.trim();
    const { data } = await axios.get<{ code: number; data: { reachable: boolean; message?: string }; message?: string }>("/api/providers/media/health", {
      params: { providerId: "drawThings", ...(value ? { baseUrl: value } : {}) },
      headers: { "x-toonflow-workspace": "1" },
    });
    if (data.code !== 200 || !data.data?.reachable) throw new Error(data.data?.message || data.message || "连接测试失败");
    ElMessage.success(data.data.message || "Draw Things 已连接");
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "连接测试失败";
    ElMessage.error(message);
  } finally {
    testingConnection.value = false;
  }
}

async function saveModels() {
  if (saving.value || !provider) return;
  const { id: providerId, fileName } = provider;
  formError.value = "";
  let modelsSaved = false;
  let configSaved = false;
  try {
    const ids = new Set<string>();
    const values = models.value.map((item, index) => {
      const id = item.id.trim();
      const label = item.label.trim();
      if (!id || !label) throw new Error(`请填写第 ${index + 1} 个模型的 ID 和显示名称`);
      if (ids.has(id)) throw new Error(`模型 ID 重复：${id}`);
      ids.add(id);
      return { ...item, id, label };
    });
    if (apiKey.value.length > 8192) throw new Error("API Key 过长");
    if (providerId === "drawThings") {
      let url: URL;
      try { url = new URL(baseUrl.value.trim()); }
      catch { throw new Error("Draw Things 地址无效"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Draw Things 地址必须是无凭据或片段的 HTTP/HTTPS 地址");
    }
    if (providerId === "drawThings" && extraParameters.value.trim()) {
      const parsed = JSON.parse(extraParameters.value) as unknown;
      validateDrawThingsParameters(parsed);
      if (extraParameters.value.length > 100000) throw new Error("Draw Things 额外请求参数过长");
    }
    if (providerId === "drawThings" && (!Number.isInteger(requestTimeoutMinutes.value) || requestTimeoutMinutes.value < 1 || requestTimeoutMinutes.value > 1440)) throw new Error("Draw Things 请求超时时间必须是 1 到 1440 分钟的整数（最长 24 小时）");
    saving.value = true;
    if (customFormApi.value && !(await customFormApi.value.validate().catch(() => false))) return;
    const nextKey = apiKey.value.trim();
    const customValues = customFormApi.value?.formData() ?? customFormValues.value;
    const configs = settings.value.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
    if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
    const current = configs?.[providerId];
    if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) throw new Error("当前供应商配置格式无效");
    const nextBaseUrl = providerId === "drawThings" ? baseUrl.value.trim().replace(/\/$/, "") : undefined;
    const nextExtraParameters = providerId === "drawThings" ? extraParameters.value.trim() : undefined;
    const nextRequestTimeout = providerId === "drawThings" ? requestTimeoutMinutes.value : undefined;
    const nextConfig = { ...current, ...customValues, ...(hasApiKeyRule.value ? { apiKey: nextKey } : {}), ...(providerId === "drawThings" ? { baseUrl: nextBaseUrl, extraParameters: nextExtraParameters, requestTimeoutMinutes: nextRequestTimeout } : {}) };
    const configChanged = JSON.stringify(current ?? {}) !== JSON.stringify(nextConfig);
    const { data } = await axios.put<{ code: number; data: MediaProvider; message?: string }>("/api/providers/media/save", {
      fileName, revision: revision.value, models: values, ...(configChanged ? { config: nextConfig } : {}),
    }, { headers: { "x-toonflow-workspace": "1" } });
    if (data.code !== 200 || !data.data) throw new Error(data.message || "保存模型失败");
    revision.value = data.data.revision;
    modelsSaved = true;
    configSaved = true;
    await reloadSettings();
    invalidateNodeModels("media");
    const response = await axios.get<{ code: number; data: MediaProvider[]; message?: string }>("/api/providers/media/list", { headers: { "x-toonflow-workspace": "1" } });
    if (response.data.code !== 200 || !Array.isArray(response.data.data)) throw new Error(response.data.message || "读取最新模型失败");
    const latest = response.data.data.find(item => item.fileName === fileName);
    if (!latest) throw new Error("供应商已不存在");
    revision.value = latest.revision;
    emit("saved", latest);
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "保存失败，请重试";
    formError.value = configSaved ? `模型与连接配置已保存，读取最新模型失败：${message}。请重新打开编辑。`
      : modelsSaved ? `模型已保存，连接配置未保存：${message}。填写内容已保留，请重试。` : message;
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.providerEditor {
  max-height: 65dvh;
  padding: 8px 4px;
  overflow-y: auto;
  overscroll-behavior: contain;

  .providerReadme { margin-bottom: 20px; }

  .fieldLabel {
    margin-right: 6px;
  }

  .connectionButton {
    margin-top: 8px;
  }

  .fieldHelp {
    vertical-align: -3px;
    color: var(--el-text-color-secondary);
    cursor: help;
  }

  .modelHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;

    h4 { margin: 0; }
  }

  .modelList {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .modelCard {
      .topInfo {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;

        .modelNameWrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;

          .modelInfo {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            overflow-wrap: anywhere;

            .modelName { font-size: 15px; font-weight: 600; }
            .modelId { align-self: flex-start; }
          }
        }

        .actionButtons {
          display: flex;
          flex-shrink: 0;
          margin-left: auto;
        }
      }

      .modelTags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }
    }
  }
}

.formError { margin-top: 16px; }
</style>
