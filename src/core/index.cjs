"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

const ROOT = resolve(__dirname, "../..");
const CORE_FILES = Object.freeze([
  "src/core/keymap.js",
  "src/core/syllable-parser.js",
  "src/core/dictionary.js",
  "src/core/candidates.js",
  "src/core/preferences.js",
  "src/core/phrases.js",
  "src/core/context.js",
  "src/core/ranker.js",
  "src/core/detector.js",
  "src/core/range-detector.js",
  "src/core/engine.js",
]);

function loadCoreRuntime() {
  const context = vm.createContext({});
  for (const file of CORE_FILES) {
    vm.runInContext(readFileSync(resolve(ROOT, file), "utf8"), context, { filename: file });
  }
  return context.TypingRecoveryCore;
}

const core = loadCoreRuntime();
const defaultEngine = core.createEngine();

module.exports = Object.freeze({
  apiVersion: core.apiVersion,
  createEngine: core.createEngine,
  parse: defaultEngine.parse,
  analyze: defaultEngine.analyze,
  detect: defaultEngine.detect,
  scan: defaultEngine.scan,
  getContext: defaultEngine.getContext,
  remember: defaultEngine.remember,
  clearPreferences: defaultEngine.clearPreferences,
});
