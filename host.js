/*
 * Secret Santa – host page (host.html).
 * Enter names, add "should not get" rules, draw, and get one link to share.
 */
(function () {
  "use strict";

  var Core = window.SantaCore;
  var I18n = window.I18n;
  var t = I18n.t;
  var STORAGE_KEY = "santa-host-v1";
  var $ = function (id) { return document.getElementById(id); };

  // names: the text box content. rules: [{a, b, both}]. link: last link created.
  var state = { names: "", rules: [], link: "" };

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

  function refreshNameDependentParts() {
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
      remove.className = "btn secondary small";
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

  function showLink(link) {
    $("link-out").value = link;
    $("open-link").href = link;
    clearMessage($("copy-msg"));
    $("result").hidden = false;
  }

  function impossibleHints(names, forbidden) {
    return function () {
      return {
        hints: Core.explainImpossible(names, forbidden).map(function (h) {
          return t(h.type === "giver" ? "hint_giver" : "hint_receiver", { name: h.name });
        }).join(" ")
      };
    };
  }

  function onDraw() {
    var message = $("draw-msg");
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

    var forbidden = [];
    var broken = false;
    state.rules.forEach(function (rule) {
      var a = names.indexOf(rule.a);
      var b = names.indexOf(rule.b);
      if (a === -1 || b === -1) { broken = true; return; }
      forbidden.push([a, b]);
      if (rule.both) forbidden.push([b, a]);
    });
    if (broken) {
      setMessage(message, "draw_broken_rule");
      return;
    }

    if (state.link && !window.confirm(t("draw_again_confirm"))) {
      return;
    }

    var result = Core.draw(names, forbidden);
    if (!result.ok) {
      setMessage(message, "draw_impossible", impossibleHints(names, forbidden));
      return;
    }
    if (!Core.verify(names.length, forbidden, result.assignment)) {
      setMessage(message, "draw_error");
      return;
    }

    var link = new URL("index.html", window.location.href);
    link.hash = "d=" + Core.encodeDraw(names, result.assignment);
    state.link = link.href;
    saveState();
    showLink(state.link);
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

  function onReset() {
    if (!window.confirm(t("reset_confirm"))) return;
    state = { names: "", rules: [], link: "" };
    saveState();
    $("names").value = "";
    $("result").hidden = true;
    clearMessage($("draw-msg"));
    clearMessage($("rule-msg"));
    onNamesChanged();
  }

  /* ------------------------------------------------------------- Language */

  function onLanguageChanged() {
    refreshNameDependentParts();
    ["rule-msg", "draw-msg", "copy-msg"].forEach(function (id) { renderMessage($(id)); });
  }

  /* ----------------------------------------------------------------- Start */

  function init() {
    I18n.init();
    I18n.onChange(onLanguageChanged);
    loadState();
    $("names").value = state.names;
    $("names").addEventListener("input", onNamesChanged);
    $("add-rule").addEventListener("click", onAddRule);
    $("draw").addEventListener("click", onDraw);
    $("copy-link").addEventListener("click", onCopyLink);
    $("link-out").addEventListener("focus", function () { this.select(); });
    $("reset").addEventListener("click", onReset);
    refreshNameDependentParts();
    if (state.link) showLink(state.link);
  }

  init();
})();
