// Unit-syntax corruption tests. The canonical unit spelling is `()` (both
// type and value). Adjacent malformed near-misses must fail with a controlled
// diagnostic and must never crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

// Positive baselines: these MUST parse.
const VALID: Array<{ label: string; source: string }> = [
  { label: "unit as function body", source: "module M (m)\n\nm = ()\n" },
  { label: "unit as signature result", source: "module M (m)\n\nm :: ()\nm = ()\n" },
  { label: "unit inside a larger type", source: "module M (m)\n\nm :: Int -> ()\nm x = ()\n" },
  { label: "unit inside parenthesized-with-space", source: "module M (m)\n\nm = (  )\n" },
];

for (const { label, source } of VALID) {
  test(`unit corruption baseline: valid — ${label}`, () => {
    const outcome = parseText(source);
    assert.ok(outcome.ok, `baseline must parse; got: ${outcome.diagnostics[0]?.message}`);
  });
}

// Malformed unit-adjacent inputs. Each must be rejected with a structured
// diagnostic. We do not assert an exact code — the parser is free to pick the
// most specific applicable one — but rejection is mandatory.
const INVALID: Array<{ label: string; source: string }> = [
  { label: "lone open paren as expression",   source: "module M (m)\n\nm = (\n" },
  { label: "lone close paren as expression",  source: "module M (m)\n\nm = )\n" },
  { label: "trailing garbage inside `()`",    source: "module M (m)\n\nm = (,)\n" },
  { label: "unbalanced `(()` at eof",         source: "module M (m)\n\nm = (()\n" },
  { label: "orphan `())` at eof",             source: "module M (m)\n\nm = ())\n" },
  { label: "empty tuple-like `(,)`",          source: "module M (m)\n\nm = (, )\n" },
];

for (const { label, source } of INVALID) {
  test(`unit corruption rejected: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parser accepted malformed unit-adjacent input: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
    assert.ok(outcome.diagnostics[0]!.code.startsWith("BLACK_"));
  });
}
