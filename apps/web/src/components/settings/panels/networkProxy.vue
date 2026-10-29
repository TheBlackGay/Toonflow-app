<template>
  <section class="proxyCard" aria-labelledby="outboundProxyTitle">
    <button class="proxyHeader" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="proxyIcon"><icon-world :size="24" aria-hidden="true" /></span>
      <span class="proxyHeading">
        <strong id="outboundProxyTitle">全局出站代理</strong>
        <span>配置 Toonflow 访问外部 API 时使用的代理</span>
      </span>
      <icon-chevron-up v-if="expanded" class="proxyChevron" :size="20" aria-hidden="true" />
      <icon-chevron-down v-else class="proxyChevron" :size="20" aria-hidden="true" />
    </button>

    <div v-show="expanded" class="proxyBody">
      <p class="proxyDescription">代理所有请求（API、Skills 下载等）。开启本地路由时，应用的请求也会经过此代理。留空表示直连。</p>
      <div class="proxyAddressRow">
        <el-input v-model="proxyDraft" class="proxyAddress" :disabled="!editing" type="text" dir="ltr" aria-label="代理地址" placeholder="socks5://127.0.0.1:1080" />
        <el-button class="iconButton" :disabled="!proxyDraft" aria-label="测试代理地址" title="测试代理地址" @click="testProxy"><icon-search :size="20" /></el-button>
        <el-button class="iconButton" :aria-label="editing ? '取消编辑' : '编辑代理配置'" :title="editing ? '取消编辑' : '编辑代理配置'" @click="toggleEditing"><icon-pencil :size="20" /></el-button>
        <el-button class="iconButton" :disabled="!proxyDraft && !usernameDraft && !passwordDraft" aria-label="清空代理配置" title="清空代理配置" @click="clearProxy"><icon-x :size="20" /></el-button>
        <el-button type="primary" :disabled="!editing" :loading="saving" @click="saveProxy">保存</el-button>
      </div>
      <div class="credentialRow">
        <el-input v-model="usernameDraft" :disabled="!editing" dir="ltr" aria-label="代理用户名" placeholder="用户名（可选）" />
        <el-input v-model="passwordDraft" :disabled="!editing" dir="ltr" type="password" showPassword autocomplete="off" aria-label="代理密码" placeholder="密码（可选）" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { IconChevronDown, IconChevronUp, IconPencil, IconSearch, IconWorld, IconX } from "@tabler/icons-vue";
import { saveSettings, settings } from "@/stores/settings";

function readNetwork() {
  const raw = settings.value.network;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function readDraft() {
  const network = readNetwork();
  const rawProxy = typeof network.outboundProxy === "string" ? network.outboundProxy : "";
  try {
    const url = rawProxy ? new URL(rawProxy) : undefined;
    if (url) {
      const username = typeof network.outboundProxyUsername === "string" ? network.outboundProxyUsername : decodeURIComponent(url.username);
      const password = typeof network.outboundProxyPassword === "string" ? network.outboundProxyPassword : decodeURIComponent(url.password);
      url.username = "";
      url.password = "";
      return { proxy: url.href, username, password };
    }
  } catch { /* 保存的旧值由服务端负责提示并禁用。 */ }
  return {
    proxy: rawProxy,
    username: typeof network.outboundProxyUsername === "string" ? network.outboundProxyUsername : "",
    password: typeof network.outboundProxyPassword === "string" ? network.outboundProxyPassword : "",
  };
}

const initial = readDraft();
const expanded = ref(true);
const editing = ref(false);
const saving = ref(false);
const proxyDraft = ref(initial.proxy);
const usernameDraft = ref(initial.username);
const passwordDraft = ref(initial.password);

function toggleEditing() {
  if (editing.value) {
    const current = readDraft();
    proxyDraft.value = current.proxy;
    usernameDraft.value = current.username;
    passwordDraft.value = current.password;
  }
  editing.value = !editing.value;
}

function clearProxy() {
  proxyDraft.value = "";
  usernameDraft.value = "";
  passwordDraft.value = "";
  editing.value = true;
}

function testProxy() {
  try {
    const url = new URL(proxyDraft.value.trim());
    if (!["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol) || !url.hostname) throw new Error();
    ElMessage.success("代理地址格式有效");
  } catch {
    ElMessage.error("代理地址格式无效");
  }
}

async function saveProxy() {
  saving.value = true;
  try {
    await saveSettings(current => {
      const network = current.network && typeof current.network === "object" && !Array.isArray(current.network) ? current.network as Record<string, unknown> : {};
      return { network: { ...network, outboundProxy: proxyDraft.value.trim(), outboundProxyUsername: usernameDraft.value, outboundProxyPassword: passwordDraft.value } };
    });
    editing.value = false;
    ElMessage.success("代理配置已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "代理配置保存失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.proxyCard {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  background: var(--el-bg-color);

  .proxyHeader {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 22px 24px;
    border: 0;
    background: transparent;
    color: var(--el-text-color-primary);
    text-align: start;
    cursor: pointer;

    .proxyIcon { display: inline-flex; color: var(--el-color-primary); }

    .proxyHeading {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 4px;

      strong { font-size: 18px; }
      span { color: var(--el-text-color-secondary); font-size: 14px; }
    }

    .proxyChevron { flex-shrink: 0; }
  }

  .proxyBody {
    padding: 0 24px 24px;

    .proxyDescription {
      margin: 4px 0 18px;
      color: var(--el-text-color-secondary);
      font-size: 14px;
      line-height: 1.6;
    }

    .proxyAddressRow,
    .credentialRow {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .credentialRow { margin-top: 14px; }
    .proxyAddress { flex: 1; }

    .iconButton {
      width: 42px;
      height: 42px;
      padding: 0;
      flex-shrink: 0;
    }
  }

  @media (max-width: 700px) {
    .proxyHeader { padding: 18px; }
    .proxyBody { padding: 0 18px 18px; }
    .proxyAddressRow { flex-wrap: wrap; }
    .proxyAddress { flex-basis: 100%; }
    .credentialRow { flex-direction: column; align-items: stretch; }
  }
}
</style>
