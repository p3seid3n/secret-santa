// Run with:  node test/i18n.test.js
// Checks that Spanish and English are complete and that every text used by the pages exists.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const I18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const { es, en } = I18n.STRINGS;

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

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");

test("Spanish and English have exactly the same keys", () => {
  assert.deepStrictEqual(Object.keys(es).sort(), Object.keys(en).sort());
});

test("no text is empty and placeholders match in both languages", () => {
  Object.keys(es).forEach((key) => {
    assert.ok(es[key].trim() && en[key].trim(), "empty text for " + key);
    assert.strictEqual(placeholders(es[key]), placeholders(en[key]), "placeholders differ for " + key);
  });
});

test("t() fills placeholders and falls back to the key name for unknown keys", () => {
  I18n.setLang("es");
  assert.strictEqual(I18n.t("hello", { name: "Ana" }), "¡Hola, Ana!");
  I18n.setLang("en");
  assert.strictEqual(I18n.t("hello", { name: "Ana" }), "Hello Ana!");
  assert.strictEqual(I18n.t("does_not_exist"), "does_not_exist");
  I18n.setLang("es");
});

const files = ["index.html", "host.html", "guest.js", "host.js", "i18n.js"].map((f) => [f, read(f)]);

function usedKeys() {
  const keys = new Set();
  files.forEach(([file, text]) => {
    let m;
    const attr = /data-(?:i18n|title-key)="([a-z_]+)"/g;
    while ((m = attr.exec(text))) keys.add(m[1]);
    if (file.endsWith(".js") && file !== "i18n.js") {
      const call = /\bt\("([a-z_]+)"/g;
      while ((m = call.exec(text))) keys.add(m[1]);
      const msg = /setMessage\([^,)]+,\s*"([a-z_]+)"/g;
      while ((m = msg.exec(text))) keys.add(m[1]);
      const underscored = /"([a-z]+(?:_[a-z]+)+)"/g;
      while ((m = underscored.exec(text))) keys.add(m[1]);
    }
    if (file === "i18n.js") {
      const call = /\bt\("([a-z_]+)"/g;
      while ((m = call.exec(text))) keys.add(m[1]);
    }
  });
  return keys;
}

test("every text the pages ask for exists", () => {
  const missing = [...usedKeys()].filter((k) => !(k in es));
  assert.deepStrictEqual(missing, []);
});

test("every text in the dictionary is used somewhere", () => {
  const used = usedKeys();
  const unused = Object.keys(es).filter((k) => !used.has(k));
  assert.deepStrictEqual(unused, []);
});

test("both pages start in Spanish and offer the language button", () => {
  ["index.html", "host.html"].forEach((f) => {
    const html = read(f);
    assert.ok(/<html lang="es"/.test(html), f + " should start with lang=es");
    assert.ok(/id="lang-toggle"/.test(html), f + " needs the language button");
  });
});

console.log(failed ? "\n" + failed + " test(s) failed" : "\nAll tests passed");
process.exit(failed ? 1 : 0);
