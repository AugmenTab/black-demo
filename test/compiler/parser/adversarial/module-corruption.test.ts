// Module header corruption. Canonical Black requires an explicit parenthesized
// export list on every module. Adjacent malformed near-misses must fail with a
// controlled diagnostic and must never crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const VALID: Array<{ label: string; source: string }> = [
  { label: "single-name export list", source: "module Example (foo)\n\nfoo = ()\n" },
  { label: "empty export list", source: "module Example ()\n\nfoo = ()\n" },
  { label: "multi-line export list", source: "module Example\n  ( foo\n  )\n\nfoo = ()\n" },
];

for (const { label, source } of VALID) {
  test(`module corruption baseline: valid — ${label}`, () => {
    const outcome = parseText(source);
    assert.ok(outcome.ok, `baseline must parse; got: ${outcome.diagnostics[0]?.message}`);
  });
}

const INVALID: Array<{ label: string; source: string }> = [
  { label: "remove opening paren",                      source: "module Example foo)\n\nfoo = ()\n" },
  { label: "remove closing paren",                      source: "module Example (foo\n\nfoo = ()\n" },
  { label: "remove entire export list",                 source: "module Example\n\nfoo = ()\n" },
  { label: "truncate right after module name",          source: "module Example" },
  { label: "declarations immediately after module name (no exports)", source: "module Example\nfoo = ()\n" },
  { label: "module with only opening paren",            source: "module Example (" },
  { label: "module with only closing paren",            source: "module Example )\n\nfoo = ()\n" },
];

for (const { label, source } of INVALID) {
  test(`module corruption rejected: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parser accepted malformed module header: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
    assert.ok(outcome.diagnostics[0]!.code.startsWith("BLACK_"));
  });
}
