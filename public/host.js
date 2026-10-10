/*
 * Secret Santa – host page (host.html).
 * Enter names, add "should not get" rules, draw, and get one link to share.
 */
(function () {
  "use strict";

  var Core = window.SantaCore;
  var I18n = window.I18n;
  var Api = window.SantaApi;
  var t = I18n.t;
  var STORAGE_KEY = "santa-host-v1";
  var PASSWORD_KEY = "santa-host-password"; // kept only until the tab is closed
  var $ = function (id) { return document.getElementById(id); };

  // names: the text box content. rules: [{a, b, both}]. link: last link created.
  var state = { names: "", rules: [], link: "", codes: {}, open: true, openServer: false };

  /* -------------------------------------------------------------- Storage */

  function loadState() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (typeof saved.names === "string") state.names = saved.names;
      if (Array.isArray(saved.rules)) {
        state.rules = saved.rules
          .filter(function (r) { return r && typeof r.a === "string" && typeof r.b === "string"; })
          .map(function (r) { return { a: r.a, b: r.b, both: !!r.both }; });
      }
      if (typeof saved.link === "string") state.link = saved.link;
      if (typeof saved.open === "boolean") state.open = saved.open;
      if (typeof saved.openServer === "boolean") state.openServer = saved.openServer;
      if (saved.codes && typeof saved.codes === "object") {
        Object.keys(saved.codes).forEach(function (name) {
          if (typeof saved.codes[name] === "string") state.codes[name] = saved.codes[name];
        });
      }
    } catch (e) { /* storage not available: the page still works */ }
  }

  function saveState() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- Helpers */

  function currentNames() {
    return Core.parseNames($("names").value).names;
  }

  // Messages remember their text key, so they switch language together with the page.
  // vars may be a function when the values themselves depend on the language.
  function setMessage(el, key, vars) {
    el._key = key;
    el._vars = vars || null;
    renderMessage(el);
    el.hidden = false;
  }

  function renderMessage(el) {
    if (!el._key) return;
    var vars = typeof el._vars === "function" ? el._vars() : el._vars;
    el.textContent = t(el._key, vars);
  }

  function clearMessage(el) {
    el._key = null;
    el._vars = null;
    el.textContent = "";
    el.hidden = true;
  }

  /* ------------------------------------------------------------- 1. Names */

  function updateNamesInfo() {
    var parsed = Core.parseNames($("names").value);
    var n = parsed.names.length;
    var text = "";
    if (n > 0) text = t(n === 1 ? "count_one" : "count_other", { n: n });
    if (n > 0 && n < 3) text += t("count_need");
    if (parsed.duplicates.length) {
      text += (text ? ". " : "") + t("count_dupes", { names: parsed.duplicates.join(", ") });
    }
    $("names-count").textContent = text;
    $("names-count").className = parsed.duplicates.length ? "hint warn" : "hint";
  }

  function fillSelect(select, names) {
    var previous = select.value;
    select.textContent = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = t("choose_name");
    select.appendChild(first);
    names.forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    select.value = names.indexOf(previous) === -1 ? "" : previous;
  }

  /* ------------------------------------------------------ Personal codes */

  function normalizeCode(code) {
    return Core.normalize(code).replace(/\s/g, "");
  }

  // Codes of the people who are in the list now (empty ones left out).
  function currentCodes() {
    var out = {};
    currentNames().forEach(function (name) {
      if (normalizeCode(state.codes[name] || "")) out[name] = state.codes[name];
    });
    return out;
  }

  function codesAreValid() {
    var codes = currentCodes();
    return Object.keys(codes).every(function (name) {
      var n = normalizeCode(codes[name]).length;
      return n >= 4 && n <= 12;
    });
  }

  function renderCodes() {
    var box = $("code-list");
    box.textContent = "";
    currentNames().forEach(function (name, index) {
      var row = document.createElement("div");
      row.className = "code-row";
      var label = document.createElement("label");
      label.setAttribute("for", "code-" + index);
      label.textContent = name;
      var input = document.createElement("input");
      input.type = "text";
      input.id = "code-" + index;
      input.maxLength = 12;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", t("code_for", { name: name }));
      input.value = state.codes[name] || "";
      input.addEventListener("input", function () {
        state.codes[name] = input.value;
        saveState();
      });
      row.appendChild(label);
      row.appendChild(input);
      box.appendChild(row);
    });
  }

  function randomCode() {
    var a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return String(1000 + (a[0] % 9000));
  }

  function onMakeCodes() {
    var used = {};
    currentNames().forEach(function (name) {
      var code;
      do { code = randomCode(); } while (used[code]);
      used[code] = true;
      state.codes[name] = code;
    });
    saveState();
    renderCodes();
  }

  function onClearCodes() {
    state.codes = {};
    saveState();
    renderCodes();
  }

  function eventIdFromLink() {
    var match = /[#&]e=([A-Za-z0-9_-]{8,40})/.exec(state.link.slice(Math.max(0, state.link.indexOf("#"))));
    return match ? match[1] : "";
  }

  // Saves the codes for the event of the current link (the pairings do not change).
  function onUpdateCodes() {
    var message = $("codes-msg");
    message.className = "msg error";
    clearMessage(message);
    var id = eventIdFromLink();
    if (!id) return;
    if (!codesAreValid()) { setMessage(message, "draw_code_short"); return; }
    var password = $("host-password").value;
    if (!password) { setMessage(message, "draw_password_empty"); return; }

    var button = $("update-codes");
    button.disabled = true;
    Api.call("setcodes", { password: password, id: id, codes: currentCodes(), openAddress: state.open }).then(function (answer) {
      button.disabled = false;
      if (!answer.ok) { showDrawError(message, answer); return; }
      state.openServer = state.open;
      saveState();
      showLink(state.link);
      message.className = "msg ok";
      setMessage(message, "codes_saved");
    }, function () {
      button.disabled = false;
      setMessage(message, "draw_offline");
    });
  }

  function refreshNameDependentParts() {
    renderCodes();
    updateNamesInfo();
    var names = currentNames();
    fillSelect($("rule-a"), names);
    fillSelect($("rule-b"), names);
    renderRules();
  }

  function onNamesChanged() {
    state.names = $("names").value;
    saveState();
    refreshNameDependentParts();
  }

  /* -------------------------------------------------------------- 2. Rules */

  function ruleText(rule) {
    return rule.both
      ? t("rule_both_text", { a: rule.a, b: rule.b })
      : t("rule_one_text", { a: rule.a, b: rule.b });
  }

  function renderRules() {
    var list = $("rule-list");
    list.textContent = "";
    var names = currentNames();

    state.rules.forEach(function (rule, index) {
      var li = document.createElement("li");
      li.className = "item";

      var p = document.createElement("p");
      p.textContent = ruleText(rule);
      li.appendChild(p);

      var missing = [rule.a, rule.b].filter(function (n) { return names.indexOf(n) === -1; });
      if (missing.length) {
        var warn = document.createElement("p");
        warn.className = "hint warn";
        warn.textContent = t("rule_missing", { names: missing.join(", ") });
        li.appendChild(warn);
      }

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn tonal small";
      remove.textContent = t("rule_remove");
      remove.addEventListener("click", function () {
        state.rules.splice(index, 1);
        saveState();
        renderRules();
      });
      li.appendChild(remove);

      list.appendChild(li);
    });
  }

  function onAddRule() {
    var message = $("rule-msg");
    clearMessage(message);

    var a = $("rule-a").value;
    var b = $("rule-b").value;
    var both = $("rule-both").checked;

    if (!a || !b) {
      setMessage(message, "rule_pick_both");
      return;
    }
    if (a === b) {
      setMessage(message, "rule_same");
      return;
    }
    var exists = state.rules.some(function (r) {
      return (r.a === a && r.b === b && r.both === both) ||
             (both && r.both && r.a === b && r.b === a);
    });
    if (exists) {
      setMessage(message, "rule_exists");
      return;
    }

    state.rules.push({ a: a, b: b, both: both });
    saveState();
    renderRules();
    $("rule-a").value = "";
    $("rule-b").value = "";
  }

  /* --------------------------------------------------------------- 3. Draw */

  // The link to send: just the site address when the server was told to allow that,
  // otherwise the long personal link.
  function shownLink(link) {
    return state.openServer ? new URL("./", link).href : link;
  }

  function showLink(link) {
    link = shownLink(link);
    $("link-out").value = link;
    $("open-link").href = link;
    clearMessage($("copy-msg"));
    clearMessage($("reshuffle-msg"));
    clearMessage($("codes-msg"));
    $("result").hidden = false;
  }

  function hintsText(hints) {
    return function () {
      return {
        hints: (hints || []).map(function (h) {
          return t(h.type === "giver" ? "hint_giver" : "hint_receiver", { name: h.name });
        }).join(" ")
      };
    };
  }

  // Shows the server's error code as a sentence in the chosen language.
  function showDrawError(message, answer) {
    message.className = "msg error";
    switch (answer.error) {
      case "bad_password": return setMessage(message, "draw_bad_password");
      case "no_password_set": return setMessage(message, "draw_no_password");
      case "no_storage": return setMessage(message, "draw_no_storage");
      case "impossible": return setMessage(message, "draw_impossible", hintsText(answer.hints));
      case "duplicates": return setMessage(message, "draw_dupes", { names: (answer.names || []).join(", ") });
      case "too_few": return setMessage(message, "draw_few");
      case "bad_code_format": return setMessage(message, "draw_code_short");
      case "bad_rule": return setMessage(message, "draw_broken_rule");
      default: return setMessage(message, "draw_error");
    }
  }

  function onDraw() {
    var message = $("draw-msg");
    message.className = "msg error";
    clearMessage(message);

    var parsed = Core.parseNames($("names").value);
    var names = parsed.names;

    if (parsed.duplicates.length) {
      setMessage(message, "draw_dupes", { names: parsed.duplicates.join(", ") });
      return;
    }
    if (names.length < 3) {
      setMessage(message, "draw_few");
      return;
    }

    var broken = state.rules.some(function (rule) {
      return names.indexOf(rule.a) === -1 || names.indexOf(rule.b) === -1;
    });
    if (broken) {
      setMessage(message, "draw_broken_rule");
      return;
    }

    if (!codesAreValid()) {
      setMessage(message, "draw_code_short");
      return;
    }

    var password = $("host-password").value;
    if (!password) {
      setMessage(message, "draw_password_empty");
      return;
    }

    if (state.link && !window.confirm(t("draw_again_confirm"))) {
      return;
    }

    var button = $("draw");
    button.disabled = true;
    message.className = "msg";
    setMessage(message, "draw_working");

    // The draw happens on the server, so this page never sees who gives to whom.
    Api.call("create", { password: password, names: names, rules: state.rules, codes: currentCodes(), openAddress: state.open }).then(function (answer) {
      button.disabled = false;
      if (!answer.ok) {
        showDrawError(message, answer);
        return;
      }
      message.className = "msg error";
      clearMessage(message);
      try { window.sessionStorage.setItem(PASSWORD_KEY, password); } catch (e) { /* ignore */ }
      var link = new URL("index.html", window.location.href);
      link.hash = "e=" + answer.id;
      state.link = link.href;
      state.openServer = state.open;
      saveState();
      showLink(state.link);
    }, function () {
      button.disabled = false;
      message.className = "msg error";
      setMessage(message, "draw_offline");
    });
  }

  function onCopyLink() {
    var message = $("copy-msg");
    Core.copyText($("link-out").value).then(function () {
      message.className = "msg ok";
      setMessage(message, "host_copy_ok");
    }, function () {
      $("link-out").select();
      message.className = "msg error";
      setMessage(message, "host_copy_fail");
    });
  }

  // Draws again for the event of the current link: same link, wishlists stay.
  function onReshuffle() {
    var message = $("reshuffle-msg");
    message.className = "msg error";
    clearMessage(message);

    var id = eventIdFromLink();
    if (!id) return;
    var password = $("host-password").value;
    if (!password) {
      setMessage(message, "draw_password_empty");
      return;
    }
    if (!window.confirm(t("reshuffle_confirm"))) return;

    var button = $("reshuffle");
    button.disabled = true;
    message.className = "msg";
    setMessage(message, "draw_working");

    Api.call("reshuffle", { password: password, id: id, rules: state.rules }).then(function (answer) {
      button.disabled = false;
      if (!answer.ok) {
        showDrawError(message, answer);
        return;
      }
      try { window.sessionStorage.setItem(PASSWORD_KEY, password); } catch (e) { /* ignore */ }
      message.className = "msg ok";
      setMessage(message, "reshuffle_ok");
    }, function () {
      button.disabled = false;
      message.className = "msg error";
      setMessage(message, "draw_offline");
    });
  }

  function onReset() {
    if (!window.confirm(t("reset_confirm"))) return;
    state = { names: "", rules: [], link: "", codes: {}, open: true, openServer: false };
    $("open-address").checked = true;
    saveState();
    $("names").value = "";
    $("result").hidden = true;
    clearMessage($("draw-msg"));
    clearMessage($("rule-msg"));
    clearMessage($("reshuffle-msg"));
    onNamesChanged();
  }

  /* ------------------------------------------------------------- Language */

  function onLanguageChanged() {
    refreshNameDependentParts();
    ["rule-msg", "draw-msg", "copy-msg", "reshuffle-msg", "codes-msg"].forEach(function (id) { renderMessage($(id)); });
  }

  /* ----------------------------------------------------------------- Start */

  function init() {
    I18n.init();
    I18n.onChange(onLanguageChanged);
    loadState();
    $("names").value = state.names;
    try { $("host-password").value = window.sessionStorage.getItem(PASSWORD_KEY) || ""; } catch (e) { /* ignore */ }
    $("names").addEventListener("input", onNamesChanged);
    $("add-rule").addEventListener("click", onAddRule);
    $("draw").addEventListener("click", onDraw);
    $("copy-link").addEventListener("click", onCopyLink);
    $("link-out").addEventListener("focus", function () { this.select(); });
    $("reshuffle").addEventListener("click", onReshuffle);
    $("open-address").checked = state.open;
    $("open-address").addEventListener("change", function () {
      state.open = $("open-address").checked;
      saveState();
    });
    $("make-codes").addEventListener("click", onMakeCodes);
    $("clear-codes").addEventListener("click", onClearCodes);
    $("update-codes").addEventListener("click", onUpdateCodes);
    $("reset").addEventListener("click", onReset);
    refreshNameDependentParts();
    if (state.link) showLink(state.link);
  }

  init();
})();
