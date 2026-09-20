(() => {
  const consonants = new Set("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ");
  const medials = new Set("ㄧㄨㄩ");
  const finals = new Set("ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ");
  const standaloneConsonants = new Set("ㄓㄔㄕㄖㄗㄘㄙ");
  const tones = new Map([["ˊ", 2], ["ˇ", 3], ["ˋ", 4], ["˙", 5]]);

  // Structural segmentation only: a dictionary must validate actual readings.
  // Offsets use UTF-16, matching input.selectionStart / selectionEnd.
  function parseKeystrokes(raw) {
    if (typeof raw !== "string") {
      throw new TypeError("parseKeystrokes expects a string");
    }

    const segments = [];
    const syllables = [];
    let pending = null;
    let offset = 0;

    function flush(boundary, tone = null) {
      if (!pending) return;
      const hasBody = pending.rank >= 2 || standaloneConsonants.has(pending.zhuyin[0]);
      const issues = [];
      if (!hasBody) issues.push("incomplete-body");
      if (tone === null) issues.push("missing-tone");
      const { rank, ...syllable } = pending;
      Object.assign(syllable, { tone, boundary, issues });
      segments.push(syllable);
      syllables.push(syllable);
      pending = null;
    }

    for (const char of raw) {
      const start = offset;
      offset += char.length;
      const mapped = globalThis.ZHUYIN_KEY_MAP[char.toLowerCase()];
      const rank = consonants.has(mapped) ? 1 : medials.has(mapped) ? 2 : finals.has(mapped) ? 3 : 0;

      if (rank) {
        // A repeated or earlier component begins a tentative new syllable.
        if (pending && rank <= pending.rank) flush("structure");
        if (!pending) {
          pending = { type: "syllable", raw: "", zhuyin: "", start, end: offset, rank };
        }
        pending.raw += char;
        pending.zhuyin += mapped;
        pending.end = offset;
        pending.rank = rank;
      } else if (tones.has(mapped)) {
        if (pending) {
          pending.raw += char;
          pending.zhuyin += mapped;
          pending.end = offset;
          flush("tone", tones.get(mapped));
        } else {
          segments.push({ type: "invalid", raw: char, zhuyin: mapped, start, end: offset, issues: ["orphan-tone"] });
        }
      } else {
        // Keep whitespace as its own segment so reconstruction is lossless.
        flush(char === " " ? "space" : "literal", char === " " ? 1 : null);
        segments.push({ type: "literal", raw: char, zhuyin: char, start, end: offset });
      }
    }
    flush("end");

    return { raw, zhuyin: segments.map((segment) => segment.zhuyin).join(""), syllables, segments };
  }

  globalThis.TypingRecovery = Object.freeze({ parseKeystrokes });
})();
