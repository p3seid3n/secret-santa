/*
 * Secret Santa – texts in Spanish (default) and English.
 *
 * To change a text, edit it below. Every key must exist in BOTH languages
 * (node test/i18n.test.js checks this). {name}-style parts are filled in by the pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.I18n = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STORAGE_KEY = "santa-lang";
  var DEFAULT_LANG = "es";

  var STRINGS = {
    es: {
      app_title: "Secret Santa",
      title_guest: "Secret Santa",
      title_host: "Secret Santa – organizador",
      lang_other_name: "English",
      lang_switch_aria: "Cambiar el idioma a inglés",

      /* Guest: loading and connection problems */
      loading: "Cargando…",
      offline_title: "No hay conexión con el servidor",
      offline_text: "Revisa tu conexión e inténtalo de nuevo.",
      retry: "Intentar de nuevo",

      /* Guest: name */
      name_label: "Tu nombre",
      next: "Siguiente",
      name_empty: "Escribe tu nombre.",
      name_not_found: "No encuentro ese nombre.",
      name_pick: "Toca tu nombre abajo.",

      /* Guest: confirm */
      confirm_title: "¿Eres tú?",
      confirm_yes: "Sí, soy yo",
      confirm_no: "No, volver",

      /* Guest: result */
      hello: "¡Hola, {name}!",
      gift_to: "Tu regalo es para",
      done: "Ocultar pantalla",
      open_people: "Listas de deseos",
      open_mine: "Mi lista de deseos",

      /* Guest: everybody's wishlists */
      people_title: "Listas de deseos",
      people_yours: "Tu regalo",
      people_nothing: "Vacía",
      person_title: "Lista de deseos de {name}",
      person_empty: "Todavía no hay nada.",
      back: "Volver",

      /* Guest: my wishlist */
      wish_title: "Mi lista de deseos",
      wish_placeholder: "Ideas y enlaces: escribe o pega aquí",
      fmt_bold: "Negrita",
      fmt_italic: "Cursiva",
      fmt_list: "Lista",
      card_remove: "Quitar",
      wish_too_long: "Demasiado largo. Acorta el texto.",
      status_saving: "Guardando…",
      status_saved: "Guardado.",
      status_save_error: "No se pudo guardar. Comprueba tu conexión a internet.",

      /* Guest: broken link */
      error_title: "Este enlace no funciona",
      error_text: "El enlace está incompleto. Pide otro al organizador.",

      /* Host */
      host_title: "Secret Santa – organizador",
      h_names: "1. ¿Quién participa?",
      names_label: "Un nombre por línea (mínimo 3)",
      count_one: "{n} persona",
      count_other: "{n} personas",
      count_need: " – hacen falta al menos 3",
      count_dupes: "Repetidos en la lista: {names}. Por favor, hazlos distintos.",
      h_rules: "2. ¿Quién no debe regalar a quién? (opcional)",
      rule_person: "Persona",
      rule_not_give: "no debe hacer el regalo a",
      rule_both: "También al revés",
      choose_name: "Elige un nombre…",
      rule_add: "Añadir esta regla",
      rule_both_text: "{a} y {b} no deben regalarse entre sí.",
      rule_one_text: "{a} no debe hacer el regalo a {b}.",
      rule_missing: "Ya no está en la lista de nombres: {names}. Quita esta regla o corrige el nombre.",
      rule_remove: "Quitar esta regla",
      rule_pick_both: "Elige un nombre en las dos casillas.",
      rule_same: "Elige dos personas distintas.",
      rule_exists: "Esta regla ya está en la lista.",
      h_draw: "3. Sorteo",
      host_password_label: "Contraseña del organizador",
      draw_btn: "Sortear y crear el enlace",
      draw_working: "Sorteando…",
      draw_password_empty: "Escribe la contraseña del organizador.",
      draw_bad_password: "La contraseña no es correcta.",
      draw_no_password: "El servidor todavía no tiene contraseña de organizador. Añade la variable HOST_PASSWORD en Vercel y vuelve a desplegar.",
      draw_no_storage: "El servidor todavía no tiene base de datos. Conecta Upstash Redis en Vercel y vuelve a desplegar.",
      draw_offline: "No hay conexión con el servidor. Inténtalo de nuevo.",
      draw_dupes: "Hay nombres repetidos en la lista: {names}. Haz que cada nombre sea distinto, por ejemplo añadiendo una inicial.",
      draw_few: "Escribe al menos 3 nombres.",
      draw_broken_rule: "Una de tus reglas usa un nombre que ya no está en la lista. Corrígela o quítala primero.",
      draw_again_confirm: "Ya creaste un enlace. ¿Sortear de nuevo? El enlace nuevo empieza con las listas de deseos vacías.",
      draw_impossible: "Con estas reglas no se puede emparejar a todos. Quita alguna regla. {hints}",
      draw_error: "Algo salió mal. Pulsa el botón otra vez.",
      hint_giver: "{name} se quedaría sin nadie a quien regalar.",
      hint_receiver: "Nadie podría hacerle un regalo a {name}.",
      result_title: "Tu enlace",
      result_text: "Envía este enlace a todos los participantes.",
      link_for_guests: "Enlace para tus invitados",
      copy_link: "Copiar enlace",
      open_guest: "Abrir la página de los invitados",
      host_copy_ok: "Copiado. Ahora pégalo en tu mensaje.",
      host_copy_fail: "No se pudo copiar. El enlace está seleccionado, cópialo a mano.",
      draw_again_hint: "Si sorteas otra vez se crea un enlace nuevo. Envía solo el más reciente.",
      reshuffle_btn: "Mezclar de nuevo",
      reshuffle_confirm: "¿Mezclar de nuevo? Cada persona recibe otra persona. El enlace y las listas de deseos se mantienen. Quien ya vio su regalo debe mirar otra vez.",
      reshuffle_ok: "Listo. Todos tienen una persona nueva.",
      reset: "Empezar de nuevo",
      reset_confirm: "¿Borrar todos los nombres, las reglas y el enlace?"
    },

    en: {
      app_title: "Secret Santa",
      title_guest: "Secret Santa",
      title_host: "Secret Santa – host",
      lang_other_name: "Español",
      lang_switch_aria: "Change the language to Spanish",

      loading: "Loading…",
      offline_title: "Cannot reach the server",
      offline_text: "Check your connection and try again.",
      retry: "Try again",

      name_label: "Your name",
      next: "Next",
      name_empty: "Type your name.",
      name_not_found: "I cannot find that name.",
      name_pick: "Tap your name below.",

      confirm_title: "Is this you?",
      confirm_yes: "Yes, that is me",
      confirm_no: "No, go back",

      hello: "Hello {name}!",
      gift_to: "You give a gift to",
      done: "Hide screen",
      open_people: "Wishlists",
      open_mine: "My wishlist",

      people_title: "Wishlists",
      people_yours: "Your gift",
      people_nothing: "Empty",
      person_title: "Wishlist of {name}",
      person_empty: "Nothing yet.",
      back: "Back",

      wish_title: "My wishlist",
      wish_placeholder: "Ideas and links: type or paste here",
      fmt_bold: "Bold",
      fmt_italic: "Italic",
      fmt_list: "List",
      card_remove: "Remove",
      wish_too_long: "Too long. Please shorten the text.",
      status_saving: "Saving…",
      status_saved: "Saved.",
      status_save_error: "Could not save. Please check your internet connection.",

      error_title: "This link does not work",
      error_text: "The link is incomplete. Ask the host for a new one.",

      host_title: "Secret Santa – host",
      h_names: "1. Who is taking part?",
      names_label: "One name per line (at least 3)",
      count_one: "{n} person",
      count_other: "{n} people",
      count_need: " – at least 3 are needed",
      count_dupes: "Twice in the list: {names}. Please make them different.",
      h_rules: "2. Who should not get whom? (optional)",
      rule_person: "Person",
      rule_not_give: "should not give a gift to",
      rule_both: "Also the other way around",
      choose_name: "Choose a name…",
      rule_add: "Add this rule",
      rule_both_text: "{a} and {b} should not give to each other.",
      rule_one_text: "{a} should not give a gift to {b}.",
      rule_missing: "Not in the list of names anymore: {names}. Please remove this rule or correct the name.",
      rule_remove: "Remove this rule",
      rule_pick_both: "Please choose a name in both boxes.",
      rule_same: "Please choose two different people.",
      rule_exists: "This rule is already in the list.",
      h_draw: "3. Draw",
      host_password_label: "Host password",
      draw_btn: "Draw names and create the link",
      draw_working: "Drawing…",
      draw_password_empty: "Please type the host password.",
      draw_bad_password: "That password is not correct.",
      draw_no_password: "The server has no host password yet. Add the HOST_PASSWORD variable in Vercel and redeploy.",
      draw_no_storage: "The server has no database yet. Connect Upstash Redis in Vercel and redeploy.",
      draw_offline: "Cannot reach the server. Please try again.",
      draw_dupes: "Some names are in the list twice: {names}. Please make each name different, for example by adding an initial.",
      draw_few: "Please enter at least 3 names.",
      draw_broken_rule: "One of your rules uses a name that is not in the list anymore. Please fix or remove it first.",
      draw_again_confirm: "You already created a link. Draw again? The new link starts with empty wishlists.",
      draw_impossible: "With these rules, not everybody can be matched. Please remove a rule. {hints}",
      draw_error: "Something went wrong. Please press the button again.",
      hint_giver: "{name} would have nobody left to give a gift to.",
      hint_receiver: "Nobody would be allowed to give a gift to {name}.",
      result_title: "Your link",
      result_text: "Send this link to everyone taking part.",
      link_for_guests: "Link for your guests",
      copy_link: "Copy link",
      open_guest: "Open the guest page",
      host_copy_ok: "Copied. Now paste it into your message.",
      host_copy_fail: "Copying did not work. The link is selected, please copy it by hand.",
      draw_again_hint: "Drawing again creates a new link. Only send the newest one.",
      reshuffle_btn: "Shuffle again",
      reshuffle_confirm: "Shuffle again? Everyone gets a different person. The link and wishlists stay. Anyone who already looked has to look again.",
      reshuffle_ok: "Done. Everyone has a new person.",
      reset: "Start over",
      reset_confirm: "Delete all names, rules and the link?"
    }
  };

  var current = DEFAULT_LANG;
  var listeners = [];

  function t(key, vars) {
    var text = STRINGS[current][key];
    if (text === undefined) text = STRINGS.en[key];
    if (text === undefined) return key;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return vars && vars[name] !== undefined ? vars[name] : whole;
    });
  }

  function otherLang() {
    return current === "es" ? "en" : "es";
  }

  // Fills every element that has a data-i18n attribute, plus the language button.
  function apply() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = current;

    var titleKey = document.documentElement.getAttribute("data-title-key");
    if (titleKey) document.title = t(titleKey);

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    }

    var holders = document.querySelectorAll("[data-i18n-placeholder]");
    for (var h = 0; h < holders.length; h++) {
      holders[h].setAttribute("placeholder", t(holders[h].getAttribute("data-i18n-placeholder")));
    }

    var button = document.getElementById("lang-toggle");
    if (button) {
      button.textContent = t("lang_other_name");
      button.setAttribute("lang", otherLang());
      button.setAttribute("aria-label", t("lang_switch_aria"));
    }
  }

  function setLang(lang, remember) {
    if (!STRINGS[lang]) return;
    current = lang;
    if (remember) {
      try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    }
    apply();
    listeners.forEach(function (fn) { fn(lang); });
  }

  function init() {
    var saved = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    current = saved && STRINGS[saved] ? saved : DEFAULT_LANG;
    apply();
    var button = document.getElementById("lang-toggle");
    if (button) {
      button.addEventListener("click", function () { setLang(otherLang(), true); });
    }
  }

  return {
    STRINGS: STRINGS,
    t: t,
    init: init,
    getLang: function () { return current; },
    setLang: setLang,
    onChange: function (fn) { listeners.push(fn); }
  };
});
