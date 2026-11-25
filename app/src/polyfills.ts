// Must be the first import: web3.js / anchor / the ephemeral-rollups-sdk touch Buffer at load time.
import { Buffer } from "buffer";

(window as typeof window & { Buffer: typeof Buffer }).Buffer = Buffer;

// Test 9 (spoiler check): with ?record=1 every fetch response body the client receives is kept in
// window.__razkynTraffic so the test can scan exactly what reached the browser.
if (new URLSearchParams(window.location.search).has("record")) {
  const log: { url: string; body: string }[] = [];
  (window as unknown as { __razkynTraffic: typeof log }).__razkynTraffic = log;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
      res.clone().text().then((body) => log.push({ url: url.replace(/token=[^&]+/, "token=REDACTED"), body: (init?.body ? `REQ ${String(init.body).slice(0, 400)}\n` : "") + body })).catch(() => {});
    }
    return res;
  };
}
