// Fuzz smoke test. Random inputs must never crash the parser (or hang).
// Correctness is not asserted — only "does not throw and terminates promptly".

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";
import { parseText, lexSource } from "../../helpers/parse.js";

// A grab-bag of ASCII characters weighted toward tokens likely to stress
// parser paths. We include control chars and non-ASCII sparingly to catch
// invalid-character handling.
const ALPHABET = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..." \n\t",
  ..."()[]{}|,;.:=+-*/<>!\\@#$%^&?~",
  ..."\"'",
];

const genFuzz = fc.string({ minLength: 0, maxLength: 400, unit: fc.constantFrom(...ALPHABET) });

test("fuzz: random inputs never throw from parseText", () => {
  fc.assert(
    fc.property(genFuzz, (source) => {
      const t0 = Date.now();
      let outcome;
      try {
        outcome = parseText(source);
      } catch (err) {
        throw new Error(`parser threw on fuzz input ${JSON.stringify(source)}: ${(err as Error).message}`);
      }
      const elapsed = Date.now() - t0;
      if (elapsed > 1000) {
        throw new Error(`parser took ${elapsed}ms on fuzz input ${JSON.stringify(source)}`);
      }
      // We do not assert ok/!ok — either is acceptable. The point is that
      // the parser terminates without crashing and either produces a
      // diagnostic set or an AST plus (possibly empty) diagnostics.
      assert.ok(Array.isArray(outcome.diagnostics));
      return true;
    }),
    { numRuns: 500 },
  );
});

test("fuzz: random inputs never throw from lexSource", () => {
  fc.assert(
    fc.property(genFuzz, (source) => {
      const t0 = Date.now();
      let result;
      try {
        result = lexSource(source);
      } catch (err) {
        throw new Error(`lexer threw on fuzz input ${JSON.stringify(source)}: ${(err as Error).message}`);
      }
      const elapsed = Date.now() - t0;
      if (elapsed > 1000) {
        throw new Error(`lexer took ${elapsed}ms on fuzz input ${JSON.stringify(source)}`);
      }
      assert.ok(Array.isArray(result.tokens));
      assert.ok(Array.isArray(result.errors));
      // Every lex result must at minimum end in EOF.
      assert.equal(result.tokens[result.tokens.length - 1]?.kind, "EOF");
      return true;
    }),
    { numRuns: 500 },
  );
});
