// Merges the unit and integration v8 coverage reports into one combined report.
//
// vitest overwrites its coverage dir on every run, so the unit and integration
// suites each emit a `coverage-final.json` into their own directory
// (coverage/unit, coverage/integration). This script merges those two istanbul
// JSON maps and renders a combined text + html report into coverage/merged.
//
// Run AFTER both `test --coverage` and `test:integration --coverage`.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = [
    resolve(serverRoot, "coverage/unit/coverage-final.json"),
    resolve(serverRoot, "coverage/integration/coverage-final.json"),
];

const map = libCoverage.createCoverageMap({});
let merged = 0;
for (const file of inputs) {
    if (!existsSync(file)) {
        console.warn(`! skipping missing report: ${file}`);
        continue;
    }
    map.merge(JSON.parse(readFileSync(file, "utf8")));
    merged += 1;
}

if (merged === 0) {
    console.error(
        "No coverage reports found. Run `yarn test --coverage` and " +
            "`yarn test:integration --coverage` first.",
    );
    process.exit(1);
}

const context = libReport.createContext({
    dir: resolve(serverRoot, "coverage/merged"),
    coverageMap: map,
});
reports.create("text").execute(context);
reports.create("html").execute(context);
// lcov.info is what the Codecov upload reads for the merged server coverage.
reports.create("lcov").execute(context);
console.log(`\nMerged ${merged} coverage report(s) -> coverage/merged`);
