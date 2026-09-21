// Parser termination tests. Pathological repeated-token inputs must
// terminate promptly with a diagnostic — no infinite recursive-descent loops,
// no zero-width retry loops. We enforce this with a wall-clock timeout in
// addition to a functional-correctness check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

const PATHOLOGICAL: Array<{ label: string; source: string }> = [
  { label: "repeated pipes", source: "module M (x)\n\nx = " + "|".repeat(200) + "\n" },
  { label: "repeated open parens", source: "module M (x)\n\nx = " + "(".repeat(200) + "\n" },
  { label: "repeated open braces", source: "module M (x)\n\nx = " + "{".repeat(200) + "\n" },
  { label: "repeated open brackets", source: "module M (x)\n\nx = " + "[".repeat(200) + "\n" },
  { label: "repeated arrows", source: "module M (x)\n\nx = " + "-> ".repeat(100) + "\n" },
  { label: "repeated commas", source: "module M (x)\n\nx = [" + ",".repeat(200) + "]\n" },
  { label: "repeated colon-colon", source: "module M (f)\n\nf " + ":: ".repeat(100) + "\n" },
  { label: "repeated equals", source: "module M (x)\n\nx " + "= ".repeat(100) + "\n" },
  { label: "long invalid-char run", source: "module M (x)\n\nx = " + "@".repeat(200) + "\n" },
  { label: "many unbalanced braces then eof", source: "module M (x)\n\nx = { a = 1" + " { b = 2".repeat(50) + "\n" },
  { label: "many nested unbalanced parens", source: "module M (x)\n\nx = " + "(".repeat(50) + "1" + "\n" },
];

for (const { label, source } of PATHOLOGICAL) {
  test(`terminates promptly on pathological input: ${label}`, () => {
    const t0 = Date.now();
    const outcome = parseText(source);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 2000, `parser took ${elapsed}ms for pathological input: ${label} (possible non-termination)`);
    // Every pathological input must be rejected. Success would mean the
    // parser accepted syntactically-impossible source.
    assert.equal(outcome.ok, false, `parser incorrectly accepted pathological input: ${label}`);
    assert.ok(outcome.diagnostics.length > 0, "at least one diagnostic must be reported");
  });
}

test("very long valid module still parses in a reasonable time", () => {
  // 500 trivial declarations should not blow up parse time.
  const decls: string[] = [];
  for (let i = 0; i < 500; i++) {
    decls.push(`f${i} = ${i}`);
  }
  const src = "module M ()\n\n" + decls.join("\n") + "\n";
  const t0 = Date.now();
  const outcome = parseText(src);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `500-decl module took ${elapsed}ms (perf regression?)`);
  assert.ok(outcome.ok, `500-decl module should parse; got: ${outcome.diagnostics[0]?.message}`);
  assert.equal(outcome.module.declarations.length, 500);
});
