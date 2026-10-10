/*
 * Link previews: fetches a web page and picks out its title, description and picture
 * (the "Open Graph" tags that chat apps use for their link cards).
 *
 * The server fetches pages on behalf of visitors, so it must never be tricked into
 * reaching internal addresses. Every connection is checked at the moment it is made:
 * only http(s), only public IP addresses, a few redirects, a size limit and a timeout.
 */
"use strict";

const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const Core = require("../public/shared.js");

const MAX_BYTES = 400 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 3000;

/* ------------------------------------------------------------ IP checking */

function isPrivateV4(parts) {
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateV4(address.split(".").map(Number));
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateV4(mapped[1].split(".").map(Number));
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    return (
      lower === "::" || lower === "::1" ||
      /^f[cd]/.test(lower) ||        // fc00::/7 unique local
      /^fe[89ab]/.test(lower) ||     // fe80::/10 link local
      /^ff/.test(lower) ||           // multicast
      /^64:ff9b:/.test(lower)        // NAT64 (can hide private v4)
    );
  }
  return true; // not an IP at all: refuse
}

// Used as the "lookup" of a connection, so the check happens on the address really used.
function safeLookup(allowPrivate) {
  return function (hostname, options, callback) {
    if (typeof options === "function") { callback = options; options = {}; }
    dns.lookup(hostname, { all: true, family: options && options.family }, function (error, addresses) {
      if (error) return callback(error);
      if (!allowPrivate && addresses.some(function (a) { return isPrivateAddress(a.address); })) {
        return callback(new Error("blocked address"));
      }
      if (options && options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/* ------------------------------------------------------------- Fetching */

function getOnce(href, allowPrivate) {
  return new Promise(function (resolve, reject) {
    let url;
    try { url = new URL(href); } catch (e) { return reject(new Error("bad url")); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new Error("bad protocol"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !allowPrivate && isPrivateAddress(host)) return reject(new Error("blocked address"));

    const client = url.protocol === "https:" ? https : http;
    const request = client.request(url, {
      method: "GET",
      lookup: safeLookup(allowPrivate),
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SecretSantaLinkPreview/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
        "Accept-Language": "es,en;q=0.8"
      }
    }, function (response) {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        let next;
        try { next = new URL(response.headers.location, url).href; } catch (e) { return reject(new Error("bad redirect")); }
        return resolve({ redirect: next });
      }
      const type = String(response.headers["content-type"] || "");
      if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
        response.resume();
        return reject(new Error("not a web page"));
      }
      const chunks = [];
      let size = 0;
      response.on("data", function (chunk) {
        size += chunk.length;
        chunks.push(chunk);
        if (size > MAX_BYTES) { response.destroy(); finish(); }
      });
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve({ html: Buffer.concat(chunks).toString("utf8").slice(0, MAX_BYTES), url: href });
      }
      response.on("end", finish);
      response.on("close", finish);
      response.on("error", function () { finish(); });
    });
    request.on("timeout", function () { request.destroy(new Error("timeout")); });
    request.on("error", reject);
    request.end();
  });
}

async function getPage(href, allowPrivate) {
  let current = href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await getOnce(current, allowPrivate);
    if (result.redirect) { current = result.redirect; continue; }
    return result;
  }
  throw new Error("too many redirects");
}

/* -------------------------------------------------------------- Parsing */

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return safeChar(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (m, d) { return safeChar(parseInt(d, 10)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeChar(code) {
  try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""; } catch (e) { return ""; }
}

function clean(text, max) {
  const s = decodeEntities(text).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
}

// Reads <meta property|name="..." content="..."> pairs from the head of the page.
function readMeta(html) {
  const head = html.slice(0, 200000);
  const meta = {};
  const tags = head.match(/<meta\b[^>]*>/gi) || [];
  tags.forEach(function (tag) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const value = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!key || !value) return;
    const k = key[1].toLowerCase();
    if (!(k in meta)) meta[k] = value[1] !== undefined ? value[1] : value[2];
  });
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  return { meta: meta, title: title ? title[1] : "" };
}

function parsePreview(html, pageUrl) {
  const found = readMeta(html);
  const m = found.meta;
  const title = clean(m["og:title"] || m["twitter:title"] || found.title || "", 150);
  const description = clean(m["og:description"] || m["twitter:description"] || m["description"] || "", 300);
  const site = clean(m["og:site_name"] || "", 60) || Core.hostName(pageUrl);

  let image = null;
  const rawImage = m["og:image"] || m["og:image:url"] || m["twitter:image"] || m["twitter:image:src"];
  if (rawImage) {
    try {
      const resolved = Core.cleanUrl(new URL(decodeEntities(rawImage).trim(), pageUrl).href);
      if (resolved && resolved.indexOf("https:") === 0) image = resolved;
    } catch (e) { /* no picture */ }
  }
  return { url: pageUrl, title: title, description: description, image: image, site: site };
}

// Returns { url, title, description, image, site } or null when the page cannot be read.
async function fetchPreview(rawUrl, options) {
  const url = Core.cleanUrl(rawUrl);
  if (!url) return null;
  try {
    const page = await getPage(url, !!(options && options.allowPrivate));
    const preview = parsePreview(page.html, url);
    return preview.title || preview.description || preview.image ? preview : null;
  } catch (e) {
    return null;
  }
}

module.exports = { fetchPreview, parsePreview, isPrivateAddress };
