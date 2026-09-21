// Legacy / intentionally-unavailable syntax rejection tests.
// Each of these forms is valid full-Black or common-Haskell shape that the
// preview profile explicitly excludes; the parser must reject them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const REJECTIONS: Array<{ label: string; source: string; expectedCode?: string }> = [
  {
    label: "record punning in construction",
    source: "module M (p)\n\np =\n  { name, lives }\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "record punning in pattern",
    source: "module M (f)\n\nf p =\n  case p of\n    Point { x, y } -> x\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "underscore lambda expression (`_ + 1`)",
    source: "module M (inc)\n\ninc = _ + 1\n",
  },
  {
    label: "unary minus (`-x`)",
    source: "module M (n)\n\nn = -x\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "Haskell-style list-type `[a]`",
    source: "module M (T)\n\ntype T = [Int]\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "angle-bracket variant declaration",
    source: "module M (X (..))\n\ntype X = <Lobby | Playing>\n",
  },
  {
    label: "hybrid `import X (a) as Y` (selected + qualified together)",
    source: "module M (m)\n\nimport X (a) as Y\n\nm = ()\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "bare `import X` (neither selected nor qualified)",
    source: "module M (m)\n\nimport X\n\nm = ()\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
  {
    label: "C-style function call `f(x, y)` (comma inside application parens)",
    // Reason: `f(x, y)` parses as `f` applied to a parenthesized expression `(x, y)`;
    // there is no tuple syntax in the preview so `(x, y)` fails as a bare
    // expression.
    source: "module M (r)\n\nr = f(x, y)\n",
  },
  {
    label: "operator not in the preview operator table (`x && y`)",
    source: "module M (r)\n\nr = x && y\n",
    expectedCode: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
  },
];

for (const { label, source, expectedCode } of REJECTIONS) {
  test(`rejects: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `expected parse failure for: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "must report at least one diagnostic");
    if (expectedCode) {
      const codes: string[] = outcome.diagnostics.map((d) => d.code);
      assert.ok(codes.includes(expectedCode), `expected diagnostic code ${expectedCode}, got: ${codes.join(", ")}`);
    }
  });
}
