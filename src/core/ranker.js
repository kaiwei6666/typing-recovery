(() => {
  const LIMIT = 5;
  const MAX_UNITS = 120;
  const score = (count) => Math.log((count + 1) / globalThis.ZHUYIN_FREQUENCY_TOTAL);
  const JOIN_BONUS = Math.log(3);
  const CONTEXT_WEIGHT = 0.35;
  const HAN = /^\p{Script=Han}$/u;

  function getRankingContext(value, start, end) {
    if (typeof value !== "string" || !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end < start || end > value.length) {
      throw new TypeError("getRankingContext expects a string and a valid UTF-16 range");
    }
    const left = [...value.slice(0, start)].at(-1) ?? "";
    const right = [...value.slice(end)][0] ?? "";
    return { left: HAN.test(left) ? left : "", right: HAN.test(right) ? right : "" };
  }

  function withContext(path, context) {
    const pairs = [];
    let contextScore = 0;
    const first = path.choices[0];
    const last = path.choices.at(-1);
    for (const pair of [context.left && HAN.test(first) ? context.left + first : "",
      context.right && HAN.test(last) ? last + context.right : ""]) {
      const count = globalThis.ZHUYIN_CONTEXT_COUNTS[pair] ?? 0;
      if (!count) continue;
      pairs.push(pair);
      contextScore += Math.log(count + 1) * CONTEXT_WEIGHT;
    }
    return { ...path, baseScore: path.score, contextScore, contextPairs: pairs,
      score: path.score + contextScore };
  }

  // K-best paths through the fixed syllable sequence. Scores are smoothed
  // unigram log frequencies plus a small within-word continuity bonus,
  // NOT calibrated probabilities of user intent.
  function rankCandidates(recovery, context = {}) {
    const { units, raw } = recovery;
    if (!units.length || units.length > MAX_UNITS) return [];
    const rankingContext = {
      left: HAN.test(context.left ?? "") ? context.left : "",
      right: HAN.test(context.right ?? "") ? context.right : "",
    };
    const pathLimit = rankingContext.left || rankingContext.right ? 20 : LIMIT;
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
      })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, pathLimit);
      if (!edges.length) edges.push({ end: start + 1, choices: [""], score: 0, phrases: [] });

      if (unit.status === "ready") {
        const readings = [unit.zhuyin];
        for (let end = start + 1; end < Math.min(start + 6, units.length); end++) {
          if (units[end].status !== "ready" || !canJoin(units[end - 1], units[end])) break;
          readings.push(units[end].zhuyin);
          const matches = globalThis.ZHUYIN_PHRASES[readings.join("-")] ?? [];
          for (const [word, count] of matches.slice(0, pathLimit)) {
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
        if (paths[start].length === pathLimit) break;
      }
    }
    return paths[0].filter((path) => path.choices.some(Boolean)).map((path) => withContext({
      ...path, text: globalThis.TypingRecovery.composeCandidates(recovery, path.choices),
    }, rankingContext)).sort((a, b) => b.score - a.score || b.baseScore - a.baseScore)
      .slice(0, LIMIT);
  }

  globalThis.TypingRecovery = Object.freeze({ ...globalThis.TypingRecovery, getRankingContext, rankCandidates });
})();
