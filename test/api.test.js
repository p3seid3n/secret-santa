// Run with:  node test/api.test.js
const assert = require("assert");
const { handle } = require("../server/handler");
const { createStore, memoryStore, upstashStore } = require("../server/store");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const ENV = { HOST_PASSWORD: "ho ho ho" };
const NAMES = ["Ana Müller", "Peter Meier", "Hannah Keller", "Onkel Hans", "Tante Rosa", "Lena Frei"];

function makeDeps(extra) {
  const delays = [];
  return Object.assign({ env: ENV, store: memoryStore(), delay: async (ms) => { delays.push(ms); }, delays }, extra);
}
const call = (deps, body, method) => handle({ method: method || "POST", body }, deps);

async function createEvent(deps, extra) {
  const res = await call(deps, Object.assign({ action: "create", password: ENV.HOST_PASSWORD, names: NAMES, rules: [] }, extra));
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.id;
}

async function pairings(deps, id) {
  const out = {};
  for (let i = 0; i < NAMES.length; i++) {
    const res = await call(deps, { action: "reveal", id, index: i });
    assert.strictEqual(res.status, 200);
    out[NAMES[i]] = res.body.recipient;
  }
  return out;
}

test("reshuffle needs the host password and keeps link, wishlists and rules", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps, { rules: [{ a: "Tante Rosa", b: "Onkel Hans", both: true }] });
  await call(deps, { action: "save", id, index: 0, notes: "Socks", links: [] });
  const before = await pairings(deps, id);

  const wrong = await call(deps, { action: "reshuffle", id, password: "nope" });
  assert.deepStrictEqual([wrong.status, wrong.body.error], [401, "bad_password"]);
  assert.deepStrictEqual(await pairings(deps, id), before, "a wrong password changes nothing");

  assert.strictEqual((await call(deps, { action: "reshuffle", id: "abcdefghij", password: ENV.HOST_PASSWORD })).status, 404);

  let changedEverywhere = 0;
  let previous = before;
  for (let round = 0; round < 10; round++) {
    const res = await call(deps, { action: "reshuffle", id, password: ENV.HOST_PASSWORD });
    assert.deepStrictEqual([res.status, res.body.id], [200, id]);
    const after = await pairings(deps, id);
    assert.ok(new Set(Object.values(after)).size === NAMES.length, "everybody receives once");
    assert.ok(Object.keys(after).every((g) => after[g] !== g));
    assert.notStrictEqual(after["Tante Rosa"], "Onkel Hans", "rules still apply");
    assert.notStrictEqual(after["Onkel Hans"], "Tante Rosa", "rules still apply");
    if (Object.keys(after).every((g) => after[g] !== previous[g])) changedEverywhere++;
    previous = after;
  }
  assert.ok(changedEverywhere >= 5, "usually nobody keeps the previous recipient");
  const wl = (await call(deps, { action: "wishlists", id })).body.people;
  assert.strictEqual(wl[0].notes, "Socks", "wishlists stay");
});

test("reshuffle of an older event takes the rules from the request", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps);
  const key = "santa:event:" + id;
  const event = JSON.parse(await deps.store.get(key));
  delete event.forbidden;
  await deps.store.set(key, JSON.stringify(event));
  const bad = await call(deps, { action: "reshuffle", id, password: ENV.HOST_PASSWORD, rules: [{ a: "Nobody", b: "Ana Müller" }] });
  assert.deepStrictEqual([bad.status, bad.body.error], [400, "bad_rule"]);
  const ok = await call(deps, { action: "reshuffle", id, password: ENV.HOST_PASSWORD, rules: [{ a: "Ana Müller", b: "Peter Meier" }] });
  assert.strictEqual(ok.status, 200);
  assert.notStrictEqual((await pairings(deps, id))["Ana Müller"], "Peter Meier");
});

test("personal codes: only people with a code are asked, wrong codes are refused and lock after 5 tries", async () => {
  let now = 1000000;
  const deps = makeDeps({ now: () => now });
  const id = await createEvent(deps, { codes: { "Ana Müller": "Ab 12", "Peter Meier": "7777" } });
  const ana = NAMES.indexOf("Ana Müller");

  // people without a code work as before
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 2 })).status, 200);
  assert.strictEqual((await call(deps, { action: "save", id, index: 2, notes: "x" })).status, 200);

  // with a code
  const none = await call(deps, { action: "reveal", id, index: ana });
  assert.deepStrictEqual([none.status, none.body.error], [401, "code_required"]);
  assert.ok(!JSON.stringify(none.body).includes("recipient"));
  const saveNone = await call(deps, { action: "save", id, index: ana, notes: "hacked" });
  assert.deepStrictEqual([saveNone.status, saveNone.body.error], [401, "code_required"]);
  assert.strictEqual((await call(deps, { action: "wishlists", id })).body.people[ana].notes, "", "nothing was saved");
  const ok = await call(deps, { action: "reveal", id, index: ana, code: "  AB12 " });
  assert.strictEqual(ok.status, 200, "capitals and spaces do not matter");
  assert.strictEqual((await call(deps, { action: "save", id, index: ana, notes: "mine", code: "ab12" })).status, 200);
  assert.strictEqual((await call(deps, { action: "wishlists", id })).body.people[ana].notes, "mine");

  // wrong codes: slowed down, then locked
  for (let i = 1; i <= 4; i++) {
    const bad = await call(deps, { action: "reveal", id, index: ana, code: "0000" });
    assert.deepStrictEqual([bad.status, bad.body.error], [401, "bad_code"], "try " + i);
  }
  assert.ok(deps.delays.filter((d) => d === 400).length >= 4, "wrong codes are slowed down");
  const locked = await call(deps, { action: "reveal", id, index: ana, code: "0000" });
  assert.deepStrictEqual([locked.status, locked.body.error, locked.body.minutes], [429, "locked", 15]);
  const rightButLocked = await call(deps, { action: "reveal", id, index: ana, code: "ab12" });
  assert.strictEqual(rightButLocked.status, 429, "even the right code waits");
  const otherPerson = await call(deps, { action: "reveal", id, index: NAMES.indexOf("Peter Meier"), code: "7777" });
  assert.strictEqual(otherPerson.status, 200, "other people are not affected");
  now += 16 * 60000;
  assert.strictEqual((await call(deps, { action: "reveal", id, index: ana, code: "ab12" })).status, 200, "unlocked after the wait");
});

test("personal codes: format, hashing, setcodes and reshuffle", async () => {
  const deps = makeDeps();
  for (const bad of ["abc", "x".repeat(13)]) {
    const res = await call(deps, { action: "create", password: ENV.HOST_PASSWORD, names: NAMES, rules: [], codes: { "Ana Müller": bad } });
    assert.deepStrictEqual([res.status, res.body.error], [400, "bad_code_format"]);
  }
  const unknown = await call(deps, { action: "create", password: ENV.HOST_PASSWORD, names: NAMES, rules: [], codes: { Nobody: "1234" } });
  assert.strictEqual(unknown.body.error, "bad_code_format");

  const id = await createEvent(deps, { codes: { "Ana Müller": "4821", "Hannah Keller": "" } });
  const stored = await deps.store.get("santa:event:" + id);
  assert.ok(!stored.includes("4821"), "codes are stored hashed");
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 2 })).status, 200, "empty code means no code");

  const wrong = await call(deps, { action: "setcodes", id, password: "nope", codes: {} });
  assert.strictEqual(wrong.status, 401);
  const before = await pairings(deps, id).catch(() => null);
  assert.strictEqual(before, null, "pairings() has no codes, Ana is locked");

  const set = await call(deps, { action: "setcodes", id, password: ENV.HOST_PASSWORD, codes: { "Ana Müller": "9999", "Peter Meier": "5555" } });
  assert.strictEqual(set.status, 200);
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 0, code: "4821" })).status, 401, "old code stops working");
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 0, code: "9999" })).status, 200);
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 1, code: "5555" })).status, 200);

  const first = (await call(deps, { action: "reveal", id, index: 0, code: "9999" })).body.recipient;
  let changed = false;
  for (let i = 0; i < 5; i++) {
    await call(deps, { action: "reshuffle", id, password: ENV.HOST_PASSWORD });
    assert.strictEqual((await call(deps, { action: "reveal", id, index: 0 })).status, 401, "codes survive a reshuffle");
    if ((await call(deps, { action: "reveal", id, index: 0, code: "9999" })).body.recipient !== first) changed = true;
  }
  assert.ok(changed);

  await call(deps, { action: "setcodes", id, password: ENV.HOST_PASSWORD, codes: {} });
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 0 })).status, 200, "all codes can be removed");
});

test("open address: the plain site address opens the event only when the host allowed it", async () => {
  const deps = makeDeps();
  assert.strictEqual((await call(deps, { action: "current" })).status, 404, "nothing before any draw");
  const closed = await createEvent(deps);
  assert.strictEqual((await call(deps, { action: "current" })).status, 404, "closed by default");
  const open = await createEvent(deps, { openAddress: true });
  const res = await call(deps, { action: "current" });
  assert.deepStrictEqual([res.status, res.body.id], [200, open]);
  assert.deepStrictEqual(Object.keys(res.body).sort(), ["id", "ok"]);

  // a later draw without the option closes it again
  await createEvent(deps);
  assert.strictEqual((await call(deps, { action: "current" })).status, 404);

  // host can switch it on and off without drawing again
  const wrong = await call(deps, { action: "setcodes", id: closed, password: "nope", openAddress: true });
  assert.strictEqual(wrong.status, 401);
  await call(deps, { action: "setcodes", id: closed, password: ENV.HOST_PASSWORD, openAddress: true });
  assert.strictEqual((await call(deps, { action: "current" })).body.id, closed);
  await call(deps, { action: "setcodes", id: open, password: ENV.HOST_PASSWORD, openAddress: false });
  assert.strictEqual((await call(deps, { action: "current" })).body.id, closed, "switching off another event changes nothing");
  await call(deps, { action: "setcodes", id: closed, password: ENV.HOST_PASSWORD, openAddress: false });
  assert.strictEqual((await call(deps, { action: "current" })).status, 404);
});

test("only POST with a known action is accepted", async () => {
  const deps = makeDeps();
  assert.strictEqual((await call(deps, { action: "names" }, "GET")).status, 405);
  assert.strictEqual((await call(deps, null)).status, 400);
  assert.strictEqual((await call(deps, { action: "nope" })).status, 400);
  assert.strictEqual((await call(deps, { action: "__proto__" })).status, 400);
  assert.strictEqual((await call(deps, { action: "constructor" })).status, 400);
});

test("without a database the API says so", async () => {
  const res = await call(makeDeps({ store: null }), { action: "names", id: "abcdefgh" });
  assert.deepStrictEqual([res.status, res.body.error], [503, "no_storage"]);
});

test("create needs a host password on the server and the right one from the host", async () => {
  const noPassword = await call(makeDeps({ env: {} }), { action: "create", password: "x", names: NAMES });
  assert.deepStrictEqual([noPassword.status, noPassword.body.error], [503, "no_password_set"]);

  const deps = makeDeps();
  const wrong = await call(deps, { action: "create", password: "wrong", names: NAMES });
  assert.deepStrictEqual([wrong.status, wrong.body.error], [401, "bad_password"]);
  assert.deepStrictEqual(deps.delays, [400], "wrong guesses are slowed down");
  const missing = await call(deps, { action: "create", names: NAMES });
  assert.strictEqual(missing.status, 401);
});

test("create validates names and rules", async () => {
  const deps = makeDeps();
  const base = { action: "create", password: ENV.HOST_PASSWORD };
  let r = await call(deps, Object.assign({ names: ["A", "b", "B"] }, base));
  assert.deepStrictEqual([r.status, r.body.error, r.body.names], [400, "duplicates", ["B"]]);
  r = await call(deps, Object.assign({ names: ["A", "B"] }, base));
  assert.deepStrictEqual([r.status, r.body.error], [400, "too_few"]);
  r = await call(deps, Object.assign({ names: "A,B,C" }, base));
  assert.strictEqual(r.body.error, "bad_request");
  r = await call(deps, Object.assign({ names: NAMES, rules: [{ a: "Ana Müller", b: "Nobody" }] }, base));
  assert.deepStrictEqual([r.status, r.body.error], [400, "bad_rule"]);
  r = await call(deps, Object.assign({ names: NAMES, rules: [{ a: "Ana Müller", b: "Ana Müller" }] }, base));
  assert.strictEqual(r.body.error, "bad_rule");
  r = await call(deps, Object.assign({ names: ["x".repeat(61), "B", "C"] }, base));
  assert.strictEqual(r.body.error, "bad_request");
});

test("impossible rules come back with hints", async () => {
  const deps = makeDeps();
  const res = await call(deps, {
    action: "create", password: ENV.HOST_PASSWORD, names: ["A", "B", "C"],
    rules: [{ a: "A", b: "B", both: true }]
  });
  assert.deepStrictEqual([res.status, res.body.error], [422, "impossible"]);
  const stuck = await call(deps, {
    action: "create", password: ENV.HOST_PASSWORD, names: ["A", "B", "C"],
    rules: [{ a: "A", b: "B" }, { a: "A", b: "C" }]
  });
  assert.deepStrictEqual(stuck.body.hints, [{ type: "giver", name: "A" }]);
});

test("every draw is a valid circle of gifts and respects the rules (60 draws)", async () => {
  const deps = makeDeps();
  const rules = [{ a: "Tante Rosa", b: "Onkel Hans", both: true }, { a: "Ana Müller", b: "Peter Meier" }];
  for (let round = 0; round < 60; round++) {
    const id = await createEvent(deps, { rules });
    const gift = await pairings(deps, id);
    assert.deepStrictEqual(Object.values(gift).sort(), NAMES.slice().sort(), "everybody receives exactly once");
    NAMES.forEach((n) => assert.notStrictEqual(gift[n], n));
    assert.notStrictEqual(gift["Tante Rosa"], "Onkel Hans");
    assert.notStrictEqual(gift["Onkel Hans"], "Tante Rosa");
    assert.notStrictEqual(gift["Ana Müller"], "Peter Meier");
  }
});

test("guests only ever learn their own recipient", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps);
  const created = JSON.stringify(await call(deps, { action: "names", id }));
  assert.ok(!/assignment|recipient/.test(created), "names must not mention pairings");
  const wishes = JSON.stringify(await call(deps, { action: "wishlists", id }));
  assert.ok(!/assignment|recipient/.test(wishes), "wishlists must not mention pairings");
  const res = await call(deps, { action: "reveal", id, index: 0 });
  assert.deepStrictEqual(Object.keys(res.body).sort(), ["ok", "recipient", "recipientIndex"]);
});

test("unknown or malformed event ids and indexes are refused", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps);
  for (const bad of ["abcdefgh", "", null, 42, "../etc/passwd", "a".repeat(100)]) {
    for (const action of ["names", "reveal", "wishlists", "save"]) {
      const r = await call(deps, { action, id: bad, index: 0 });
      assert.strictEqual(r.status, 404, action + " with id " + JSON.stringify(bad));
    }
  }
  for (const index of [-1, 6, 1.5, "1", null, undefined]) {
    assert.strictEqual((await call(deps, { action: "reveal", id, index })).status, 400, "reveal " + index);
    assert.strictEqual((await call(deps, { action: "save", id, index, notes: "x" })).status, 400, "save " + index);
  }
});

test("wishlists: save, read back, and everybody sees everybody's", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps);

  let all = (await call(deps, { action: "wishlists", id })).body.people;
  assert.strictEqual(all.length, 6);
  assert.deepStrictEqual(all[0], { index: 0, name: "Ana Müller", notes: "", links: [] });

  const saved = await call(deps, {
    action: "save", id, index: 1, notes: "Warm socks", links: [{ url: "www.shop.example/lamp", note: " Lamp " }]
  });
  assert.deepStrictEqual(saved.body.links, [{ url: "https://www.shop.example/lamp", note: "Lamp" }]);
  await call(deps, { action: "save", id, index: 3, notes: "Books", links: [] });

  all = (await call(deps, { action: "wishlists", id })).body.people;
  assert.strictEqual(all[1].notes, "Warm socks");
  assert.strictEqual(all[1].links[0].url, "https://www.shop.example/lamp");
  assert.strictEqual(all[3].notes, "Books");
  assert.strictEqual(all[0].notes, "", "other people are untouched");

  // another event does not share wishlists
  const other = await createEvent(deps);
  const otherAll = (await call(deps, { action: "wishlists", id: other })).body.people;
  assert.ok(otherAll.every((p) => p.notes === "" && p.links.length === 0));
});

test("saved wishlists are cleaned on the server (no javascript: links, size limits)", async () => {
  const deps = makeDeps();
  const id = await createEvent(deps);
  const links = [
    { url: "javascript:alert(1)", note: "x" },
    { url: "data:text/html,hi", note: "x" },
    { url: "ftp://files.example.com/a", note: "x" },
    { url: "http://ok.example.com/a", note: "n".repeat(500) },
    { url: 12, note: "x" },
    null
  ];
  for (let i = 0; i < 40; i++) links.push({ url: "https://shop.example.com/" + i });
  const res = await call(deps, { action: "save", id, index: 0, notes: "z".repeat(9000), links });
  assert.strictEqual(res.body.notes.length, 8000);
  assert.strictEqual(res.body.links.length, 30);
  assert.strictEqual(res.body.links[0].url, "http://ok.example.com/a");
  assert.strictEqual(res.body.links[0].note.length, 200);
  assert.ok(res.body.links.every((l) => /^https?:\/\//.test(l.url)));
});

test("a broken database turns into a clean error, not a crash", async () => {
  const broken = { async get() { throw new Error("db down"); }, async set() { throw new Error("db down"); }, async mget() { throw new Error("db down"); } };
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await call(makeDeps({ store: broken }), { action: "names", id: "abcdefghij" });
    assert.deepStrictEqual([res.status, res.body.error], [502, "storage_error"]);
  } finally {
    console.error = origError;
  }
});

test("Upstash adapter sends the right Redis commands", async () => {
  const sent = [];
  const data = new Map();
  const fakeFetch = async (url, init) => {
    assert.strictEqual(url, "https://redis.example.upstash.io");
    assert.strictEqual(init.headers.Authorization, "Bearer secret-token");
    const cmd = JSON.parse(init.body);
    sent.push(cmd);
    let result = null;
    if (cmd[0] === "SET") { data.set(cmd[1], cmd[2]); result = "OK"; }
    if (cmd[0] === "GET") result = data.has(cmd[1]) ? data.get(cmd[1]) : null;
    if (cmd[0] === "MGET") result = cmd.slice(1).map((k) => (data.has(k) ? data.get(k) : null));
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  const store = upstashStore("https://redis.example.upstash.io", "secret-token", fakeFetch);
  await store.set("k1", "v1");
  assert.deepStrictEqual(sent[0], ["SET", "k1", "v1", "EX", String(60 * 60 * 24 * 120)]);
  assert.strictEqual(await store.get("k1"), "v1");
  assert.strictEqual(await store.get("missing"), null);
  assert.deepStrictEqual(await store.mget(["k1", "missing"]), ["v1", null]);
  assert.deepStrictEqual(await store.mget([]), []);

  // and the whole API works on top of it
  const deps = makeDeps({ store });
  const id = await createEvent(deps);
  assert.strictEqual((await call(deps, { action: "reveal", id, index: 0 })).status, 200);

  const errStore = upstashStore("https://x", "t", async () => ({ ok: false, status: 401, json: async () => ({ error: "WRONGPASS" }) }));
  await assert.rejects(() => errStore.get("k"), /WRONGPASS/);
});

test("store selection follows the environment", () => {
  assert.strictEqual(createStore({}).kind, "memory");
  assert.strictEqual(createStore({ KV_REST_API_URL: "https://a/", KV_REST_API_TOKEN: "t" }).kind, "upstash");
  assert.strictEqual(createStore({ UPSTASH_REDIS_REST_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "upstash");
  assert.strictEqual(createStore({ VERCEL: "1", STORAGE_KV_REST_API_URL: "https://a", STORAGE_KV_REST_API_TOKEN: "t" }).kind, "upstash", "prefixed names");
  assert.strictEqual(createStore({ VERCEL: "1", MY_UPSTASH_REDIS_REST_URL: "https://a", MY_UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "upstash", "prefixed names");
  assert.strictEqual(createStore({ VERCEL: "1", KV_REST_API_URL: "https://a", KV_REST_API_READ_ONLY_TOKEN: "t" }), null, "read-only token alone is not enough");
  assert.strictEqual(createStore({ VERCEL: "1", A_KV_REST_API_URL: "https://a", B_KV_REST_API_TOKEN: "t" }), null, "prefixes must match");
  assert.strictEqual(createStore({ VERCEL: "1" }), null, "never use memory on Vercel");
  assert.strictEqual(createStore({ NODE_ENV: "production" }), null);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("  ok   " + name);
    } catch (e) {
      failed++;
      console.log("  FAIL " + name + "\n       " + (e && e.message));
    }
  }
  console.log(failed ? "\n" + failed + " test(s) failed" : "\nAll tests passed");
  process.exit(failed ? 1 : 0);
})();
