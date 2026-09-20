(() => {
  const { parseKeystrokes } = globalThis.TypingRecovery;

  function getCandidateRecovery(raw) {
    const recovery = parseKeystrokes(raw);
    const units = recovery.syllables.map((syllable) => {
      let status = "ready";
      if (syllable.issues.includes("incomplete-body")) status = "incomplete-body";
      else if (syllable.issues.includes("missing-tone")) status = "missing-tone";
      const candidates = status === "ready"
        ? [...(globalThis.ZHUYIN_DICTIONARY[syllable.zhuyin] ?? "")]
        : [];
      if (status === "ready" && !candidates.length) status = "unlisted-reading";
      return { ...syllable, status, candidates };
    });
    return { ...recovery, units };
  }

  // Empty choice means keep the original keys, never silently discard an error.
  function composeCandidates(recovery, choices, preserveSpaces = false) {
    if (!Array.isArray(choices) || choices.length !== recovery.units.length) {
      throw new TypeError("One choice is required per syllable");
    }
    let text = "";
    let unitIndex = 0;
    let consumeSpace = false;
    for (const segment of recovery.segments) {
      if (segment.type === "syllable") {
        const unit = recovery.units[unitIndex];
        const choice = choices[unitIndex++];
        if (choice !== "" && !unit.candidates.includes(choice)) {
          throw new RangeError("Choice is not a candidate for this reading");
        }
        text += choice || segment.raw;
        consumeSpace = !preserveSpaces && choice !== "" && unit.tone === 1 && unit.boundary === "space";
      } else {
        if (!(consumeSpace && segment.raw === " ")) text += segment.raw;
        consumeSpace = false;
      }
    }
    return text;
  }

  globalThis.TypingRecovery = Object.freeze({ ...globalThis.TypingRecovery, getCandidateRecovery, composeCandidates });
})();
