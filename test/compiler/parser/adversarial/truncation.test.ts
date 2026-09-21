// Truncation tests. For each strategically important token boundary, cut a
// valid program short. The parser must reject with a controlled diagnostic
// (never crash, hang, or claim success).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const TRUNCATIONS: Array<{ label: string; source: string }> = [
  { label: "after `module`", source: "module" },
  { label: "trailing dot in module name path", source: "module Warehouse.\n" },
  { label: "inside export list (one name)", source: "module Warehouse (item" },
  { label: "inside export list (trailing comma)", source: "module Warehouse (item," },
  { label: "after `import`", source: "module M (x)\n\nimport" },
  { label: "after import path", source: "module M (x)\n\nimport Platform.Time" },
  { label: "inside import selected list", source: "module M (x)\n\nimport Platform.Time (now" },
  { label: "after `as` keyword", source: "module M (x)\n\nimport Platform.Time as" },
  { label: "after `type` keyword", source: "module M (T)\n\ntype" },
  { label: "after `type Foo`", source: "module M (T)\n\ntype Foo" },
  { label: "after `type Foo =`", source: "module M (T)\n\ntype Foo =" },
  { label: "after constructor pipe", source: "module M (T (..))\n\ntype T =\n  |" },
  { label: "after constructor with record-payload open brace", source: "module M (T (..))\n\ntype T =\n  | Alpha {" },
  { label: "inside record type payload", source: "module M (T (..))\n\ntype T =\n  | X { sku ::" },
  { label: "record type field, no closing brace", source: "module M (T)\n\ntype T = { sku :: Text" },
  { label: "after `::` in signature", source: "module M (f)\n\nf ::" },
  { label: "after `->` in type", source: "module M (f)\n\nf :: Int ->" },
  { label: "after `->` in lambda", source: "module M (f)\n\nf = \\x ->" },
  { label: "after lambda backslash", source: "module M (f)\n\nf = \\" },
  { label: "after `let` keyword", source: "module M (f)\n\nf =\n  let" },
  { label: "let with binding but no `in`", source: "module M (f)\n\nf =\n  let\n    z = 1" },
  { label: "after `case scrutinee`", source: "module M (f)\n\nf x =\n  case x" },
  { label: "after `of` keyword", source: "module M (f)\n\nf x =\n  case x of" },
  { label: "after case branch pattern", source: "module M (f)\n\nf x =\n  case x of\n    _" },
  { label: "case branch arrow with no body", source: "module M (f)\n\nf x =\n  case x of\n    _ ->" },
  { label: "after top-level `=`", source: "module M (x)\n\nx =" },
  { label: "after operator", source: "module M (r)\n\nr = 1 +" },
  { label: "inside record literal", source: "module M (r)\n\nr = { alpha = 1" },
  { label: "inside list literal", source: "module M (r)\n\nr = [1, 2" },
  { label: "unbalanced open paren in expression", source: "module M (r)\n\nr = (1 + 2" },
  { label: "after infix `+` at EOL", source: "module M (r)\n\nr = 1 +\n" },
];

for (const { label, source } of TRUNCATIONS) {
  test(`truncation is rejected with a diagnostic: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parse unexpectedly succeeded for truncation: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, `no diagnostic reported for: ${label}`);
    const d = outcome.diagnostics[0]!;
    assert.equal(d.span.file, "test.blk");
    assert.ok(typeof d.code === "string" && d.code.startsWith("BLACK_PARSE_"));
    assert.ok(typeof d.message === "string" && d.message.length > 0);
  });
}
