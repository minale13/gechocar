/**
 * Instant syntax validation for edited files.
 * Uses the project's own TypeScript compiler API in PARSE-ONLY mode —
 * no module resolution, no type checking — so it returns in milliseconds
 * even on very slow machines. Reports any syntax/JSX structural errors.
 *
 * Usage: node scripts/syntax-check.js
 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const files = [
  "components/app/home-page.tsx",
  "app/admin/page.tsx",
  "app/page.tsx",
];

let failed = false;

for (const rel of files) {
  const fullPath = path.join(__dirname, "..", rel);
  const source = fs.readFileSync(fullPath, "utf8");
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const diags = sf.parseDiagnostics || [];
  if (diags.length === 0) {
    console.log(`OK       ${rel} (${source.split("\n").length} lines, 0 syntax errors)`);
  } else {
    failed = true;
    console.error(`FAIL     ${rel}`);
    for (const d of diags.slice(0, 10)) {
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
      console.error(`  ${line + 1}:${character + 1} - ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    }
  }
}

console.log(failed ? "SYNTAX CHECK FAILED" : "SYNTAX CHECK PASSED");
process.exit(failed ? 1 : 0);
