// `case` expression corruption. Ordinary alternatives do not accept a leading
// declaration-style `|`; malformed near-misses must fail with a controlled
// diagnostic and must never crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const VALID: Array<{ label: string; source: string }> = [
  {
    label: "single branch without pipe",
    source: "module M (f)\n\nf x =\n  case x of\n    Some y -> y\n",
  },
  {
    label: "multiple branches without pipes",
    source: "module M (f)\n\nf x =\n  case x of\n    Some y -> y\n    None -> 0\n",
  },
  {
    label: "wildcard branch",
    source: "module M (f)\n\nf x =\n  case x of\n    _ -> 0\n",
  },
];

for (const { label, source } of VALID) {
  test(`case corruption baseline: valid — ${label}`, () => {
    const outcome = parseText(source);
    assert.ok(outcome.ok, `baseline must parse; got: ${outcome.diagnostics[0]?.message}`);
  });
}

const INVALID: Array<{ label: string; source: string }> = [
  { label: "case with no branches (`case x of` alone)",   source: "module M (f)\n\nf x =\n  case x of\n" },
  { label: "case with lone `|` and no branch",            source: "module M (f)\n\nf x =\n  case x of\n    |\n" },
  { label: "first branch prefixed with `|`",              source: "module M (f)\n\nf x =\n  case x of\n    | Some y -> y\n" },
  { label: "later branch prefixed with `|`",              source: "module M (f)\n\nf x =\n  case x of\n    Some y -> y\n    | None -> 0\n" },
];

for (const { label, source } of INVALID) {
  test(`case corruption rejected: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parser accepted malformed case input: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
    assert.ok(outcome.diagnostics[0]!.code.startsWith("BLACK_"));
  });
}
