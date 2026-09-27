const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const context = vm.createContext({});
for (const file of manifest.content_scripts[0].js.filter(file => file.startsWith("src/core/"))) {
  vm.runInContext(readFileSync(resolve(root, file), "utf8"), context, { filename: file });
}
const fixture = JSON.parse(readFileSync(resolve(root, "tests/fixtures/range-cases.json"), "utf8"));
const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
let failures = 0;
for (const entry of fixture.cases) {
  const ranges = context.TypingRecovery.findRecoveryRanges(entry.raw);
  const actual = Array.from(ranges, ({ start, end, text }) => ({ start, end, text }));
  const positive = entry.intent === "mistyped";
  counts[ranges.length ? (positive ? "truePositive" : "falsePositive") : (positive ? "falseNegative" : "trueNegative")]++;
  if (JSON.stringify(actual) !== JSON.stringify(entry.ranges)) {
    failures++;
    console.error("Range policy regression:", JSON.stringify(entry), JSON.stringify(actual));
  }
}
console.log(fixture.description);
console.log(JSON.stringify({ examples: fixture.cases.length, policyFailures: failures, ...counts,
  // Field-level detection only; exact offsets and text are checked separately above.
  fieldPrecision: counts.truePositive / (counts.truePositive + counts.falsePositive || 1),
  fieldRecall: counts.truePositive / (counts.truePositive + counts.falseNegative || 1),
}, null, 2));
process.exitCode = failures ? 1 : 0;
