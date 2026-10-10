// Run with:  node test/preview.test.js
const assert = require("assert");
const http = require("http");
const { fetchPreview, parsePreview, isPrivateAddress } = require("../server/preview");
const { handle } = require("../server/handler");
const { memoryStore } = require("../server/store");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("private and special addresses are recognised", () => {
  ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "0.0.0.0", "100.64.0.1",
   "::1", "::", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1", "not-an-ip"]
    .forEach((a) => assert.ok(isPrivateAddress(a), a + " should be blocked"));
  ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]
    .forEach((a) => assert.ok(!isPrivateAddress(a), a + " should be allowed"));
});

test("parsePreview reads Open Graph tags, entities and relative pictures", () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Reading &amp; lamp &#39;Luz&#39;">
    <meta property="og:description" content="Warm light for the evening">
    <meta property="og:image" content="/img/lamp.jpg">
    <meta property="og:site_name" content="Shop"></head></html>`;
  const p = parsePreview(html, "https://www.shop.example/lamp");
  assert.deepStrictEqual(p, {
    url: "https://www.shop.example/lamp", title: "Reading & lamp 'Luz'", description: "Warm light for the evening",
    image: "https://www.shop.example/img/lamp.jpg", site: "Shop"
  });
});

test("parsePreview falls back to <title>, and never accepts non-https pictures", () => {
  const p = parsePreview('<title> Hello </title><meta property="og:image" content="http://x.example/a.png"><meta name="description" content="d">', "https://a.example/x");
  assert.deepStrictEqual([p.title, p.description, p.image, p.site], ["Hello", "d", null, "a.example"]);
  const js = parsePreview('<meta property="og:image" content="javascript:alert(1)"><title>t</title>', "https://a.example/x");
  assert.strictEqual(js.image, null);
});

test("fetchPreview refuses internal addresses, bad protocols and non-pages", async () => {
  assert.strictEqual(await fetchPreview("http://127.0.0.1:1/"), null);
  assert.strictEqual(await fetchPreview("http://169.254.169.254/latest/meta-data/"), null);
  assert.strictEqual(await fetchPreview("http://localhost/"), null, "localhost has no dot and is not a link at all");
  assert.strictEqual(await fetchPreview("file:///etc/passwd"), null);
  assert.strictEqual(await fetchPreview("http://[::1]/"), null);
});

test("fetchPreview follows redirects, reads the page, and respects limits (local test server)", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/start") { res.writeHead(302, { Location: "/page" }); return res.end(); }
    if (req.url === "/page") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<meta property="og:title" content="Local page"><meta property="og:description" content="Hi">');
    }
    if (req.url === "/loop") { res.writeHead(302, { Location: "/loop" }); return res.end(); }
    if (req.url === "/pdf") { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end("%PDF"); }
    if (req.url === "/huge") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end('<title>Big</title>' + "x".repeat(2 * 1024 * 1024));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    // 127.0.0.1 has no dot-free hostname problem: cleanUrl accepts it, only the private check stops it
    assert.strictEqual(await fetchPreview(base + "/page"), null, "private address blocked by default");
    const ok = await fetchPreview(base + "/start", { allowPrivate: true });
    assert.deepStrictEqual([ok.title, ok.description], ["Local page", "Hi"]);
    assert.strictEqual(await fetchPreview(base + "/loop", { allowPrivate: true }), null, "redirect loops stop");
    assert.strictEqual(await fetchPreview(base + "/pdf", { allowPrivate: true }), null, "only web pages");
    assert.strictEqual((await fetchPreview(base + "/huge", { allowPrivate: true })).title, "Big", "big pages are cut off");
    assert.strictEqual(await fetchPreview(base + "/missing", { allowPrivate: true }), null);
  } finally {
    server.close();
  }
});

test("preview action: needs a real event, caches good answers, null for unreadable pages", async () => {
  const env = { HOST_PASSWORD: "pw" };
  const store = memoryStore();
  let calls = 0;
  const deps = {
    env, store, delay: async () => {},
    fetchPreview: async (url) => { calls++; return url.indexOf("good") !== -1 ? { url, title: "T", description: "D", image: null, site: "s" } : null; }
  };
  const call = (body) => handle({ method: "POST", body }, deps);
  const created = await call({ action: "create", password: "pw", names: ["A", "B", "C"], rules: [] });
  const id = created.body.id;

  assert.strictEqual((await call({ action: "preview", id: "abcdefghij", url: "https://good.example/" })).status, 404);
  assert.strictEqual((await call({ action: "preview", id, url: "javascript:alert(1)" })).status, 400);
  assert.strictEqual((await call({ action: "preview", id })).status, 400);

  const first = await call({ action: "preview", id, url: "good.example/x" });
  assert.strictEqual(first.body.preview.title, "T");
  await call({ action: "preview", id, url: "https://good.example/x" });
  assert.strictEqual(calls, 1, "second request comes from the cache");

  const bad = await call({ action: "preview", id, url: "https://bad.example/x" });
  assert.deepStrictEqual([bad.status, bad.body.preview], [200, null]);
  await call({ action: "preview", id, url: "https://bad.example/x" });
  assert.strictEqual(calls, 3, "unreadable pages are not cached");
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok   " + name); }
    catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
  }
  console.log(failed ? "\n" + failed + " test(s) failed" : "\nAll tests passed");
  process.exit(failed ? 1 : 0);
})();
