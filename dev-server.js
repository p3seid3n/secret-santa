#!/usr/bin/env node
/*
 * Run the whole site on your own computer:   node dev-server.js
 * Then open http://localhost:3000/host.html
 *
 * Same API code as on Vercel, but the data lives in memory (it is gone when you stop it).
 * The host password is "dev" unless you set HOST_PASSWORD. Use PORT to change the port.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { handle } = require("./server/handler");
const { createStore } = require("./server/store");

const PUBLIC_DIR = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// Use the same security headers as vercel.json, so problems show up here first.
function securityHeaders() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "vercel.json"), "utf8"));
    const all = (config.headers || []).filter((h) => h.source === "/(.*)");
    const headers = {};
    all.forEach((h) => h.headers.forEach((kv) => { headers[kv.key] = kv.value; }));
    return headers;
  } catch (e) {
    return {};
  }
}

function createServer(env, store) {
  const extra = securityHeaders();

  function send(res, status, headers, body) {
    res.writeHead(status, Object.assign({}, extra, headers));
    res.end(body);
  }

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 100 * 1024) return null;
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return null; }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/api/santa") {
      const body = req.method === "POST" ? await readJson(req) : null;
      const result = await handle({ method: req.method, body }, { env, store, delay: () => Promise.resolve() });
      return send(res, result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }, JSON.stringify(result.body));
    }

    let file = decodeURIComponent(url.pathname);
    if (file === "/") file = "/index.html";
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return send(res, 404, { "Content-Type": "text/plain" }, "Not found");
    }
    send(res, 200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" }, fs.readFileSync(full));
  });
}

if (require.main === module) {
  const env = Object.assign({ HOST_PASSWORD: "dev" }, process.env);
  const port = Number(env.PORT) || 3000;
  createServer(env, createStore(env)).listen(port, "127.0.0.1", () => {
    console.log("Secret Santa running at http://localhost:" + port + "/host.html");
    console.log("Host password: " + env.HOST_PASSWORD + "   (data is kept in memory only)");
  });
}

module.exports = { createServer };
