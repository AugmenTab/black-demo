// Malformed near-misses. Each of these is close to a valid grammar shape but
// contains a specific structural error the parser must catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const NEGATIVES: Array<{ label: string; source: string }> = [
  // Module header
  { label: "module keyword without name",           source: "module (main)\n\nmain = ()\n" },
  { label: "unclosed module export list",           source: "module M (foo\n\nfoo = ()\n" },
  { label: "trailing comma in export list",         source: "module M (foo,)\n\nfoo = ()\n" },
  { label: "bare module header (no export list)",   source: "module M\n\nfoo = ()\n" },

  // Imports
  { label: "import with no module name",            source: "module M (m)\n\nimport (foo)\n\nm = ()\n" },
  { label: "import selected list unclosed",         source: "module M (m)\n\nimport X (a, b\n\nm = ()\n" },
  { label: "invalid `as` alias placement",          source: "module M (m)\n\nimport X as (Y)\n\nm = ()\n" },

  // Type declarations
  { label: "type alias missing =",                  source: "module M (T)\n\ntype T Int\n" },
  { label: "type declaration missing name",         source: "module M (T)\n\ntype = Int\n" },

  // Variants
  { label: "variant missing leading pipe",          source: "module M (T (..))\n\ntype T =\n  Foo\n  | Bar\n" },
  { label: "variant alternative missing constructor", source: "module M (T (..))\n\ntype T =\n  |\n  | Bar\n" },
  { label: "unclosed record variant payload",       source: "module M (T (..))\n\ntype T =\n  | X { a :: Int, b :: Int\n" },

  // Records
  { label: "record value field missing =",          source: "module M (r)\n\nr = { x 1 }\n" },
  { label: "record type field missing ::",          source: "module M (T)\n\ntype T = { x Int }\n" },
  { label: "duplicate comma separators",            source: "module M (r)\n\nr = { x = 1,, y = 2 }\n" },
  { label: "unclosed record brace",                 source: "module M (r)\n\nr = { x = 1\n" },

  // Function definitions and signatures
  { label: "definition missing =",                  source: "module M (f)\n\nf x\n" },
  { label: "signature missing type",                source: "module M (f)\n\nf ::\n" },
  { label: "lambda missing ->",                     source: "module M (f)\n\nf = \\x x + 1\n" },
  { label: "lambda missing parameter",              source: "module M (f)\n\nf = \\-> 1\n" },

  // case
  { label: "case missing `of`",                     source: "module M (f)\n\nf x = case x\n  _ -> 0\n" },
  { label: "case branch missing `->`",              source: "module M (f)\n\nf x = case x of\n  None 0\n" },

  // let
  { label: "let missing `in`",                      source: "module M (f)\n\nf =\n  let\n    x = 1\n" },
  { label: "let with zero bindings",                source: "module M (f)\n\nf = let in 1\n" },

  // Lists
  { label: "unclosed list literal",                 source: "module M (r)\n\nr = [1, 2, 3\n" },

  // Trailing garbage after top-level decls
  { label: "trailing tokens after final declaration", source: "module M (a)\n\na = 1\n$ garbage\n" },
];

for (const { label, source } of NEGATIVES) {
  test(`rejects malformed: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parse unexpectedly succeeded for: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
    // All Phase 2 diagnostics carry a span with a real file name.
    const d = outcome.diagnostics[0]!;
    assert.equal(d.span.file, "test.blk");
    assert.ok(typeof d.span.start.line === "number");
    assert.ok(typeof d.span.start.column === "number");
  });
}
