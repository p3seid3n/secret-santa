/*
 * Storage for events and wishlists.
 *
 * - On Vercel: Upstash Redis through its REST interface (plain fetch, no packages).
 *   Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or the older names
 *   KV_REST_API_URL / KV_REST_API_TOKEN that the Vercel integration may create.
 * - On your own computer (node dev-server.js): everything is kept in memory.
 * - On Vercel without a database: no store, so the API says "no_storage".
 *
 * A store has three async methods: get(key), set(key, text), mget(keys).
 */
"use strict";

const TTL_SECONDS = 60 * 60 * 24 * 120; // old data disappears after 120 days

function memoryStore() {
  const data = new Map();
  return {
    kind: "memory",
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async set(key, value) { data.set(key, value); },
    async mget(keys) { return keys.map((key) => (data.has(key) ? data.get(key) : null)); }
  };
}

function upstashStore(baseUrl, token, fetchImpl) {
  async function command(args) {
    const res = await fetchImpl(baseUrl, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* handled below */ }
    if (!res.ok || !json || json.error) {
      throw new Error("Redis request failed (" + res.status + ")" + (json && json.error ? ": " + json.error : ""));
    }
    return json.result;
  }

  return {
    kind: "upstash",
    get: (key) => command(["GET", key]),
    set: (key, value) => command(["SET", key, value, "EX", String(TTL_SECONDS)]),
    mget: (keys) => (keys.length ? command(["MGET"].concat(keys)) : Promise.resolve([]))
  };
}

// Returns a store, or null when the server has no database configured.
function createStore(env, fetchImpl) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return upstashStore(url.replace(/\/+$/, ""), token, fetchImpl || fetch);
  if (!env.VERCEL && env.NODE_ENV !== "production") return memoryStore();
  return null;
}

module.exports = { createStore, memoryStore, upstashStore, TTL_SECONDS };
