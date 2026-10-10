// Run with:  node test/draw.test.js
const assert = require("assert");
const Core = require("../public/shared.js");

// Small seeded random generator so the tests give the same result every time.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Brute force: is there ANY valid assignment? (only for small groups)
function anySolution(n, forbidden) {
  const banned = new Set(forbidden.map(([g, r]) => g + ">" + r));
  const used = new Array(n).fill(false);
  function go(g) {
    if (g === n) return true;
    for (let r = 0; r < n; r++) {
      if (r === g || used[r] || banned.has(g + ">" + r)) continue;
      used[r] = true;
      if (go(g + 1)) { used[r] = false; return true; }
      used[r] = false;
    }
    return false;
  }
  return go(0);
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (e && e.message));
  }
}

test("normalize ignores case, accents and extra spaces", () => {
  assert.strictEqual(Core.normalize("  MÜLLER   Anna "), "muller anna");
  assert.strictEqual(Core.normalize("Zoë"), "zoe");
});

test("parseNames cleans the list and reports duplicates", () => {
  const r = Core.parseNames("Anna\n\n  Peter  \r\nanna\nMüller\nMuller\n");
  assert.deepStrictEqual(r.names, ["Anna", "Peter", "Müller"]);
  assert.deepStrictEqual(r.duplicates, ["anna", "Muller"]);
});

test("findMatches completes names while typing", () => {
  const names = ["Anna Müller", "Hannah Keller", "Peter Meier", "Annika Frei"];
  const pick = (q) => Core.findMatches(names, q).map((i) => names[i]);
  assert.deepStrictEqual(pick("an"), ["Anna Müller", "Annika Frei"]);
  assert.deepStrictEqual(pick("anna mu"), ["Anna Müller"]);
  assert.deepStrictEqual(pick("MULLER"), ["Anna Müller"]);
  assert.deepStrictEqual(pick("kel"), ["Hannah Keller"]);
  assert.deepStrictEqual(pick("ann"), ["Anna Müller", "Annika Frei"]); // not Hannah
  assert.deepStrictEqual(pick("xyz"), []);
  assert.deepStrictEqual(pick("  "), []);
  assert.deepStrictEqual(pick("annah"), ["Hannah Keller"]); // fallback: contains
});

test("draw: always valid, and agrees with brute force on 400 random setups", () => {
  const rnd = seeded(42);
  for (let round = 0; round < 400; round++) {
    const n = 3 + Math.floor(rnd() * 5); // 3..7 people
    const names = Array.from({ length: n }, (_, i) => "P" + i);
    const forbidden = [];
    const rules = Math.floor(rnd() * n * 2);
    for (let k = 0; k < rules; k++) {
      const a = Math.floor(rnd() * n);
      const b = Math.floor(rnd() * n);
      if (a === b) continue;
      forbidden.push([a, b]);
      if (rnd() < 0.5) forbidden.push([b, a]);
    }
    const result = Core.draw(names, forbidden, seeded(round + 1));
    const possible = anySolution(n, forbidden);
    assert.strictEqual(result.ok, possible, "round " + round + ": ok=" + result.ok + " but possible=" + possible);
    if (result.ok) {
      assert.ok(Core.verify(n, forbidden, result.assignment), "round " + round + ": invalid assignment");
    } else {
      assert.strictEqual(result.reason, "impossible");
    }
  }
});

test("draw: strict rules still work (needs the guaranteed method)", () => {
  const n = 12;
  const names = Array.from({ length: n }, (_, i) => "P" + i);
  const forbidden = [];
  for (let g = 0; g < n; g++) {
    for (let r = 0; r < n; r++) {
      if (r !== (g + 1) % n && r !== (g + 2) % n) forbidden.push([g, r]);
    }
  }
  const result = Core.draw(names, forbidden, seeded(7));
  assert.ok(result.ok);
  assert.ok(Core.verify(n, forbidden, result.assignment));
});

test("draw: impossible rules are reported", () => {
  // With 3 people the only options are two circles. Forbid both for A and B.
  const names = ["A", "B", "C"];
  const forbidden = [[0, 1], [1, 0]];
  const result = Core.draw(names, forbidden, seeded(1));
  assert.deepStrictEqual(result, { ok: false, reason: "impossible" });
});

test("draw: fewer than 3 people is refused", () => {
  assert.deepStrictEqual(Core.draw(["A", "B"], [], seeded(1)), { ok: false, reason: "tooFew" });
});

test("explainImpossible names the stuck person", () => {
  const names = ["A", "B", "C"];
  const notes = Core.explainImpossible(names, [[0, 1], [0, 2]]);
  assert.deepStrictEqual(notes, [{ type: "giver", name: "A" }]);
});

test("draw: nobody is favoured (4 people, 6000 draws)", () => {
  const rnd = seeded(2024);
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const r = Core.draw(["A", "B", "C", "D"], [], rnd);
    const key = "0>" + r.assignment[0];
    counts[key] = (counts[key] || 0) + 1;
  }
  ["0>1", "0>2", "0>3"].forEach((k) => {
    assert.ok(counts[k] > 1700 && counts[k] < 2300, k + " happened " + counts[k] + " times");
  });
  assert.strictEqual(counts["0>0"], undefined);
});

test("cleanUrl accepts normal web addresses only", () => {
  assert.strictEqual(Core.cleanUrl("www.shop.example/lamp?id=3"), "https://www.shop.example/lamp?id=3");
  assert.strictEqual(Core.cleanUrl("  http://a.example.com  "), "http://a.example.com/");
  ["javascript:alert(1)", "data:text/html,x", "ftp://a.example.com", "just words", "localhost", "", "   "].forEach((bad) => {
    assert.strictEqual(Core.cleanUrl(bad), null, bad);
  });
  assert.strictEqual(Core.cleanUrl("https://a.example.com/" + "x".repeat(1100)), null);
});

test("hostName shows a short site name", () => {
  assert.strictEqual(Core.hostName("https://www.shop.example/lamp"), "shop.example");
});

test("sanitizeWish keeps good data and drops the rest", () => {
  const w = Core.sanitizeWish({ notes: "a\r\nb", links: [{ url: "a.example.com", note: " hi " }, { url: "javascript:1" }, null, { url: 5 }] });
  assert.deepStrictEqual(w, { notes: "a\nb", links: [{ url: "https://a.example.com/", note: "hi" }] });
  assert.deepStrictEqual(Core.sanitizeWish(null), { notes: "", links: [] });
  assert.deepStrictEqual(Core.sanitizeWish({ notes: 5, links: "x" }), { notes: "", links: [] });
});

console.log(failed ? "\n" + failed + " test(s) failed" : "\nAll tests passed");
process.exit(failed ? 1 : 0);
