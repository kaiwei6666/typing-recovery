const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

function loadExtension() {
  class Input {
    constructor(value, start = 0, end = start) {
      Object.assign(this, { value, selectionStart: start, selectionEnd: end, events: [], type: "text", isConnected: true });
    }
    setRangeText(text, start, end, mode) {
      assert.equal(mode, "end");
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    }
    dispatchEvent(event) { this.events.push(event); }
  }
  const handlers = {};
  const context = vm.createContext({
    HTMLInputElement: Input,
    HTMLTextAreaElement: class extends Input {},
    Event,
    console: { log() {} },
    document: { activeElement: null, addEventListener(type, handler) { handlers[type] = handler; } },
  });
  for (const file of manifest.content_scripts[0].js) {
    vm.runInContext(readFileSync(resolve(root, file), "utf8"), context, { filename: file });
  }
  return { context, handlers, Input, parse: (raw) => JSON.parse(JSON.stringify(context.TypingRecovery.parseKeystrokes(raw))) };
}

const { parse } = loadExtension();

test("splits ni hao and keeps exact input ranges", () => {
  const result = parse("su3cl3");
  assert.equal(result.raw, "su3cl3");
  assert.equal(result.zhuyin, "ㄋㄧˇㄏㄠˇ");
  assert.deepEqual(result.syllables.map(({ raw, zhuyin, start, end, tone, issues }) =>
    ({ raw, zhuyin, start, end, tone, issues })), [
    { raw: "su3", zhuyin: "ㄋㄧˇ", start: 0, end: 3, tone: 3, issues: [] },
    { raw: "cl3", zhuyin: "ㄏㄠˇ", start: 3, end: 6, tone: 3, issues: [] },
  ]);
});

test("space terminates first tone without disappearing from output", () => {
  const result = parse("5j/ jp6");
  assert.equal(result.zhuyin, "ㄓㄨㄥ ㄨㄣˊ");
  assert.deepEqual(result.syllables.map((s) => [s.raw, s.tone, s.boundary]), [
    ["5j/", 1, "space"], ["jp6", 2, "tone"],
  ]);
});

test("supports all explicit tones including neutral tone", () => {
  assert.deepEqual(parse("su6su3su4su7").syllables.map((s) => s.tone), [2, 3, 4, 5]);
});

test("normalizes mapped uppercase keys but retains raw case", () => {
  assert.equal(parse("SU3CL3").zhuyin, "ㄋㄧˇㄏㄠˇ");
  assert.equal(parse("SU3CL3").syllables[0].raw, "SU3");
});

test("does not silently assume a missing tone is first tone", () => {
  const result = parse("5j/jp6");
  assert.equal(result.syllables[0].boundary, "structure");
  assert.equal(result.syllables[0].tone, null);
  assert.deepEqual(result.syllables[0].issues, ["missing-tone"]);
  assert.deepEqual(parse("su").syllables[0].issues, ["missing-tone"]);
});

test("flags incomplete consonants, including ones followed by a tone", () => {
  assert.deepEqual(parse("s").syllables[0].issues, ["incomplete-body", "missing-tone"]);
  assert.deepEqual(parse("s3").syllables[0].issues, ["incomplete-body"]);
  assert.deepEqual(parse("s ").syllables[0].issues, ["incomplete-body"]);
});

test("standalone retroflex/sibilant syllables and vowel-only syllables have bodies", () => {
  for (const raw of ["54", "t4", "g4", "b4", "y4", "h4", "n4", "u4", "84"]) {
    assert.deepEqual(parse(raw).syllables[0].issues, []);
  }
});

test("preserves orphan and repeated tone keys as flagged segments", () => {
  const result = parse("3su33");
  assert.equal(result.zhuyin, "ˇㄋㄧˇˇ");
  assert.deepEqual(result.segments.filter((s) => s.type === "invalid").map((s) => s.issues), [
    ["orphan-tone"], ["orphan-tone"],
  ]);
});

test("preserves literals, Unicode case, emoji and UTF-16 offsets", () => {
  const result = parse("中🙂É@SU3\nCL3!");
  assert.equal(result.zhuyin, "中🙂É@ㄋㄧˇ\nㄏㄠˇ!");
  assert.equal(result.syllables[0].start, 5);
  assert.equal(result.syllables[1].start, 9);
});

test("empty input and whitespace do not produce fake syllables", () => {
  assert.deepEqual(parse(""), { raw: "", zhuyin: "", syllables: [], segments: [] });
  assert.equal(parse(" \t\n ").syllables.length, 0);
  assert.equal(parse(" \t\n ").zhuyin, " \t\n ");
});

test("segmentation is lossless over varied input combinations", () => {
  const chunks = ["SU3", "cl3", "5j/ ", "jp6", "s", "3", "🙂", "中文", "É", "\n", "@", " "];
  for (const left of chunks) {
    for (const right of chunks) {
      const raw = left + right;
      const result = parse(raw);
      assert.equal(result.segments.map((s) => s.raw).join(""), raw);
      let offset = 0;
      for (const segment of result.segments) {
        assert.equal(segment.start, offset);
        assert.equal(raw.slice(segment.start, segment.end), segment.raw);
        offset = segment.end;
      }
      assert.equal(offset, raw.length);
    }
  }
});

test("shortcut uses manifest load order and only replaces selected text", () => {
  const { context, handlers, Input } = loadExtension();
  const input = new Input("前su3cl3後", 1, 7);
  context.document.activeElement = input;
  let prevented = false;
  handlers.keydown({ ctrlKey: true, shiftKey: true, code: "KeyY", preventDefault() { prevented = true; } });
  assert.equal(input.value, "前ㄋㄧˇㄏㄠˇ後");
  assert.equal(input.selectionStart, 7);
  assert.equal(prevented, true);
  assert.equal(input.events.length, 1);
  assert.equal(input.events[0].type, "input");
  assert.equal(input.events[0].bubbles, true);
});

test("no selection still converts the entire textarea and returns raw data", () => {
  const { context } = loadExtension();
  const input = new context.HTMLTextAreaElement("su3cl3", 2);
  const result = context.recoverCurrentInput(input);
  assert.equal(input.value, "ㄋㄧˇㄏㄠˇ");
  assert.equal(result.raw, "su3cl3");
  assert.equal(result.syllables.length, 2);
});

test("other keys and unsupported targets are ignored", () => {
  const { context, handlers, Input } = loadExtension();
  const input = new Input("su3");
  context.document.activeElement = input;
  handlers.keydown({ ctrlKey: false, shiftKey: true, code: "KeyY" });
  assert.equal(input.value, "su3");
  context.document.activeElement = {};
  handlers.keydown({ ctrlKey: true, shiftKey: true, code: "KeyY" });
});

test("bundled dictionary covers ni hao, neutral tone and tonal distinctions", () => {
  const { context } = loadExtension();
  const get = context.TypingRecovery.getCandidateRecovery;
  const result = get("su3cl3");
  assert.equal(result.units[0].candidates[0], "你");
  assert.ok(result.units[0].candidates.includes("妳"));
  assert.equal(result.units[1].candidates[0], "好");
  assert.ok(get("a87").units[0].candidates.includes("嗎"));
  assert.ok(get("g4").units[0].candidates.includes("是"));
  assert.ok(!get("g3").units[0].candidates.includes("是"));
});

test("candidate composition supports alternate choices and preserving raw keys", () => {
  const { getCandidateRecovery: get, composeCandidates: compose } = loadExtension().context.TypingRecovery;
  const result = get("su3cl3");
  assert.equal(compose(result, ["你", "好"]), "你好");
  assert.equal(compose(result, ["妳", "好"]), "妳好");
  assert.equal(compose(result, ["", "好"]), "su3好");
  assert.throws(() => compose(result, ["錯", "好"]), /not a candidate/);
  assert.throws(() => compose(result, ["你"]), /One choice/);
});

test("unknown readings and incomplete input have no fabricated candidates", () => {
  const { context } = loadExtension();
  const get = context.TypingRecovery.getCandidateRecovery;
  assert.equal(get("su").units[0].status, "missing-tone");
  assert.equal(get("s3").units[0].status, "incomplete-body");
  assert.equal(get("1m3").units[0].status, "unlisted-reading");
  for (const raw of ["su", "s3", "1m3"]) assert.equal(get(raw).units[0].candidates.length, 0);
  const result = get("su3@1m33🙂");
  assert.equal(context.TypingRecovery.composeCandidates(result, ["你", ""]), "你@1m33🙂");
});

test("only the first-tone delimiter of a converted syllable is consumed", () => {
  const { getCandidateRecovery: get, composeCandidates: compose } = loadExtension().context.TypingRecovery;
  assert.equal(compose(get("5j/ jp6"), ["中", "文"]), "中文");
  assert.equal(compose(get("5j/ jp6"), ["中", "文"], true), "中 文");
  assert.equal(compose(get("5j/  jp6"), ["中", "文"]), "中 文");
  assert.equal(compose(get("5j/ jp6"), ["", "文"]), "5j/ 文");
  assert.equal(compose(get("su3 cl3"), ["你", "好"]), "你 好");
});

test("dictionary contains unique Han candidates and no empty entries", () => {
  const dictionary = loadExtension().context.ZHUYIN_DICTIONARY;
  assert.ok(Object.keys(dictionary).length > 1000);
  for (const [reading, chars] of Object.entries(dictionary)) {
    assert.match(reading, /^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/);
    assert.match(chars, /^\p{Script=Han}+$/u);
    assert.equal(new Set(chars).size, [...chars].length);
  }
});

test("readonly, disabled and non-text inputs cannot be modified", () => {
  const { context, handlers, Input } = loadExtension();
  for (const properties of [{ readOnly: true }, { disabled: true }, { type: "password" }, { type: "email" }, { type: "number" }]) {
    const input = Object.assign(new Input("su3"), properties);
    context.document.activeElement = input;
    handlers.keydown({ ctrlKey: true, shiftKey: true, code: "KeyY", preventDefault() { assert.fail("Should ignore field"); } });
    assert.equal(input.value, "su3");
  }
});

test("composition, key repeats and extra modifiers do not trigger conversion", () => {
  const { context, handlers, Input } = loadExtension();
  const input = new Input("su3");
  context.document.activeElement = input;
  for (const extras of [{ isComposing: true }, { repeat: true }, { altKey: true }, { metaKey: true }]) {
    handlers.keydown({ ctrlKey: true, shiftKey: true, code: "KeyY", ...extras,
      preventDefault() { assert.fail("Should ignore key event"); } });
  }
  assert.equal(input.value, "su3");
});

test("snapshot replacement refuses changed, detached and newly readonly fields", () => {
  const { context, Input } = loadExtension();
  for (const properties of [{ value: "new text" }, { isConnected: false }, { readOnly: true }]) {
    const input = new Input("su3");
    const snapshot = context.captureInput(input);
    Object.assign(input, properties);
    assert.equal(context.replaceInput(input, snapshot, "你"), false);
    assert.equal(input.value, properties.value ?? "su3");
    assert.equal(input.events.length, 0);
  }
});
