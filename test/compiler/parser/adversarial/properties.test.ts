// Property tests using fast-check. These are useful for invariants that are
// tedious to enumerate but easy to state: e.g. "generated valid identifiers
// always lex to one IDENT + EOF" or "list literals preserve element count".

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";
import { lexSource, parseSingleDefinition } from "../../helpers/parse.js";

// Reserved keywords that must NOT be generated as identifiers.
const KEYWORDS = new Set([
  "module", "import", "as", "type", "let", "in", "case", "of",
  "True", "False",
]);

// Fast-check arbitraries for well-formed identifiers.
const lowerStart = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz");
const identBody = fc.stringMatching(/^[A-Za-z0-9_]*$/, { size: "small" });

function isSafeIdent(name: string): boolean {
  if (!name) return false;
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) return false;
  if (KEYWORDS.has(name)) return false;
  return true;
}

const genIdent = fc
  .tuple(lowerStart, identBody)
  .map(([h, tail]) => h + tail)
  .filter(isSafeIdent);

const genInt = fc.integer({ min: 0, max: 1_000_000 });

test("property: any generated valid identifier lexes to exactly one IDENT + EOF", () => {
  fc.assert(
    fc.property(genIdent, (name) => {
      const { tokens, errors } = lexSource(name);
      if (errors.length !== 0) return false;
      if (tokens.length !== 2) return false;
      if (tokens[0]!.kind !== "IDENT") return false;
      if (tokens[0]!.lexeme !== name) return false;
      if (tokens[1]!.kind !== "EOF") return false;
      return true;
    }),
    { numRuns: 200 },
  );
});

test("property: any generated nonneg integer lexes to exactly one INT + EOF with preserved spelling", () => {
  fc.assert(
    fc.property(genInt, (n) => {
      const spelling = String(n);
      const { tokens, errors } = lexSource(spelling);
      if (errors.length !== 0) return false;
      if (tokens.length !== 2) return false;
      if (tokens[0]!.kind !== "INT") return false;
      if (tokens[0]!.lexeme !== spelling) return false;
      if (tokens[1]!.kind !== "EOF") return false;
      return true;
    }),
    { numRuns: 200 },
  );
});

test("property: leading/trailing whitespace around a definition body does not change the AST shape", () => {
  fc.assert(
    fc.property(
      fc.tuple(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        genInt,
      ),
      ([leading, trailing, n]) => {
        const baseSrc = `${n}`;
        const paddedSrc = " ".repeat(leading) + `${n}` + " ".repeat(trailing);
        const a = parseSingleDefinition(baseSrc);
        const b = parseSingleDefinition(paddedSrc);
        if (!a.outcome.ok || !b.outcome.ok) return false;
        // Only compare kind and payload of the RHS; spans differ by design.
        const aDecl = a.outcome.module.declarations[0]!;
        const bDecl = b.outcome.module.declarations[0]!;
        if (aDecl.kind !== "DeclDefinition" || bDecl.kind !== "DeclDefinition") return false;
        return JSON.stringify(stripSpans(aDecl.body)) === JSON.stringify(stripSpans(bDecl.body));
      },
    ),
    { numRuns: 100 },
  );
});

test("property: list literal preserves element count and order", () => {
  fc.assert(
    fc.property(
      fc.array(genInt, { minLength: 0, maxLength: 20 }),
      (nums) => {
        const src = `[${nums.join(", ")}]`;
        const outcome = parseSingleDefinition(src).outcome;
        if (!outcome.ok) return false;
        const decl = outcome.module.declarations[0]!;
        if (decl.kind !== "DeclDefinition") return false;
        const body = decl.body;
        if (!body || body.kind !== "ExprList") return false;
        if (body.elements.length !== nums.length) return false;
        for (let i = 0; i < nums.length; i++) {
          const el = body.elements[i]!;
          if (el.kind !== "ExprInt") return false;
          if (el.value !== nums[i]) return false;
        }
        return true;
      },
    ),
    { numRuns: 100 },
  );
});

test("property: an identifier used as a variable body always parses to ExprVar of the same name", () => {
  fc.assert(
    fc.property(genIdent, (name) => {
      const outcome = parseSingleDefinition(name).outcome;
      if (!outcome.ok) return false;
      const decl = outcome.module.declarations[0]!;
      if (decl.kind !== "DeclDefinition") return false;
      const body = decl.body;
      if (!body || body.kind !== "ExprVar") return false;
      return body.name === name;
    }),
    { numRuns: 200 },
  );
});

// A minimal generic strip-spans that removes any key named "span".
function stripSpans(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSpans);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "span" || k === "nameSpan" || k === "fieldSpan" || k === "opSpan" || k === "pathSpan") continue;
    out[k] = stripSpans(v);
  }
  return out;
}
