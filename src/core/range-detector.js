(() => {
  const MAX_FIELD_LENGTH = 2000;
  const MAX_TOKENS = 128;
  const MAX_WINDOW = 8;
  const MAX_RESULTS = 8;

  // Never carve a recovery substring out of identifiers, URLs, emails or code.
  // Offsets remain UTF-16, matching DOM selection and setRangeText.
  function findRecoveryRanges(value) {
    if (typeof value !== "string") throw new TypeError("findRecoveryRanges expects a string");
    if (value.length > MAX_FIELD_LENGTH) return [];
    const protectedRanges = [];
    const patterns = [
      /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"'，。！？；、（）【】]+/gi,
      /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[\/?#][^\s<>"'，。！？；、（）【】]*)?/gi,
      /[^\s<>"'，。！？；、（）【】]+@[^\s<>"'，。！？；、（）【】]+/g,
      /[a-z]:[\\/][^\s<>"'，。！？；、（）【】]+/gi,
      /(?:^|[\s(（])(?:\.{0,2}\/|~[\\/])[^\s<>"'，。！？；、（）【】]+/g,
      /`[^`]*(?:`|$)/g,
    ];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        protectedRanges.push([match.index, match.index + match[0].length]);
      }
    }
    // Protected ASCII punctuation stays inside the token instead of exposing
    // false substrings, e.g. user_su3cl3, x=su3cl3 or su3cl3@example.com.
    const tokens = [...value.matchAll(/[A-Za-z0-9.,;/@:_\\?#=%+~&-]+/g)].map((match) => ({
      start: match.index, end: match.index + match[0].length, raw: match[0],
      protected: protectedRanges.some(([start, end]) => match.index < end && match.index + match[0].length > start),
    }));
    if (tokens.length > MAX_TOKENS) return [];
    const results = [];
    let probes = 0;
    for (let index = 0; index < tokens.length; index++) {
      const first = tokens[index];
      if (first.protected || /[A-Z@:_\\?#=%+~&]/.test(first.raw)) continue;
      let best = null;
      let lastIndex = index;
      for (let endIndex = index; endIndex < Math.min(tokens.length, index + MAX_WINDOW); endIndex++) {
        const last = tokens[endIndex];
        if (last.protected || /[A-Z@:_\\?#=%+~&]/.test(last.raw)) break;
        if (endIndex > index && value.slice(tokens[endIndex - 1].end, last.start) !== " ") break;
        const raw = value.slice(first.start, last.end);
        if (raw.length > 160) break;
        if (++probes > 512) return []; // No partial scan results when the work limit is reached.
        let detection = globalThis.TypingRecovery.detectRecovery(raw);
        let end = last.end;
        // Include one explicit first-tone delimiter only if needed to complete
        // the final syllable; other surrounding whitespace stays outside range.
        if (!detection.suggest && value[end] === " " && raw.length < 160) {
          detection = globalThis.TypingRecovery.detectRecovery(raw + " ");
          if (detection.suggest) end++;
        }
        if (detection.suggest) {
          best = { ...detection, start: first.start, end, raw: value.slice(first.start, end) };
          lastIndex = endIndex;
        }
      }
      if (best) {
        results.push(best);
        if (results.length > MAX_RESULTS) return [];
        index = lastIndex;
      }
    }
    return results;
  }

  globalThis.TypingRecovery = Object.freeze({ ...globalThis.TypingRecovery, findRecoveryRanges });
})();
