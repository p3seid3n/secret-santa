/*
 * Secret Santa – guest page (index.html).
 * Flow: type name -> confirm -> see who you give to -> optional wishlist.
 */
(function () {
  "use strict";

  var Core = window.SantaCore;
  var I18n = window.I18n;
  var t = I18n.t;
  var $ = function (id) { return document.getElementById(id); };

  var SCREENS = ["name", "confirm", "result", "wishlist", "error"];

  var names = [];
  var assignment = [];
  var drawId = "";
  var me = -1;         // index of the person using the page right now
  var pending = -1;    // index of the person waiting for "Yes, that is me"
  var wish = { notes: "", links: [] };

  /* ------------------------------------------------------------ Screens */

  function show(screen, focusInput) {
    SCREENS.forEach(function (s) { $("screen-" + s).hidden = s !== screen; });
    try { window.scrollTo(0, 0); } catch (e) { /* not important */ }
    if (focusInput) {
      $("name-input").focus();
    } else {
      var heading = document.querySelector("#screen-" + screen + " h1");
      if (heading) heading.focus();
    }
  }

  // Messages remember their text key, so they switch language together with the page.
  function setMessage(el, key, vars) {
    el._key = key;
    el._vars = vars || null;
    el.textContent = t(key, vars);
    el.hidden = false;
  }

  function clearMessage(el) {
    el._key = null;
    el._vars = null;
    el.textContent = "";
    el.hidden = true;
  }

  function retranslateMessage(el) {
    if (el._key) el.textContent = t(el._key, el._vars);
  }

  /* --------------------------------------------------------------- Start */

  function readDraw() {
    var match = /[#&]d=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (!match) return null;
    var data = Core.decodeDraw(match[1]);
    if (!data) return null;
    names = data.names;
    assignment = data.assignment;
    drawId = Core.shortId(match[1]);
    return data;
  }

  /* ---------------------------------------------------- 1. Type the name */

  function renderSuggestions() {
    var list = $("suggestions");
    list.textContent = "";
    var hits = Core.findMatches(names, $("name-input").value).slice(0, 8);
    hits.forEach(function (index) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary";
      btn.textContent = names[index];
      btn.addEventListener("click", function () { askToConfirm(index); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function askToConfirm(index) {
    pending = index;
    $("confirm-name").textContent = names[index];
    show("confirm");
  }

  function onNameSubmit(event) {
    event.preventDefault();
    var message = $("name-msg");
    clearMessage(message);

    var typed = $("name-input").value;
    if (!Core.normalize(typed)) {
      setMessage(message, "name_empty");
      return;
    }

    var wanted = Core.normalize(typed);
    var exact = -1;
    names.forEach(function (name, i) {
      if (Core.normalize(name) === wanted) exact = i;
    });
    if (exact >= 0) return askToConfirm(exact);

    var hits = Core.findMatches(names, typed);
    if (hits.length === 1) return askToConfirm(hits[0]);

    setMessage(message, hits.length === 0 ? "name_not_found" : "name_pick");
  }

  /* ------------------------------------------------- 2. Is this you? */

  function onConfirmYes() {
    me = pending;
    renderResult();
    wish = loadWish();
    show("result");
  }

  function onConfirmNo() {
    pending = -1;
    show("name", true);
  }

  /* ------------------------------------------- 3. Result / hide the screen */

  function renderResult() {
    if (me < 0) return;
    $("result-title").textContent = t("hello", { name: names[me] });
    $("result-recipient").textContent = names[assignment[me]];
  }

  function onDone() {
    me = -1;
    pending = -1;
    $("name-input").value = "";
    $("suggestions").textContent = "";
    clearMessage($("name-msg"));
    $("result-title").textContent = "";
    $("result-recipient").textContent = "";
    show("name");
  }

  /* ----------------------------------------------------------- 4. Wishlist */

  function wishKey() {
    return "santa:" + drawId + ":" + Core.normalize(names[me]);
  }

  function loadWish() {
    try {
      var raw = window.localStorage.getItem(wishKey());
      if (raw) {
        var saved = JSON.parse(raw);
        return {
          notes: typeof saved.notes === "string" ? saved.notes : "",
          links: Array.isArray(saved.links)
            ? saved.links.filter(function (l) { return l && typeof l.url === "string"; })
            : []
        };
      }
    } catch (e) { /* storage not available */ }
    return { notes: "", links: [] };
  }

  function saveWish() {
    try {
      window.localStorage.setItem(wishKey(), JSON.stringify(wish));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Only normal web links are accepted (never "javascript:" and similar).
  function cleanUrl(text) {
    var s = String(text).trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) s = "https://" + s;
    try {
      var url = new URL(s);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (url.hostname.indexOf(".") === -1) return null;
      return url.href;
    } catch (e) {
      return null;
    }
  }

  function hostName(href) {
    try { return new URL(href).hostname.replace(/^www\./, ""); } catch (e) { return href; }
  }

  function openWishlist() {
    $("notes").value = wish.notes;
    clearMessage($("link-msg"));
    clearMessage($("copy-msg"));
    clearMessage($("notes-status"));
    $("notes-status").hidden = false;
    $("link-url").value = "";
    $("link-note").value = "";
    renderLinks();
    show("wishlist");
  }

  function onNotesInput() {
    wish.notes = $("notes").value;
    setMessage($("notes-status"), saveWish() ? "notes_saved" : "notes_error");
  }

  function renderLinks() {
    var list = $("link-list");
    list.textContent = "";
    wish.links.forEach(function (link, index) {
      var label = link.note || hostName(link.url);

      var li = document.createElement("li");
      li.className = "item";

      var p = document.createElement("p");
      var a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      p.appendChild(a);
      li.appendChild(p);

      if (link.note) {
        var site = document.createElement("p");
        site.className = "hint";
        site.textContent = hostName(link.url);
        li.appendChild(site);
      }

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn secondary small";
      remove.textContent = t("remove");
      remove.setAttribute("aria-label", t("remove_aria", { label: label }));
      remove.addEventListener("click", function () {
        if (window.confirm(t("remove_confirm"))) {
          wish.links.splice(index, 1);
          saveWish();
          renderLinks();
        }
      });
      li.appendChild(remove);

      list.appendChild(li);
    });
  }

  function onLinkSubmit(event) {
    event.preventDefault();
    var message = $("link-msg");
    clearMessage(message);

    var url = cleanUrl($("link-url").value);
    if (!url) {
      setMessage(message, "link_bad");
      return;
    }
    wish.links.push({ url: url, note: $("link-note").value.trim() });
    if (!saveWish()) {
      setMessage(message, "link_not_saved");
    }
    $("link-url").value = "";
    $("link-note").value = "";
    renderLinks();
  }

  function wishAsText() {
    var lines = [];
    var notes = wish.notes.trim();
    if (notes) lines.push(t("wish_text_notes"), notes, "");
    if (wish.links.length) {
      lines.push(t("wish_text_links"));
      wish.links.forEach(function (l) {
        lines.push("- " + (l.note ? l.note + ": " : "") + l.url);
      });
    }
    if (!lines.length) return "";
    return [t("wish_text_title", { name: names[me] }), ""].concat(lines).join("\n").trim();
  }

  function onCopyWish() {
    var message = $("copy-msg");
    var text = wishAsText();
    if (!text) {
      message.className = "msg error";
      setMessage(message, "copy_empty");
      return;
    }
    Core.copyText(text).then(function () {
      message.className = "msg ok";
      setMessage(message, "copy_ok");
    }, function () {
      message.className = "msg error";
      setMessage(message, "copy_fail");
    });
  }

  /* ------------------------------------------------------------- Language */

  function onLanguageChanged() {
    ["name-msg", "link-msg", "copy-msg", "notes-status"].forEach(function (id) {
      retranslateMessage($(id));
    });
    renderResult();
    if (me >= 0) renderLinks();
  }

  /* ---------------------------------------------------------------- Start */

  function init() {
    I18n.init();
    I18n.onChange(onLanguageChanged);

    if (!readDraw()) {
      show("error");
      return;
    }
    $("name-form").addEventListener("submit", onNameSubmit);
    $("name-input").addEventListener("input", function () {
      clearMessage($("name-msg"));
      renderSuggestions();
    });
    $("confirm-yes").addEventListener("click", onConfirmYes);
    $("confirm-no").addEventListener("click", onConfirmNo);
    $("result-done").addEventListener("click", onDone);
    $("open-wishlist").addEventListener("click", openWishlist);
    $("notes").addEventListener("input", onNotesInput);
    $("link-form").addEventListener("submit", onLinkSubmit);
    $("copy-wish").addEventListener("click", onCopyWish);
    $("wish-back").addEventListener("click", function () { show("result"); });
    show("name");
  }

  init();
})();
