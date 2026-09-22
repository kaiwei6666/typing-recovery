(() => {
  const LIMIT = 5;
  const MAX_UNITS = 120;
  const score = (count) => Math.log((count + 1) / globalThis.ZHUYIN_FREQUENCY_TOTAL);
  const JOIN_BONUS = Math.log(3);

  // K-best paths through the fixed syllable sequence. Scores are smoothed
  // unigram log frequencies plus a small within-word continuity bonus,
  // NOT calibrated probabilities of user intent.
  function rankCandidates(recovery) {
    const { units, raw } = recovery;
    if (!units.length || units.length > MAX_UNITS) return [];
    const paths = Array.from({ length: units.length + 1 }, () => []);
    paths[units.length] = [{ score: 0, choices: [], phrases: [] }];

    function canJoin(left, right) {
      const gap = raw.slice(left.end, right.start);
      return gap === "" || (left.tone === 1 && left.boundary === "space" && gap === " ");
    }

    for (let start = units.length - 1; start >= 0; start--) {
      const unit = units[start];
      const edges = unit.candidates.map((char, index) => ({
        end: start + 1, choices: [char], score: score(globalThis.ZHUYIN_CHARACTER_COUNTS[char] ?? 0),
        index, phrases: [],
      })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, LIMIT);
      if (!edges.length) edges.push({ end: start + 1, choices: [""], score: 0, phrases: [] });

      if (unit.status === "ready") {
        const readings = [unit.zhuyin];
        for (let end = start + 1; end < Math.min(start + 6, units.length); end++) {
          if (units[end].status !== "ready" || !canJoin(units[end - 1], units[end])) break;
          readings.push(units[end].zhuyin);
          const matches = globalThis.ZHUYIN_PHRASES[readings.join("-")] ?? [];
          for (const [word, count] of matches.slice(0, LIMIT)) {
            edges.push({ end: end + 1, choices: [...word],
              score: score(count) + JOIN_BONUS * (end - start), phrases: [word] });
          }
        }
      }

      const candidates = [];
      for (const edge of edges) {
        for (const tail of paths[edge.end]) {
          candidates.push({ score: edge.score + tail.score,
            choices: [...edge.choices, ...tail.choices], phrases: [...edge.phrases, ...tail.phrases] });
        }
      }
      candidates.sort((a, b) => b.score - a.score || b.phrases.length - a.phrases.length);
      const seen = new Set();
      for (const candidate of candidates) {
        const key = JSON.stringify(candidate.choices);
        if (seen.has(key)) continue;
        seen.add(key);
        paths[start].push(candidate);
        if (paths[start].length === LIMIT) break;
      }
    }
    return paths[0].filter((path) => path.choices.some(Boolean)).map((path) => ({
      ...path, text: globalThis.TypingRecovery.composeCandidates(recovery, path.choices),
    }));
  }

  globalThis.TypingRecovery = Object.freeze({ ...globalThis.TypingRecovery, rankCandidates });
})();
