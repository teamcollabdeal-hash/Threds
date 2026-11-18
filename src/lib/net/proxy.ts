import { ProxyAgent, Agent, type Dispatcher } from "undici";
import { socksDispatcher } from "fetch-socks";

export interface ProxySpec {
  protocol: "http" | "https" | "socks5";
  host: string; port: number; username?: string | null; password?: string | null;
}

const cache = new Map<string, Dispatcher>();
const direct = new Agent({ connect: { timeout: 15_000 } });

/** Статичне призначення мережевої конфігурації акаунту. Без ротації IP. */
export function dispatcherFor(spec: ProxySpec | null | undefined): Dispatcher {
  if (!spec) return direct;
  const k = `${spec.protocol}://${spec.username ?? ""}@${spec.host}:${spec.port}`;
  const hit = cache.get(k);
  if (hit) return hit;
  let d: Dispatcher;
  if (spec.protocol === "socks5") {
    d = socksDispatcher({
      type: 5, host: spec.host, port: spec.port,
      ...(spec.username ? { userId: spec.username, password: spec.password ?? "" } : {}),
    }) as unknown as Dispatcher;
  } else {
    const auth = spec.username
      ? `${encodeURIComponent(spec.username)}:${encodeURIComponent(spec.password ?? "")}@` : "";
    d = new ProxyAgent({ uri: `${spec.protocol}://${auth}${spec.host}:${spec.port}`, connect: { timeout: 15_000 } });
  }
  cache.set(k, d);
  return d;
}

export function invalidateDispatcher(spec: ProxySpec) {
  cache.delete(`${spec.protocol}://${spec.username ?? ""}@${spec.host}:${spec.port}`);
}
