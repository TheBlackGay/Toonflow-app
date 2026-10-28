<template>
  <div class="networkProxy">
    <section class="settingSection" aria-labelledby="outboundProxyTitle">
      <h3 id="outboundProxyTitle">服务端出站代理</h3>
      <el-input v-model="proxyDraft" type="password" showPassword dir="ltr" autocomplete="off" aria-label="服务端出站代理地址" placeholder="socks5://127.0.0.1:1080" />
      <p class="description">为 Toonflow 服务端发起的模型、媒体和插件等网络请求设置统一代理。留空即可关闭。支持 HTTP、HTTPS 和 SOCKS5。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { settings } from "@/stores/settings";

const proxyDraft = computed({
  get() {
    const network = settings.value.network;
    const value = network && typeof network === "object" && !Array.isArray(network) ? network as Record<string, unknown> : {};
    return typeof value.outboundProxy === "string" ? value.outboundProxy : "";
  },
  set(value: string) {
    const network = settings.value.network;
    const current = network && typeof network === "object" && !Array.isArray(network) ? network : {};
    settings.value = { ...settings.value, network: { ...current, outboundProxy: value } };
  },
});
</script>

<style lang="scss" scoped>
.networkProxy {
  padding: 0 4px 8px;

  .settingSection {
    max-width: 680px;

    h3 {
      margin: 0 0 12px;
      color: var(--el-text-color-primary);
      font-size: 14px;
      font-weight: 600;
    }

    .description {
      margin: 8px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 13px;
      line-height: 1.6;
    }
  }
}
</style>
