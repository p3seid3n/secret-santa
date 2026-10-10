/*
 * Secret Santa – shared helpers.
 * Used by the pages (public/), by the server (server/handler.js) and by the tests.
 * No dependencies. Works in browsers from about 2017 on.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SantaCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------------------------------------------------------- Names */

  // Lower case, no accents, single spaces: "  Müller   Anna " -> "muller anna"
  function normalize(text) {
    return String(text)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanName(text) {
    return String(text).replace(/\s+/g, " ").trim();
  }

  // One name per line. Returns the clean list plus names that appear twice.
  function parseNames(text) {
    var seen = {};
    var names = [];
    var duplicates = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var name = cleanName(line);
      if (!name) return;
      var key = normalize(name);
      if (seen[key]) {
        if (duplicates.indexOf(name) === -1) duplicates.push(name);
        return;
      }
      seen[key] = true;
      names.push(name);
    });
    return { names: names, duplicates: duplicates };
  }

  // Autocomplete: every typed word must be the beginning of a word in the name.
  // "an mu" finds "Anna Müller". Falls back to "contains" if nothing matches.
  function findMatches(names, query) {
    var q = normalize(query);
    if (!q) return [];
    var tokens = q.split(" ");
    var norm = names.map(normalize);
    var hits = [];

    names.forEach(function (_, i) {
      var words = norm[i].split(" ");
      var ok = tokens.every(function (t) {
        return words.some(function (w) { return w.indexOf(t) === 0; });
      });
      if (ok) hits.push(i);
    });

    if (!hits.length) {
      names.forEach(function (_, i) {
        if (norm[i].indexOf(q) !== -1) hits.push(i);
      });
    }

    function rank(i) {
      if (norm[i] === q) return 0;
      if (norm[i].indexOf(q) === 0) return 1;
      return 2;
    }
    hits.sort(function (a, b) {
      return rank(a) - rank(b) || (names[a] < names[b] ? -1 : names[a] > names[b] ? 1 : 0);
    });
    return hits;
  }

  /* ----------------------------------------------------------------- Draw */

  function secureRandom() {
    var c = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : null;
    if (c) {
      var a = new Uint32Array(1);
      c.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }

  function range(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }

  function shuffle(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // names: array of strings.
  // forbiddenPairs: array of [giverIndex, receiverIndex] that must NOT happen.
  // Returns { ok: true, assignment } where assignment[giver] = receiver,
  // or { ok: false, reason: "tooFew" | "impossible" }.
  function draw(names, forbiddenPairs, rnd) {
    rnd = rnd || secureRandom;
    var n = names.length;
    if (n < 3) return { ok: false, reason: "tooFew" };

    var banned = [];
    for (var g = 0; g < n; g++) {
      banned.push(new Array(n).fill(false));
      banned[g][g] = true; // nobody gets themselves
    }
    (forbiddenPairs || []).forEach(function (pair) {
      banned[pair[0]][pair[1]] = true;
    });

    // 1) Fair way: shuffle everybody and check the rules. Almost always works.
    for (var attempt = 0; attempt < 3000; attempt++) {
      var perm = shuffle(range(n), rnd);
      var good = true;
      for (var i = 0; i < n; i++) {
        if (banned[i][perm[i]]) { good = false; break; }
      }
      if (good) return { ok: true, assignment: perm };
    }

    // 2) Guaranteed way for very strict rules: find a complete matching.
    var prefs = range(n).map(function (giver) {
      return shuffle(range(n).filter(function (r) { return !banned[giver][r]; }), rnd);
    });
    var giverOf = new Array(n).fill(-1);

    function place(giver, seen) {
      var options = prefs[giver];
      for (var k = 0; k < options.length; k++) {
        var r = options[k];
        if (seen[r]) continue;
        seen[r] = true;
        if (giverOf[r] === -1 || place(giverOf[r], seen)) {
          giverOf[r] = giver;
          return true;
        }
      }
      return false;
    }

    var order = shuffle(range(n), rnd);
    for (var o = 0; o < order.length; o++) {
      if (!place(order[o], new Array(n).fill(false))) {
        return { ok: false, reason: "impossible" };
      }
    }
    var assignment = new Array(n);
    giverOf.forEach(function (giver, receiver) { assignment[giver] = receiver; });
    return { ok: true, assignment: assignment };
  }

  // True only if everybody gives exactly once, receives exactly once,
  // nobody gets themselves and no forbidden pair happened.
  function verify(count, forbiddenPairs, assignment) {
    if (!Array.isArray(assignment) || assignment.length !== count) return false;
    var seen = {};
    for (var g = 0; g < count; g++) {
      var r = assignment[g];
      if (typeof r !== "number" || r % 1 !== 0 || r < 0 || r >= count || r === g || seen[r]) return false;
      seen[r] = true;
    }
    return !(forbiddenPairs || []).some(function (p) { return assignment[p[0]] === p[1]; });
  }

  // Hints for when the rules leave no solution. The page turns these into
  // sentences in the chosen language:
  //   { type: "giver", name }    this person would have nobody left to give to
  //   { type: "receiver", name } nobody would be allowed to give to this person
  function explainImpossible(names, forbiddenPairs) {
    var n = names.length;
    var can = range(n).map(function (g) {
      return range(n).map(function (r) { return g !== r; });
    });
    forbiddenPairs.forEach(function (p) { can[p[0]][p[1]] = false; });
    var notes = [];
    for (var g = 0; g < n; g++) {
      if (!can[g].some(Boolean)) notes.push({ type: "giver", name: names[g] });
    }
    for (var r = 0; r < n; r++) {
      var anyone = false;
      for (var k = 0; k < n; k++) if (can[k][r]) anyone = true;
      if (!anyone) notes.push({ type: "receiver", name: names[r] });
    }
    return notes;
  }

  /* ------------------------------------------------------------- Wishlist */

  // Limits are enforced by the server too. The browser only uses them to stay friendly.
  var LIMITS = { notes: 8000, noteText: 200, url: 1000, links: 30 };

  // Only normal web links are accepted (never "javascript:" and similar).
  // "www.shop.com/x" becomes "https://www.shop.com/x". Returns null if unusable.
  function cleanUrl(text) {
    var s = String(text).trim();
    if (!s || s.length > LIMITS.url) return null;
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) s = "https://" + s;
    try {
      var url = new URL(s);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (url.hostname.indexOf(".") === -1) return null;
      return url.href.length > LIMITS.url ? null : url.href;
    } catch (e) {
      return null;
    }
  }

  function hostName(href) {
    try { return new URL(href).hostname.replace(/^www\./, ""); } catch (e) { return String(href); }
  }

  // Cleans whatever a browser sent: { notes, links: [{ url, note }] }.
  // Unusable links are dropped, texts are cut to their limits.
  function sanitizeWish(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var notes = typeof raw.notes === "string" ? raw.notes.replace(/\r\n/g, "\n").slice(0, LIMITS.notes) : "";
    var links = [];
    (Array.isArray(raw.links) ? raw.links : []).forEach(function (item) {
      if (links.length >= LIMITS.links || !item || typeof item.url !== "string") return;
      var url = cleanUrl(item.url);
      if (!url) return;
      var note = typeof item.note === "string" ? item.note.trim().slice(0, LIMITS.noteText) : "";
      links.push({ url: url, note: note });
    });
    return { notes: notes, links: links };
  }

  // The wishlist is one free text. Older wishlists also had a separate list of links;
  // wishText() folds those into the text (one per line, below the notes).
  function wishText(wish) {
    var text = wish && typeof wish.notes === "string" ? wish.notes : "";
    var extra = [];
    ((wish && wish.links) || []).forEach(function (link) {
      extra.push((link.note ? link.note + "\n" : "") + link.url);
    });
    if (!extra.length) return text;
    return (text.trim() ? text.replace(/\s+$/, "") + "\n\n" : "") + extra.join("\n");
  }

  // Cuts a text into parts so that web addresses can become links:
  //   [{ text: "Warm socks " }, { text: "www.shop.com/a", url: "https://www.shop.com/a" }, ...]
  // Only addresses that cleanUrl accepts get a url, so nothing else can become a link.
  function linkify(text) {
    var parts = [];
    var rest = String(text);
    var re = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;
    var last = 0;
    var m;
    while ((m = re.exec(rest)) !== null) {
      var raw = m[0].replace(/[.,;:!?)\]]+$/, "");
      var url = cleanUrl(raw);
      if (!url) continue;
      if (m.index > last) parts.push({ text: rest.slice(last, m.index) });
      parts.push({ text: raw, url: url });
      last = m.index + raw.length;
      re.lastIndex = last;
    }
    if (last < rest.length) parts.push({ text: rest.slice(last) });
    return parts;
  }

  /* ------------------------------------------------------------ Clipboard */

  // Browser only. Returns a Promise.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.top = "0";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      box.setSelectionRange(0, text.length);
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      document.body.removeChild(box);
      if (done) resolve(); else reject(new Error("copy failed"));
    });
  }

  return {
    normalize: normalize,
    cleanName: cleanName,
    parseNames: parseNames,
    findMatches: findMatches,
    draw: draw,
    verify: verify,
    explainImpossible: explainImpossible,
    LIMITS: LIMITS,
    cleanUrl: cleanUrl,
    hostName: hostName,
    sanitizeWish: sanitizeWish,
    wishText: wishText,
    linkify: linkify,
    copyText: copyText
  };
});
