/*
 * Secret Santa – guest page (index.html).
 * Flow: type name -> confirm -> see who you give to -> wishlists of everybody (optional).
 * The pairings stay on the server: this page only ever receives its own recipient.
 */
(function () {
  "use strict";

  var Core = window.SantaCore;
  var I18n = window.I18n;
  var Api = window.SantaApi;
  var t = I18n.t;
  var $ = function (id) { return document.getElementById(id); };

  var SCREENS = ["start", "loading", "offline", "name", "confirm", "code", "result", "people", "person", "mine", "error"];

  var LAST_KEY = "santa-last-event";
  var eventId = "";
  var usedStored = false;   // the link was not in the address, it was remembered from last time
  var names = [];
  var me = -1;              // the person using the page right now
  var pending = -1;         // the person waiting for "Yes, that is me"
  var recipientIndex = -1;  // who "me" gives a gift to
  var myCode = "";          // personal code, only for people who have one
  var people = [];          // everybody's wishlist, as last loaded from the server
  var wishNotes = "";       // my own wishlist text while editing
  var currentScreen = "";
  var currentPerson = -1;
  var retryAction = null;

  /* ------------------------------------------------------------ Screens */

  function show(screen, focusInput) {
    currentScreen = screen;
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

  /* ------------------------------------------------------ Server calls */

  // The server answered, but with an error.
  function problem(answer) {
    var error = new Error(answer && answer.error);
    error.code = answer && answer.error;
    return error;
  }

  // Shows "Loading…" while the task runs. If the server cannot be reached, offers "Try again".
  function run(task) {
    show("loading");
    return task().catch(function (error) {
      if (error && error.code === "not_found") {
        if (usedStored) {
          // The remembered event is gone (expired): start over as if opened without a link.
          usedStored = false;
          eventId = "";
          try { window.localStorage.removeItem(LAST_KEY); } catch (e) { /* ignore */ }
          show("start");
          return;
        }
        show("error");
      } else {
        retryAction = function () { run(task); };
        show("offline");
      }
    });
  }

  function fetchPeople() {
    return Api.call("wishlists", { id: eventId }).then(function (answer) {
      if (!answer.ok) throw problem(answer);
      people = answer.people;
    });
  }

  /* ------------------------------------------------------------- Start */

  function readEventId() {
    var match = /[#&]e=([A-Za-z0-9_-]{8,40})/.exec(window.location.hash);
    return match ? match[1] : "";
  }

  function loadNames() {
    return Api.call("names", { id: eventId }).then(function (answer) {
      if (!answer.ok) throw problem(answer);
      names = answer.names;
      try { window.localStorage.setItem(LAST_KEY, eventId); } catch (e) { /* ignore */ }
      show("name");
    });
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
      btn.className = "btn tonal";
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

  // Asks the server who "me" gives to. People with a personal code are asked for it first.
  function reveal() {
    run(function () {
      return Api.call("reveal", { id: eventId, index: me, code: myCode }).then(function (answer) {
        if (!answer.ok) {
          if (answer.error === "code_required") {
            show("code", false);
            $("code-input").focus();
            return;
          }
          if (answer.error === "bad_code" || answer.error === "locked") {
            myCode = "";
            $("code-input").value = "";
            show("code", false);
            if (answer.error === "locked") setMessage($("code-msg"), "code_locked", { minutes: answer.minutes || 15 });
            else setMessage($("code-msg"), "code_wrong");
            $("code-input").focus();
            return;
          }
          throw problem(answer);
        }
        recipientIndex = answer.recipientIndex;
        $("code-input").value = "";
        clearMessage($("code-msg"));
        renderResult();
        show("result");
      });
    });
  }

  function onConfirmYes() {
    me = pending;
    myCode = "";
    clearMessage($("code-msg"));
    reveal();
  }

  function onCodeSubmit(event) {
    event.preventDefault();
    var code = $("code-input").value.trim();
    if (!code) return;
    myCode = code;
    clearMessage($("code-msg"));
    reveal();
  }

  function onCodeBack() {
    myCode = "";
    $("code-input").value = "";
    clearMessage($("code-msg"));
    pending = -1;
    show("name", true);
  }

  function onConfirmNo() {
    pending = -1;
    show("name", true);
  }

  /* ------------------------------------------- 3. Result / hide the screen */

  function renderResult() {
    if (me < 0) return;
    $("result-title").textContent = t("hello", { name: names[me] });
    $("result-recipient").textContent = names[recipientIndex];
  }

  function onDone() {
    me = -1;
    pending = -1;
    recipientIndex = -1;
    myCode = "";
    people = [];
    wishNotes = "";
    $("name-input").value = "";
    $("suggestions").textContent = "";
    clearMessage($("name-msg"));
    $("result-title").textContent = "";
    $("result-recipient").textContent = "";
    show("name");
  }

  /* ------------------------------------- 4a. Everybody's wishlists: names */

  function isEmpty(person) {
    return !Core.wishText(person).trim();
  }

  function renderPeople() {
    var list = $("people-list");
    list.textContent = "";

    // The person you give to comes first.
    var order = people.filter(function (p) { return p.index !== me; });
    order.sort(function (a, b) {
      return (b.index === recipientIndex) - (a.index === recipientIndex) || a.index - b.index;
    });

    order.forEach(function (person) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = person.index === recipientIndex ? "btn mine-pick" : "btn tonal";

      var main = document.createElement("span");
      main.textContent = person.name;
      btn.appendChild(main);

      var hints = [];
      if (person.index === recipientIndex) hints.push(t("people_yours"));
      if (isEmpty(person)) hints.push(t("people_nothing"));
      hints.forEach(function (text) {
        var sub = document.createElement("span");
        sub.className = "sub";
        sub.textContent = text;
        btn.appendChild(sub);
      });

      btn.addEventListener("click", function () { openPerson(person.index); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function openPeople() {
    run(function () {
      return fetchPeople().then(function () {
        renderPeople();
        show("people");
      });
    });
  }

  /* ---------------------------------------- 4b. One wishlist, read only */

  function openPerson(index) {
    currentPerson = index;
    renderPerson();
    show("person");
  }

  // Link preview cards: the server fetches title, description and picture once and remembers them.
  var previews = {};

  function attachPreview(card, url) {
    if (!previews[url]) {
      previews[url] = Api.call("preview", { id: eventId, url: url }).then(function (answer) {
        return answer.ok ? answer.preview : null;
      }, function () { return null; });
    }
    previews[url].then(function (preview) { SantaRich.fillCard(card, preview); });
  }

  function renderPerson() {
    var person = people[currentPerson];
    if (!person) return;
    $("person-title").textContent = t("person_title", { name: person.name });
    $("person-yours").hidden = person.index !== recipientIndex;

    var text = Core.wishText(person);
    var empty = !text.trim();
    $("person-empty").hidden = !empty;
    $("person-empty").textContent = empty ? t("person_empty", { name: person.name }) : "";
    $("person-text").hidden = empty;
    SantaRich.render($("person-text"), text, { editable: false, onCard: attachPreview });
  }

  /* ---------------------------------------- 4c. My wishlist (editable) */

  var saveTimer = null;
  var pendingSave = null;
  var sending = false;

  function setStatus(key) {
    setMessage($("save-status"), key);
  }

  // Saves the current wishlist. Several quick changes are sent one after the other,
  // always with the newest content.
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingSave = { index: me, notes: wishNotes, code: myCode };
    setStatus("status_saving");
    pump();
  }

  function pump() {
    if (sending || !pendingSave) return;
    var job = pendingSave;
    pendingSave = null;
    sending = true;
    Api.call("save", { id: eventId, index: job.index, notes: job.notes, links: [], code: job.code }).then(function (answer) {
      sending = false;
      if (!answer.ok) {
        setStatus("status_save_error");
      } else if (pendingSave) {
        pump();
      } else {
        setStatus("status_saved");
      }
    }, function () {
      sending = false;
      setStatus("status_save_error");
      if (pendingSave) pump();
    });
  }

  function flushPendingNotes() {
    if (saveTimer) queueSave();
  }

  function openMine() {
    run(function () {
      return fetchPeople().then(function () {
        wishNotes = Core.wishText(people[me]);
        SantaRich.render($("editor"), wishNotes, { editable: true, removeLabel: t("card_remove"), onCard: attachPreview });
        clearMessage($("save-status"));
        $("save-status").hidden = false;
        show("mine");
      });
    });
  }

  function onEditorChange() {
    var text = SantaRich.serialize($("editor"));
    if (text.length > Core.LIMITS.notes) {
      clearTimeout(saveTimer);
      saveTimer = null;
      setStatus("wish_too_long");
      return;
    }
    wishNotes = text;
    setStatus("status_saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(queueSave, 700);
  }

  function leaveMine() {
    flushPendingNotes();
    show("result");
  }

  /* ------------------------------------------------------------- Language */

  function onLanguageChanged() {
    ["name-msg", "code-msg", "save-status"].forEach(function (id) { retranslateMessage($(id)); });
    renderResult();
    if (currentScreen === "people") renderPeople();
    if (currentScreen === "person") renderPerson();
    Array.prototype.forEach.call(document.querySelectorAll("#editor .card-remove"), function (b) {
      b.textContent = t("card_remove");
    });
  }

  /* ---------------------------------------------------------------- Start */

  function init() {
    I18n.init();
    I18n.onChange(onLanguageChanged);

    eventId = readEventId();
    if (!eventId) {
      // Opened with just the website address: use the link used last time on this device, if any.
      try { eventId = window.localStorage.getItem(LAST_KEY) || ""; } catch (e) { eventId = ""; }
      if (!/^[A-Za-z0-9_-]{8,40}$/.test(eventId)) eventId = "";
      usedStored = !!eventId;
    }
    if (!eventId) {
      show("start");
      return;
    }

    $("name-form").addEventListener("submit", onNameSubmit);
    $("name-input").addEventListener("input", function () {
      clearMessage($("name-msg"));
      renderSuggestions();
    });
    $("confirm-yes").addEventListener("click", onConfirmYes);
    $("confirm-no").addEventListener("click", onConfirmNo);
    $("code-form").addEventListener("submit", onCodeSubmit);
    $("code-back").addEventListener("click", onCodeBack);
    $("result-done").addEventListener("click", onDone);
    $("open-people").addEventListener("click", openPeople);
    $("open-mine").addEventListener("click", openMine);
    $("people-back").addEventListener("click", function () { show("result"); });
    $("person-back").addEventListener("click", function () { show("people"); });
    $("mine-back").addEventListener("click", leaveMine);
    SantaRich.attachEditor($("editor"), {
      bold: $("fmt-bold"), italic: $("fmt-italic"), list: $("fmt-list")
    }, { onChange: onEditorChange, onCard: attachPreview, removeLabel: t("card_remove") });
    $("retry").addEventListener("click", function () { if (retryAction) retryAction(); });
    window.addEventListener("pagehide", flushPendingNotes);

    run(loadNames);
  }

  init();
})();
