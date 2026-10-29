import undici from "undici/index.js";
import { SocksClient } from "socks";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { connect } from "node:tls";
import type { Socket } from "node:net";
import type * as undiciTypes from "undici";

// ACT: 显式加载 npm 实现；Bun 内置的 undici.fetch 会忽略 dispatcher。
const { Agent, fetch: fetchRequest } = undici as { Agent: typeof undiciTypes.Agent; fetch: typeof undiciTypes.fetch };

export function createSocksTransport(proxy: string) {
  const proxyUrl = new URL(proxy);
  const dispatcher = new Agent({
    connect(options, callback) {
      let socket: Socket | undefined;
      let finished = false;
      const finish = (error: Error | null, connected?: Socket) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) socket?.destroy();
        if (error) callback(error, null);
        else if (connected) callback(null, connected);
      };
      const timer = setTimeout(() => finish(new Error("SOCKS5 代理连接超时")), 10000);
      void (async () => {
        const hostname = options.hostname.replace(/^\[|\]$/g, "");
        const host = proxyUrl.protocol === "socks5:" && !isIP(hostname)
          ? (await lookup(hostname)).address : hostname;
        const connection = await SocksClient.createConnection({
          command: "connect",
          proxy: {
            host: proxyUrl.hostname.replace(/^\[|\]$/g, ""),
            port: Number(proxyUrl.port || 1080),
            type: 5,
            userId: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password),
          },
          destination: { host, port: Number(options.port || (options.protocol === "https:" ? 443 : 80)) },
          timeout: 10000,
        });
        socket = connection.socket;
        if (finished) { socket.destroy(); return; }
        if (options.protocol !== "https:") { finish(null, socket); return; }
        socket = connect({ socket, servername: isIP(hostname) ? undefined : hostname, ALPNProtocols: ["http/1.1"] });
        socket.once("error", error => finish(error));
        socket.once("secureConnect", () => finish(null, socket));
      })().catch(error => finish(new Error("SOCKS5 代理连接失败", { cause: error })));
    },
  });
  return {
    close: () => dispatcher.close(),
    async fetch(input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) {
      const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init);
      const response = await fetchRequest(request.url, {
        method: request.method,
        headers: Array.from(request.headers.entries()),
        body: request.body as unknown as undiciTypes.BodyInit,
        duplex: "half",
        signal: request.signal,
        redirect: request.redirect,
        dispatcher,
      });
      return response as unknown as Response;
    },
  };
}
