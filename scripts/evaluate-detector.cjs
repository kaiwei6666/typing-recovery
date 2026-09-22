const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const context = vm.createContext({});
for (const file of manifest.content_scripts[0].js.filter((file) => file.startsWith("src/core/"))) {
  vm.runInContext(readFileSync(resolve(root, file), "utf8"), context, { filename: file });
}
const fixture = JSON.parse(readFileSync(resolve(root, "tests/fixtures/detector-cases.json"), "utf8"));
const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
let failures = 0;
for (const entry of fixture.cases) {
  const result = context.TypingRecovery.detectRecovery(entry.raw);
  const positive = entry.intent === "mistyped";
  counts[result.suggest ? (positive ? "truePositive" : "falsePositive") : (positive ? "falseNegative" : "trueNegative")]++;
  if (result.suggest !== entry.suggest || (entry.text && result.text !== entry.text) || (entry.reason && result.reason !== entry.reason)) {
    failures++;
    console.error("Policy regression:", JSON.stringify(entry), JSON.stringify(result));
  }
}
console.log(fixture.description);
console.log(JSON.stringify({ examples: fixture.cases.length, policyFailures: failures, ...counts,
  precision: counts.truePositive / (counts.truePositive + counts.falsePositive || 1),
  recall: counts.truePositive / (counts.truePositive + counts.falseNegative || 1),
}, null, 2));
process.exitCode = failures ? 1 : 0;
