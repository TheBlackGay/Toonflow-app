import { URL } from "node:url";
import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";

type ProxyFetchInit = RequestInit & { proxy?: string };

const originalFetch = globalThis.fetch;
const originalPreconnect = originalFetch.preconnect;
let outboundProxy: string | undefined;
const socksAgents = new Map<string, SocksProxyAgent>();

export function parseOutboundProxy(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("代理地址必须是字符串");
  const input = value.trim();
  if (!input) return undefined;
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error("代理地址格式无效"); }
  if (!["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol)) throw new Error("代理地址仅支持 HTTP、HTTPS、SOCKS5 协议");
  if (!url.hostname) throw new Error("代理地址必须包含主机");
  if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) throw new Error("代理端口必须是 1 到 65535");
  if (url.pathname && url.pathname !== "/" || url.search || url.hash) throw new Error("代理地址不能包含路径、查询参数或片段");
  return url.href;
}

export function resolveOutboundProxy(value: unknown, username?: unknown, password?: unknown) {
  const parsed = parseOutboundProxy(value);
  if (!parsed) return undefined;
  if (typeof username !== "undefined" && typeof username !== "string") throw new Error("代理用户名必须是字符串");
  if (typeof password !== "undefined" && typeof password !== "string") throw new Error("代理密码必须是字符串");
  const url = new URL(parsed);
  if (username !== undefined) url.username = username;
  if (password !== undefined) url.password = password;
  return url.href;
}

function createProxyFetch(proxy: string) {
  const fetchWithProxy = Object.assign((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) return originalFetch.call(globalThis, input, init);
    if (proxy.startsWith("socks5:" ) || proxy.startsWith("socks5h:")) {
      let agent = socksAgents.get(proxy);
      if (!agent) {
        agent = new SocksProxyAgent(proxy);
        socksAgents.set(proxy, agent);
      }
      return nodeFetch(input as string | URL, { ...init, agent } as Parameters<typeof nodeFetch>[1]);
    }
    const nextInit = { ...(init ?? {}), proxy } as ProxyFetchInit;
    return originalFetch.call(globalThis, input, nextInit);
  }, { preconnect: originalPreconnect });
  return fetchWithProxy as typeof globalThis.fetch;
}

export function configureOutboundProxy(value: unknown, options: { onInvalid?: (error: Error) => void } = {}) {
  try {
    const nextProxy = parseOutboundProxy(value);
    outboundProxy = nextProxy;
    globalThis.fetch = nextProxy ? createProxyFetch(nextProxy) : originalFetch;
    return nextProxy;
  } catch (error) {
    const cause = error instanceof Error ? error : new Error("代理地址无效");
    options.onInvalid?.(cause);
    throw cause;
  }
}

export function getOutboundProxy() {
  return outboundProxy;
}
