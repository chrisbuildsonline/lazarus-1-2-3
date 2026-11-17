// Records every request, websocket and service worker of a page (design.md "Privacy and the
// network assertion"). expectOnlyStatic() holds each request to: GET, no body, the app origin, no
// query, no hash, and a path of "/", "/index.html" or "/assets/...". data: URLs are not requests;
// if one shows up, only the favicon "data:," passes.
import { expect, type Page, type Request } from "@playwright/test";

const STATIC_PATH = /^\/(index\.html)?$|^\/assets\//;

export type NetworkWatch = {
  requests: Request[];
  sockets: string[];
  workers: string[];
  /** Fails unless every recorded request is a static GET of the app; no URL may hold a secret. */
  expectOnlyStatic: (secrets?: readonly string[]) => void;
};

export function watchNetwork(page: Page, baseURL: string): NetworkWatch {
  const origin = new URL(baseURL).origin;
  const requests: Request[] = [];
  const sockets: string[] = [];
  const workers: string[] = [];
  page.on("request", (r) => requests.push(r));
  page.on("websocket", (ws) => sockets.push(ws.url()));
  page.context().on("serviceworker", (w) => workers.push(w.url()));

  function expectOnlyStatic(secrets: readonly string[] = []): void {
    for (const r of requests) {
      const raw = r.url();
      for (const s of secrets) expect(decodeURIComponent(raw), `${raw} holds ${s}`).not.toContain(s);
      if (raw === "data:,") continue;
      const url = new URL(raw);
      expect(r.method(), raw).toBe("GET");
      expect(r.postData(), raw).toBeNull();
      expect(url.origin, raw).toBe(origin);
      expect(url.search, raw).toBe("");
      expect(url.hash, raw).toBe("");
      expect(url.pathname, raw).toMatch(STATIC_PATH);
    }
    expect(sockets, "websockets").toEqual([]);
    expect(workers, "service workers").toEqual([]);
  }

  return { requests, sockets, workers, expectOnlyStatic };
}
