// Vercel function: POST /api/santa
// All logic lives in server/handler.js so it can also be tested and run locally.
"use strict";

const { handle } = require("../server/handler");
const { createStore } = require("../server/store");

let store; // created once per warm function instance

module.exports = async function santa(req, res) {
  if (store === undefined) store = createStore(process.env);

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  const result = await handle({ method: req.method, body }, { env: process.env, store });
  res.setHeader("Cache-Control", "no-store");
  res.status(result.status).json(result.body);
};
