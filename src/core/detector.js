(() => {
  const MAX_LENGTH = 160;
  const MAX_SYLLABLES = 32;
  const MIN_COVERAGE = 0.6;
  const MIN_MARGIN = Math.log(1.5);

  // Conservative whole-field heuristics, not language identification or a
  // calibrated confidence model. Manual recovery remains available on rejects.
  function detectRecovery(raw) {
    if (typeof raw !== "string") throw new TypeError("detectRecovery expects a string");
    const reject = (reason) => ({ suggest: false, reason });
    if (raw.length > MAX_LENGTH) return reject("too-long");
    if (!raw.trim()) return reject("empty");
    if (/[A-Z@:_\\?#=]/.test(raw) || /[a-z0-9-]+\.[a-z]{2,}(?:\b|\/)/.test(raw)) {
      return reject("protected-text");
    }
    if (/[^a-z0-9,.;/\- ]/.test(raw)) return reject("unsupported-text");
    if (!/[a-z]/.test(raw) || !/[3467]/.test(raw)) return reject("no-tone-signal");

    const recovery = globalThis.TypingRecovery.getCandidateRecovery(raw);
    if (recovery.units.length < 2) return reject("too-short");
    if (recovery.units.length > MAX_SYLLABLES) return reject("too-long");
    if (recovery.units.some((unit) => unit.status !== "ready") ||
      recovery.segments.some((segment) => segment.type === "invalid")) {
      return reject("incomplete-reading");
    }
    const ranked = globalThis.TypingRecovery.rankCandidates(recovery);
    if (!ranked.length) return reject("no-candidate");
    const best = ranked[0];
    const covered = best.phrases.reduce((sum, phrase) => sum + [...phrase].length, 0);
    const coverage = covered / recovery.units.length;
    if (covered < 2 || coverage < MIN_COVERAGE) return reject("weak-phrase-evidence");
    const margin = ranked.length > 1 ? best.score - ranked[1].score : null;
    if (margin !== null && margin < MIN_MARGIN) return reject("ambiguous-candidate");
    return { suggest: true, reason: "phrase-match", text: best.text,
      evidence: { syllables: recovery.units.length, phraseCoverage: coverage, scoreMargin: margin } };
  }

  globalThis.TypingRecovery = Object.freeze({ ...globalThis.TypingRecovery, detectRecovery });
})();
