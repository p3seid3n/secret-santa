/*
 * Secret Santa – host page (host.html).
 * Enter names, add "should not get" rules, draw, and get one link to share.
 */
(function () {
  "use strict";

  var Core = window.SantaCore;
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

  function showMessage(el, text) {
    el.textContent = text;
    el.hidden = false;
  }

  function hideMessage(el) {
    el.textContent = "";
    el.hidden = true;
  }

  /* ------------------------------------------------------------- 1. Names */

  function updateNamesInfo() {
    var parsed = Core.parseNames($("names").value);
    var n = parsed.names.length;
    var text = "";
    if (n > 0) text = n + (n === 1 ? " person" : " people");
    if (n > 0 && n < 3) text += " – at least 3 are needed";
    if (parsed.duplicates.length) {
      text += (text ? ". " : "") + "Twice in the list: " + parsed.duplicates.join(", ") + ". Please make them different.";
    }
    $("names-count").textContent = text;
    $("names-count").className = parsed.duplicates.length ? "hint warn" : "hint";
  }

  function fillSelect(select, names) {
    var previous = select.value;
    select.textContent = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = "Choose a name…";
    select.appendChild(first);
    names.forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    select.value = names.indexOf(previous) === -1 ? "" : previous;
  }

  function onNamesChanged() {
    state.names = $("names").value;
    saveState();
    updateNamesInfo();
    var names = currentNames();
    fillSelect($("rule-a"), names);
    fillSelect($("rule-b"), names);
    renderRules();
  }

  /* -------------------------------------------------------------- 2. Rules */

  function ruleText(rule) {
    return rule.both
      ? rule.a + " and " + rule.b + " should not give to each other."
      : rule.a + " should not give a gift to " + rule.b + ".";
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
        warn.textContent = "Not in the list of names anymore: " + missing.join(", ") +
          ". Please remove this rule or correct the name.";
        li.appendChild(warn);
      }

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn secondary small";
      remove.textContent = "Remove this rule";
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
    hideMessage(message);

    var a = $("rule-a").value;
    var b = $("rule-b").value;
    var both = $("rule-both").checked;

    if (!a || !b) {
      showMessage(message, "Please choose a name in both boxes.");
      return;
    }
    if (a === b) {
      showMessage(message, "Please choose two different people.");
      return;
    }
    var exists = state.rules.some(function (r) {
      return (r.a === a && r.b === b && r.both === both) ||
             (both && r.both && r.a === b && r.b === a);
    });
    if (exists) {
      showMessage(message, "This rule is already in the list.");
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
    hideMessage($("copy-msg"));
    $("result").hidden = false;
  }

  function onDraw() {
    var message = $("draw-msg");
    hideMessage(message);

    var parsed = Core.parseNames($("names").value);
    var names = parsed.names;

    if (parsed.duplicates.length) {
      showMessage(message, "Some names are in the list twice: " + parsed.duplicates.join(", ") +
        ". Please make each name different, for example by adding an initial.");
      return;
    }
    if (names.length < 3) {
      showMessage(message, "Please enter at least 3 names.");
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
      showMessage(message, "One of your rules uses a name that is not in the list anymore. Please fix or remove it first.");
      return;
    }

    if (state.link && !window.confirm("You already created a link. Draw again and create a new one?")) {
      return;
    }

    var result = Core.draw(names, forbidden);
    if (!result.ok) {
      var hints = Core.explainImpossible(names, forbidden).join(" ");
      showMessage(message, "With these rules, not everybody can be matched. Please remove a rule. " + hints);
      return;
    }
    if (!Core.verify(names.length, forbidden, result.assignment)) {
      showMessage(message, "Something went wrong. Please press the button again.");
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
      showMessage(message, "Copied. Now paste it into your message.");
    }, function () {
      $("link-out").select();
      message.className = "msg error";
      showMessage(message, "Copying did not work. The link is selected, please copy it by hand.");
    });
  }

  function onReset() {
    if (!window.confirm("Delete all names, rules and the link?")) return;
    state = { names: "", rules: [], link: "" };
    saveState();
    $("names").value = "";
    $("result").hidden = true;
    hideMessage($("draw-msg"));
    hideMessage($("rule-msg"));
    onNamesChanged();
  }

  /* ----------------------------------------------------------------- Start */

  function init() {
    loadState();
    $("names").value = state.names;
    $("names").addEventListener("input", onNamesChanged);
    $("add-rule").addEventListener("click", onAddRule);
    $("draw").addEventListener("click", onDraw);
    $("copy-link").addEventListener("click", onCopyLink);
    $("link-out").addEventListener("focus", function () { this.select(); });
    $("reset").addEventListener("click", onReset);
    onNamesChanged();
    if (state.link) showLink(state.link);
  }

  init();
})();
