// Run with:  node test/rich.test.js
const assert = require("assert");
const Rich = require("../public/rich.js");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const flat = (runs) => runs.map((r) => [r.text, r.bold ? "b" : "", r.italic ? "i" : "", r.url || ""].join("|"));

test("parse reads bold, italic, lists, links and cards", () => {
  const blocks = Rich.parse("Hello **big** and *small* world\n- one\n- **two**\nsee www.shop.example/a, ok\nhttps://shop.example/item\n\nlast");
  assert.deepStrictEqual(blocks.map((b) => b.type), ["p", "ul", "p", "card", "p", "p"]);
  assert.deepStrictEqual(flat(blocks[0].runs), ["Hello |||", "big|b||", " and |||", "small||i|", " world|||"]);
  assert.strictEqual(blocks[1].items.length, 2);
  assert.deepStrictEqual(flat(blocks[1].items[1]), ["two|b||"]);
  assert.deepStrictEqual(blocks[2].runs.filter((r) => r.url).map((r) => r.url), ["https://www.shop.example/a"]);
  assert.deepStrictEqual(blocks[3], { type: "card", url: "https://shop.example/item" });
  assert.deepStrictEqual(blocks[4].runs, []);
});

test("a line with an address and other words is a normal paragraph, not a card", () => {
  const b = Rich.parse("look https://shop.example/x");
  assert.strictEqual(b[0].type, "p");
  assert.strictEqual(Rich.parse("javascript:alert(1)")[0].type, "p");
  assert.strictEqual(Rich.parse("http://localhost/x")[0].type, "p");
});

test("stringify and parse agree, including stars and dashes in normal text", () => {
  const samples = [
    "plain", "**bold** and *italic* and ***both***", "- a\n- b\n\ntext", "2 * 3 = 6 and a\\*b", "\\- not a list", "https://shop.example/a\nafter",
    "a\\\\b", "**a*b*c**"
  ];
  samples.forEach((text) => {
    const once = Rich.stringify(Rich.parse(text));
    const twice = Rich.stringify(Rich.parse(once));
    assert.strictEqual(twice, once, "stable for: " + text);
  });
  const blocks = [{ type: "p", runs: [{ text: "2 * 3", bold: false, italic: false }] }, { type: "p", runs: [{ text: "- x", bold: true, italic: false }] }];
  const text = Rich.stringify(blocks);
  const back = Rich.parse(text);
  assert.strictEqual(back[0].runs[0].text, "2 * 3");
  assert.strictEqual(back[1].type, "p");
  assert.strictEqual(back[1].runs[0].text, "- x");
  assert.strictEqual(back[1].runs[0].bold, true);
});

test("trailing empty lines are dropped and empty list items disappear", () => {
  assert.strictEqual(Rich.stringify([{ type: "p", runs: [{ text: "a", bold: false, italic: false }] }, { type: "p", runs: [] }, { type: "p", runs: [] }]), "a");
  assert.strictEqual(Rich.stringify([{ type: "ul", items: [[], [{ text: "x", bold: false, italic: false }]] }]), "- x");
});

test("nothing but bold, italic, lists, links and cards can come out of parse", () => {
  const blocks = Rich.parse("<script>alert(1)</script> <b>no</b> [x](javascript:alert(1))");
  const kinds = new Set();
  blocks.forEach((b) => { kinds.add(b.type); (b.runs || []).forEach((r) => { if (r.url) assert.ok(/^https?:/.test(r.url)); }); });
  assert.deepStrictEqual([...kinds], ["p"]);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok   " + name); }
    catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
  }
  console.log(failed ? "\n" + failed + " test(s) failed" : "\nAll tests passed");
  process.exit(failed ? 1 : 0);
})();
