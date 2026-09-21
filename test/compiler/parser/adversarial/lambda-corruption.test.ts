// Lambda / underscore corruption. Distinguishes canonical backslash lambdas
// (with wildcard patterns permitted) from the preview-unsupported underscore-
// lambda shorthand. Neither valid nor invalid inputs may crash the parser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const VALID: Array<{ label: string; source: string }> = [
  { label: "wildcard-only lambda", source: "module M (f)\n\nf = \\_ -> 42\n" },
  { label: "wildcard as second param", source: "module M (f)\n\nf = \\x _ -> x\n" },
  { label: "single named param", source: "module M (f)\n\nf = \\x -> x + 1\n" },
  { label: "wildcard as case pattern", source: "module M (f)\n\nf x =\n  case x of\n    _ -> 0\n" },
];

for (const { label, source } of VALID) {
  test(`lambda corruption baseline: valid — ${label}`, () => {
    const outcome = parseText(source);
    assert.ok(outcome.ok, `baseline must parse; got: ${outcome.diagnostics[0]?.message}`);
  });
}

const INVALID: Array<{ label: string; source: string }> = [
  { label: "underscore-lambda addition",   source: "module M (f)\n\nf = _ + 1\n" },
  { label: "underscore-lambda field",      source: "module M (f)\n\nf = _.name\n" },
  { label: "bare underscore as body",      source: "module M (f)\n\nf = _\n" },
  { label: "bare backslash",               source: "module M (f)\n\nf = \\\n" },
  { label: "backslash with param but no arrow", source: "module M (f)\n\nf = \\x\n" },
  { label: "backslash with arrow but no body",  source: "module M (f)\n\nf = \\x ->\n" },
];

for (const { label, source } of INVALID) {
  test(`lambda corruption rejected: ${label}`, () => {
    const outcome = parseText(source);
    assert.equal(outcome.ok, false, `parser accepted malformed lambda input: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
    assert.ok(outcome.diagnostics[0]!.code.startsWith("BLACK_"));
  });
}
