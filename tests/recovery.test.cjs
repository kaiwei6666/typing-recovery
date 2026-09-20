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
      Object.assign(this, { value, selectionStart: start, selectionEnd: end, events: [] });
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
