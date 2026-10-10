/*
 * The whole Secret Santa API in one function, independent of where it runs.
 *
 *   handle({ method, body }, { env, store, delay? })  ->  { status, body }
 *
 * Every request is a POST with a JSON body { action, ... }:
 *
 *   create     host only (password)   draw on the server, returns the event id
 *   setcodes   host only (password)   set or change personal codes and the open address
 *   current    anyone                 the id of the event the bare website address opens (if the host allowed it)
 *   reshuffle  host only (password)   draw again for the same event (same link, wishlists stay)
 *   names      anyone with the id     list of names (for autocomplete)
 *   reveal     the id (+ code if set) who does <index> give a gift to?
 *   wishlists  anyone with the id     everybody's wishlist (notes and links)
 *   preview    anyone with the id     title, description and picture of a web page
 *   save       the id (+ code if set) save the wishlist of <index>
 *
 * The pairings never leave the server except one at a time, in "reveal".
 */
"use strict";

const crypto = require("crypto");
const Core = require("../public/shared.js");
const Preview = require("./preview");

const MAX_PEOPLE = 100;
const MAX_NAME_LENGTH = 60;
const MAX_RULES = 300;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;

const CODE_MIN = 4;
const CODE_MAX = 12;
const MAX_FAILS = 5;            // wrong codes in a row ...
const LOCK_MINUTES = 15;        // ... lock that person for this long

const eventKey = (id) => "santa:event:" + id;
const lockKey = (id, index) => "santa:lock:" + id + ":" + index;
const CURRENT_KEY = "santa:current";
const wishKey = (id, index) => "santa:wish:" + id + ":" + index;

function reply(status, body) {
  return { status, body };
}

function fail(status, error, extra) {
  return reply(status, Object.assign({ ok: false, error }, extra || {}));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest();
}

function passwordMatches(given, expected) {
  return crypto.timingSafeEqual(sha256(given), sha256(expected));
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function loadEvent(store, id) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  const event = parseJson(await store.get(eventKey(id)));
  if (!event || !Array.isArray(event.names) || !Array.isArray(event.assignment)) return null;
  return event;
}

function validIndex(event, index) {
  return Number.isInteger(index) && index >= 0 && index < event.names.length;
}

// Returns a failure reply when the host password is missing or wrong, otherwise null.
async function checkHost(body, deps) {
  const expected = deps.env.HOST_PASSWORD;
  if (!expected) return fail(503, "no_password_set");
  if (typeof body.password !== "string" || !passwordMatches(body.password, expected)) {
    await (deps.delay || sleep)(400); // slows down guessing
    return fail(401, "bad_password");
  }
  return null;
}

// [{a, b, both}] with names -> forbidden [giver, receiver] index pairs, or null if a rule is broken.
function rulesToPairs(names, rules) {
  const forbidden = [];
  for (const rule of rules) {
    const a = rule && typeof rule.a === "string" ? names.indexOf(rule.a) : -1;
    const b = rule && typeof rule.b === "string" ? names.indexOf(rule.b) : -1;
    if (a === -1 || b === -1 || a === b) return null;
    forbidden.push([a, b]);
    if (rule.both) forbidden.push([b, a]);
  }
  return forbidden;
}

/* ------------------------------------------------------------ personal codes */

// Codes ignore capital letters, accents and spaces: "Ab 12" = "ab12".
function normalizeCode(code) {
  return Core.normalize(code).replace(/\s/g, "");
}

function hashCode(code) {
  const salt = crypto.randomBytes(8).toString("hex");
  return { salt, hash: crypto.scryptSync(code, salt, 32).toString("hex") };
}

function codeMatches(code, record) {
  const given = crypto.scryptSync(code, record.salt, 32);
  const expected = Buffer.from(record.hash, "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// {name: code} -> array lined up with names (null = no code), or null if a code is unusable.
function buildCodes(names, raw) {
  if (raw === undefined || raw === null) return { codes: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) return { codes: null };
  const list = names.map(() => null);
  for (const name of Object.keys(raw)) {
    const index = names.indexOf(name);
    if (index === -1 || typeof raw[name] !== "string") return { codes: null };
    const code = normalizeCode(raw[name]);
    if (!code) continue;
    if (code.length < CODE_MIN || code.length > CODE_MAX) return { codes: null };
    list[index] = hashCode(code);
  }
  return { codes: list.some(Boolean) ? list : undefined };
}

// null when the person has no code or the right one was given, otherwise a failure reply.
// Too many wrong codes lock that person for a while (nobody can guess a short code).
async function checkCode(event, body, deps) {
  const record = event.codes && event.codes[body.index];
  if (!record) return null;
  const now = (deps.now || Date.now)();
  const key = lockKey(body.id, body.index);
  const lock = parseJson(await deps.store.get(key)) || { fails: 0, until: 0 };
  if (lock.until > now) return fail(429, "locked", { minutes: Math.ceil((lock.until - now) / 60000) });

  const given = typeof body.code === "string" ? normalizeCode(body.code) : "";
  if (!given) return fail(401, "code_required");
  if (given.length <= CODE_MAX && codeMatches(given, record)) {
    if (lock.fails) await deps.store.set(key, JSON.stringify({ fails: 0, until: 0 }));
    return null;
  }

  await (deps.delay || sleep)(400);
  lock.fails += 1;
  let locked = false;
  if (lock.fails >= MAX_FAILS) {
    lock.fails = 0;
    lock.until = now + LOCK_MINUTES * 60000;
    locked = true;
  }
  await deps.store.set(key, JSON.stringify(lock));
  return locked ? fail(429, "locked", { minutes: LOCK_MINUTES }) : fail(401, "bad_code");
}

/* ------------------------------------------------------------------ create */

async function create(body, deps) {
  const denied = await checkHost(body, deps);
  if (denied) return denied;

  if (!Array.isArray(body.names) || body.names.some((n) => typeof n !== "string")) {
    return fail(400, "bad_request");
  }
  const parsed = Core.parseNames(body.names.map((n) => n.replace(/\s+/g, " ")).join("\n"));
  if (parsed.duplicates.length) return fail(400, "duplicates", { names: parsed.duplicates });
  const names = parsed.names;
  if (names.length < 3) return fail(400, "too_few");
  if (names.length > MAX_PEOPLE || names.some((n) => n.length > MAX_NAME_LENGTH)) {
    return fail(400, "bad_request");
  }

  const rules = Array.isArray(body.rules) ? body.rules : [];
  if (rules.length > MAX_RULES) return fail(400, "bad_request");
  const forbidden = rulesToPairs(names, rules);
  if (!forbidden) return fail(400, "bad_rule");

  const built = buildCodes(names, body.codes);
  if (built.codes === null) return fail(400, "bad_code_format");

  const result = Core.draw(names, forbidden);
  if (!result.ok) {
    return fail(422, "impossible", { hints: Core.explainImpossible(names, forbidden) });
  }
  if (!Core.verify(names.length, forbidden, result.assignment)) {
    return fail(500, "draw_failed");
  }

  const id = crypto.randomBytes(9).toString("base64url");
  const event = { v: 1, names, forbidden, assignment: result.assignment, createdAt: new Date().toISOString() };
  if (built.codes) event.codes = built.codes;
  await deps.store.set(eventKey(id), JSON.stringify(event));
  // "Open address": the plain website address opens this event (until the next draw says otherwise).
  await deps.store.set(CURRENT_KEY, body.openAddress === true ? id : "");
  return reply(200, { ok: true, id });
}

/* ---------------------------------------------------------------- setcodes */

// Replaces all personal codes of an event ({} removes them all). Pairings stay as they are.
async function setcodes(body, deps) {
  const denied = await checkHost(body, deps);
  if (denied) return denied;
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");

  const built = buildCodes(event.names, body.codes === undefined ? {} : body.codes);
  if (built.codes === null) return fail(400, "bad_code_format");
  const updated = Object.assign({}, event);
  if (built.codes) updated.codes = built.codes; else delete updated.codes;
  await deps.store.set(eventKey(body.id), JSON.stringify(updated));
  if (typeof body.openAddress === "boolean") {
    if (body.openAddress) await deps.store.set(CURRENT_KEY, body.id);
    else if ((await deps.store.get(CURRENT_KEY)) === body.id) await deps.store.set(CURRENT_KEY, "");
  }
  // New codes start with a clean slate: nobody stays locked out.
  await Promise.all(event.names.map((_, i) => deps.store.set(lockKey(body.id, i), JSON.stringify({ fails: 0, until: 0 }))));
  return reply(200, { ok: true });
}

/* --------------------------------------------------------------- reshuffle */

// Draws again for an existing event. The link and all wishlists stay, only the pairings change.
// The rules from the first draw are reused; events made before rules were stored get them
// from the request instead.
async function reshuffle(body, deps) {
  const denied = await checkHost(body, deps);
  if (denied) return denied;

  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");

  let forbidden = Array.isArray(event.forbidden) ? event.forbidden : null;
  if (!forbidden) {
    forbidden = rulesToPairs(event.names, Array.isArray(body.rules) ? body.rules.slice(0, MAX_RULES) : []);
    if (!forbidden) return fail(400, "bad_rule");
  }

  // Prefer a result where nobody keeps the person they had before.
  let result = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = Core.draw(event.names, forbidden);
    if (!candidate.ok) {
      return fail(422, "impossible", { hints: Core.explainImpossible(event.names, forbidden) });
    }
    result = candidate;
    if (candidate.assignment.every((receiver, giver) => receiver !== event.assignment[giver])) break;
  }
  if (!Core.verify(event.names.length, forbidden, result.assignment)) return fail(500, "draw_failed");

  const updated = Object.assign({}, event, {
    forbidden,
    assignment: result.assignment,
    reshuffledAt: new Date().toISOString()
  });
  await deps.store.set(eventKey(body.id), JSON.stringify(updated));
  return reply(200, { ok: true, id: body.id });
}

/* ------------------------------------------------------------------ guests */

// Which event does the plain website address open? Only set when the host allowed it.
async function current(body, deps) {
  const id = await deps.store.get(CURRENT_KEY);
  const event = id ? await loadEvent(deps.store, id) : null;
  if (!event) return fail(404, "not_found");
  return reply(200, { ok: true, id });
}

async function names(body, deps) {
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");
  return reply(200, { ok: true, names: event.names });
}

async function reveal(body, deps) {
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");
  if (!validIndex(event, body.index)) return fail(400, "bad_request");
  const refused = await checkCode(event, body, deps);
  if (refused) return refused;
  const recipient = event.assignment[body.index];
  return reply(200, { ok: true, recipientIndex: recipient, recipient: event.names[recipient] });
}

async function wishlists(body, deps) {
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");
  const keys = event.names.map((_, i) => wishKey(body.id, i));
  const stored = await deps.store.mget(keys);
  const people = event.names.map((name, index) => {
    const wish = Core.sanitizeWish(parseJson(stored[index]));
    return { index, name, notes: wish.notes, links: wish.links };
  });
  return reply(200, { ok: true, people });
}

async function save(body, deps) {
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");
  if (!validIndex(event, body.index)) return fail(400, "bad_request");
  const refused = await checkCode(event, body, deps);
  if (refused) return refused;
  const wish = Core.sanitizeWish(body);
  await deps.store.set(
    wishKey(body.id, body.index),
    JSON.stringify({ notes: wish.notes, links: wish.links, updatedAt: new Date().toISOString() })
  );
  return reply(200, { ok: true, notes: wish.notes, links: wish.links });
}

/* ----------------------------------------------------------------- preview */

const previewKey = (url) => "santa:preview:" + crypto.createHash("sha1").update(url).digest("hex");

// Answers { ok: true, preview } where preview is null when the page has nothing to show.
// Good answers are remembered, so a wishlist with many links does not fetch them again each time.
async function preview(body, deps) {
  const event = await loadEvent(deps.store, body.id);
  if (!event) return fail(404, "not_found");
  const url = typeof body.url === "string" ? Core.cleanUrl(body.url) : null;
  if (!url) return fail(400, "bad_request");

  const cached = parseJson(await deps.store.get(previewKey(url)));
  if (cached && typeof cached.url === "string") return reply(200, { ok: true, preview: cached });

  const fetcher = deps.fetchPreview || Preview.fetchPreview;
  const found = await fetcher(url, { allowPrivate: deps.env.PREVIEW_ALLOW_PRIVATE === "1" });
  if (found) await deps.store.set(previewKey(url), JSON.stringify(found));
  return reply(200, { ok: true, preview: found });
}

/* -------------------------------------------------------------------- main */

const ACTIONS = { create, reshuffle, setcodes, current, names, reveal, wishlists, save, preview };

async function handle(request, deps) {
  if (request.method !== "POST") return fail(405, "method");
  const body = request.body;
  if (!body || typeof body !== "object" || typeof body.action !== "string") return fail(400, "bad_request");
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return fail(400, "bad_request");
  if (!deps.store) return fail(503, "no_storage");
  try {
    return await action(body, deps);
  } catch (e) {
    console.error("Secret Santa API error:", e && e.message);
    return fail(502, "storage_error");
  }
}

module.exports = { handle };
