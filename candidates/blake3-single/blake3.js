"use strict";

const path = require("node:path");

let wasmPkg = null;

function ensureInit() {
  if (wasmPkg) return;
  const pkgPath = path.resolve(__dirname, "../../blake3-wasm-single/pkg");
  wasmPkg = require(pkgPath);
}

function hash(inputU8) {
  ensureInit();
  return wasmPkg.hash(inputU8);
}

module.exports = { hash };
