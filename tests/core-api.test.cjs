const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");

const core = require("..");

test("exports a versioned high-level Core API", () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, "../manifest.json"), "utf8"));
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
  assert.equal(packageJson.version, manifest.version);
  assert.equal(core.apiVersion, "0.1.0");
  for (const name of ["createEngine", "parse", "analyze", "detect", "scan", "getContext",
    "remember", "clearPreferences"]) {
    assert.equal(typeof core[name], "function", name);
  }

  const analysis = core.analyze("su3cl3");
  assert.equal(analysis.raw, "su3cl3");
  assert.equal(analysis.zhuyin, "ㄋㄧˇㄏㄠˇ");
  assert.equal(analysis.suggestions[0].text, "你好");
});

test("supports context, conservative detection and mixed-text scanning", () => {
  assert.deepEqual({ ...core.getContext("前cl3g4場", 1, 6) }, { left: "前", right: "場" });
  assert.equal(core.analyze("cl3g4", { right: "場" }).suggestions[0].text, "好市");
  assert.equal(core.detect("su3cl3").text, "你好");

  const value = "我想用 Google 查 su3cl3 的意思";
  const ranges = core.scan(value);
  const start = value.indexOf("su3cl3");
  assert.deepEqual(Array.from(ranges, ({ start, end, raw, text }) => ({ start, end, raw, text })), [{
    start,
    end: start + 6,
    raw: "su3cl3",
    text: "你好",
  }]);
});

test("keeps preference memory isolated between engine instances", () => {
  const learned = core.createEngine();
  const untouched = core.createEngine();
  const raw = "cl3g4";

  assert.equal(learned.analyze(raw).suggestions[0].text, "好事");
  assert.equal(learned.remember(raw, ["好", "市"]), true);
  assert.equal(learned.analyze(raw).suggestions[0].text, "好市");
  assert.equal(learned.analyze(raw).suggestions[0].preferenceCount, 1);
  assert.equal(untouched.analyze(raw).suggestions[0].text, "好事");

  learned.clearPreferences();
  assert.equal(learned.analyze(raw).suggestions[0].text, "好事");
});

test("rejects invalid Core API input without retaining arbitrary text", () => {
  const engine = core.createEngine();
  assert.throws(() => engine.analyze(null), /expects a string/);
  assert.throws(() => engine.remember(null, []), /expects a string/);
  assert.equal(engine.remember("cl3g4", ["不存在", "市"]), false);
  assert.equal(engine.analyze("cl3g4").suggestions[0].text, "好事");
});
