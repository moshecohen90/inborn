// Lists every JSX element in apps/mobile/src that carries both `trailing` and `disabled` (F338/F339 evidence).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const ts = createRequire(join(process.cwd(), "apps/mobile/package.json"))("typescript");
const root = "apps/mobile/src";
const files = [];
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) files.push(p);
  });
walk(root);
const hits = [];
for (const file of files) {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n) => {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const attrs = Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(src), a.initializer ? a.initializer.getText(src) : "true"]));
      if ("trailing" in attrs && "disabled" in attrs) {
        const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
        hits.push({ at: `${file}:${line + 1}`, tag: n.tagName.getText(src), testID: attrs.testID, disabled: attrs.disabled, trailing: attrs.trailing.slice(0, 90) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
console.log(JSON.stringify({ scanned: files.length, hits }, null, 2));
