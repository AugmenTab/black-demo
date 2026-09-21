// Prefix/suffix corruption tests. Take valid fixtures, delete one important
// token, and confirm the parser rejects the result. This defends against
// overly permissive error recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const VALID_FIXTURES: Array<{ label: string; source: string }> = [
  {
    label: "simple module with variant + function",
    source: [
      "module Sample.Store (Item (..), price)",
      "",
      "type Item =",
      "  | Trinket",
      "  | Widget",
      "",
      "price :: Item -> Int",
      "price it = 42",
    ].join("\n") + "\n",
  },
  {
    label: "module with imports and record variant",
    source: [
      "module Retail.Order (Cart (..), total)",
      "",
      "import Platform.Money (Cents, add)",
      "",
      "type Cart =",
      "  | Empty",
      "  | Filled",
      "      { line :: Text",
      "      , cost :: Cents",
      "      }",
      "",
      "total :: Cart -> Cents",
      "total c = 0",
    ].join("\n") + "\n",
  },
  {
    label: "module with case expression",
    source: [
      "module Traffic.Signal (Colour (..), decide)",
      "",
      "type Colour =",
      "  | Red",
      "  | Amber",
      "  | Green",
      "",
      "decide c =",
      "  case c of",
      "    Red -> 0",
      "    _ -> 1",
    ].join("\n") + "\n",
  },
];

// Each mutator returns null if the fixture does not contain the target token
// (so we can skip that mutation for that fixture without falsely claiming a
// crash).
const MUTATORS: Array<{ label: string; mutate: (s: string) => string | null }> = [
  { label: "delete first mandatory `|`", mutate: (s) => deleteFirstMatch(s, /  \| /) },
  { label: "delete top-level `=`", mutate: (s) => deleteFirstMatch(s, / = /) },
  { label: "delete `::` in signature", mutate: (s) => deleteFirstMatch(s, / :: /) },
  { label: "delete closing paren of export list", mutate: (s) => s.includes(")\n") ? s.replace(")\n", "\n") : null },
  { label: "delete opening brace of record variant", mutate: (s) => deleteFirstMatch(s, /\{/) },
  { label: "delete closing brace of record variant", mutate: (s) => deleteFirstMatch(s, /\}/) },
  { label: "inject stray closing brace at end", mutate: (s) => s + "}\n" },
  { label: "inject stray closing bracket at end", mutate: (s) => s + "]\n" },
  { label: "inject stray closing paren at end", mutate: (s) => s + ")\n" },
];

function deleteFirstMatch(s: string, re: RegExp): string | null {
  const m = s.match(re);
  if (!m || m.index === undefined) return null;
  return s.slice(0, m.index) + s.slice(m.index + m[0].length);
}

for (const { label: fLabel, source } of VALID_FIXTURES) {
  // First: the fixture itself must be valid, or the corruption test is meaningless.
  test(`corruption baseline valid: ${fLabel}`, () => {
    const outcome = parseText(source);
    assert.ok(outcome.ok, `baseline fixture must parse; got: ${outcome.diagnostics[0]?.message}`);
  });

  for (const { label: mLabel, mutate } of MUTATORS) {
    const mutated = mutate(source);
    if (mutated === null || mutated === source) {
      // Mutator did not apply; skip silently. Skipping is fine: other
      // fixtures cover the relevant tokens.
      continue;
    }
    test(`corruption rejected: ${fLabel} / ${mLabel}`, () => {
      const outcome = parseText(mutated);
      assert.equal(outcome.ok, false, `parser accepted mutated source for ${fLabel} / ${mLabel}`);
      assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
      const d = outcome.diagnostics[0]!;
      assert.equal(d.span.file, "test.blk");
      assert.ok(typeof d.code === "string" && d.code.startsWith("BLACK_"));
    });
  }
}
