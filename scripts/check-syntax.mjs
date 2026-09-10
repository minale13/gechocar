import fs from 'fs';
import ts from 'typescript';

const src = fs.readFileSync('app/admin/page.tsx', 'utf8');
const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ds = sf.parseDiagnostics || [];
if (ds.length === 0) {
  console.log('No parse diagnostics.');
} else {
  for (const d of ds.slice(0, 20)) {
    const pos = sf.getLineAndCharacterOfPosition(d.start);
    console.log(
      `Line ${pos.line + 1}:${pos.character + 1} [${d.code}] —`,
      ts.flattenDiagnosticMessageText(d.messageText, ' '),
    );
  }
}
console.log('Total:', ds.length);
