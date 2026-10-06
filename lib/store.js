// Small key-value store.
// In production: Upstash Redis (free tier, add it from the Vercel Marketplace).
// Locally with no Redis keys set: an in-memory store, so you can test right away.
import { Redis } from "@upstash/redis";

function makeMemoryStore() {
  const data = new Map(); // key -> { value, expiresAt }
  const alive = (k) => {
    const e = data.get(k);
    if (!e) return undefined;
    if (e.expiresAt && Date.now() > e.expiresAt) {
      data.delete(k);
      return undefined;
    }
    return e;
  };
  return {
    kind: "memory",
    async get(k) {
      const e = alive(k);
      return e ? structuredClone(e.value) : null;
    },
    async set(k, value, opts = {}) {
      if (opts.nx && alive(k)) return null;
      data.set(k, { value: structuredClone(value), expiresAt: opts.ex ? Date.now() + opts.ex * 1000 : null });
      return "OK";
    },
    async incr(k) {
      const e = alive(k);
      const n = (e ? Number(e.value) : 0) + 1;
      data.set(k, { value: n, expiresAt: e?.expiresAt ?? null });
      return n;
    },
    async expire(k, seconds) {
      const e = alive(k);
      if (e) e.expiresAt = Date.now() + seconds * 1000;
      return e ? 1 : 0;
    },
    async ttl(k) {
      const e = alive(k);
      if (!e) return -2;
      if (!e.expiresAt) return -1;
      return Math.ceil((e.expiresAt - Date.now()) / 1000);
    },
  };
}

let store;
export function getStore() {
  if (store) return store;
  // Vercel's Upstash integration sets KV_REST_API_*; Upstash directly sets UPSTASH_REDIS_REST_*
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token });
    redis.kind = "redis";
    store = redis;
  } else {
    if (process.env.VERCEL) {
      console.warn("[store] No Redis configured — using memory. Rings will NOT work reliably on Vercel. Add Upstash Redis.");
    }
    store = makeMemoryStore();
  }
  return store;
}

// For tests
export function _resetStore() {
  store = undefined;
}
