(() => {
  const API_VERSION = "0.1.0";

  function createEngine() {
    const api = globalThis.TypingRecovery;
    const preferences = api.createPreferenceMemory();

    function analyze(raw, context = {}) {
      if (typeof raw !== "string") throw new TypeError("analyze expects a string");
      const recovery = api.getCandidateRecovery(raw);
      const suggestions = api.rankCandidates(recovery, context, preferences.get(recovery));
      return { ...recovery, suggestions };
    }

    function remember(raw, choices) {
      if (typeof raw !== "string") throw new TypeError("remember expects a string");
      return preferences.record(api.getCandidateRecovery(raw), choices);
    }

    return Object.freeze({
      apiVersion: API_VERSION,
      parse: api.parseKeystrokes,
      analyze,
      detect: api.detectRecovery,
      scan: api.findRecoveryRanges,
      getContext: api.getRankingContext,
      remember,
      clearPreferences: preferences.clear,
    });
  }

  globalThis.TypingRecoveryCore = Object.freeze({
    apiVersion: API_VERSION,
    createEngine,
  });
})();
