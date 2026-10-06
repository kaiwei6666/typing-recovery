(() => {
  const MAX_KEYS = 100;
  const MAX_CHOICES = 5;
  const entries = new Map();
  let sequence = 0;

  function keyFor(recovery) {
    if (!recovery?.units?.length || recovery.units.some((unit) => unit.status !== "ready")) return null;
    return recovery.units.map((unit) => unit.zhuyin).join("-");
  }

  function get(recovery) {
    const key = keyFor(recovery);
    if (!key || !entries.has(key)) return [];
    const choices = entries.get(key);
    // Reading the entry also refreshes its page-session recency.
    entries.delete(key);
    entries.set(key, choices);
    return choices.map((choice) => ({ choices: [...choice.choices], count: choice.count }));
  }

  function record(recovery, choices) {
    const key = keyFor(recovery);
    if (!key || !Array.isArray(choices) || choices.length !== recovery.units.length ||
      choices.some((choice, index) => !recovery.units[index].candidates.includes(choice))) return false;
    const stored = entries.get(key) ?? [];
    const encoded = JSON.stringify(choices);
    const existing = stored.find((choice) => choice.encoded === encoded);
    if (existing) {
      existing.count++;
      existing.sequence = ++sequence;
    } else {
      stored.push({ choices: [...choices], encoded, count: 1, sequence: ++sequence });
    }
    stored.sort((a, b) => b.count - a.count || b.sequence - a.sequence);
    if (stored.length > MAX_CHOICES) stored.length = MAX_CHOICES;
    entries.delete(key);
    entries.set(key, stored);
    while (entries.size > MAX_KEYS) entries.delete(entries.keys().next().value);
    return true;
  }

  function clear() {
    entries.clear();
  }

  globalThis.TypingRecoveryPreferences = Object.freeze({ get, record, clear });
})();
