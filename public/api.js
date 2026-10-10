/*
 * Talks to the server (api/santa.js). Every call is a POST with { action, ... }.
 *
 *   SantaApi.call("reveal", { id: "...", index: 2 }).then(function (answer) { ... })
 *
 * The promise resolves with the server's JSON answer, which has ok:true or ok:false plus an
 * error code. It is rejected (with error.network = true) only when the server cannot be reached.
 */
(function () {
  "use strict";

  function networkError() {
    var error = new Error("network");
    error.network = true;
    return error;
  }

  function call(action, payload) {
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    return fetch("/api/santa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      keepalive: true,
      body: body
    }).then(function (response) {
      return response.json().then(function (json) {
        return json;
      }, function () {
        throw networkError(); // for example an error page instead of JSON
      });
    }, function () {
      throw networkError();
    });
  }

  window.SantaApi = { call: call };
})();
