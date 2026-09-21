import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";
import { stripSpans } from "../../helpers/strip-spans.js";

// Layout tests deliberately vary indentation to prove the parser handles
// significant whitespace rather than memorizing the widths in fixtures.

test("let bindings at two-space indentation and four-space indentation produce the same AST (up to spans)", () => {
  const two = [
    "module M (r)",
    "",
    "r =",
    "  let",
    "    x = 1",
    "    y = 2",
    "  in",
    "    x + y",
  ].join("\n") + "\n";
  const four = [
    "module M (r)",
    "",
    "r =",
    "    let",
    "        x = 1",
    "        y = 2",
    "    in",
    "        x + y",
  ].join("\n") + "\n";
  const a = parseText(two);
  const b = parseText(four);
  assert.ok(a.ok);
  assert.ok(b.ok);
  assert.deepEqual(stripSpans(a.module), stripSpans(b.module));
});

test("let bindings at unusual seven-space indentation still parse identically to two-space", () => {
  const two = [
    "module M (r)",
    "",
    "r =",
    "  let",
    "    x = 1",
    "    y = 2",
    "  in",
    "    x + y",
  ].join("\n") + "\n";
  const seven = [
    "module M (r)",
    "",
    "r =",
    "       let",
    "         x = 1",
    "         y = 2",
    "       in",
    "         x + y",
  ].join("\n") + "\n";
  const a = parseText(two);
  const b = parseText(seven);
  assert.ok(a.ok);
  assert.ok(b.ok);
  assert.deepEqual(stripSpans(a.module), stripSpans(b.module));
});

test("misaligned let binding (dedent past the ref column) is a layout error", () => {
  const src = [
    "module M (r)",
    "",
    "r =",
    "  let",
    "    x = 1",
    "   y = 2", // three-space column, one shallower than the ref column of 5
    "  in",
    "    x + y",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_LAYOUT_ERROR");
});

test("case branches must align at the same column; misalignment is a layout error", () => {
  const src = [
    "module M (main)",
    "",
    "main x =",
    "  case x of",
    "    Some y -> y",
    "     None -> 0", // aligned one column right — treated as continuation
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_LAYOUT_ERROR");
});

test("variant alternatives on one line are equivalent to alternatives spread across lines", () => {
  const oneLine = "module M (X (..))\n\ntype X = | A | B | C\n";
  const multi = [
    "module M (X (..))",
    "",
    "type X =",
    "  | A",
    "  | B",
    "  | C",
  ].join("\n") + "\n";
  const a = parseText(oneLine);
  const b = parseText(multi);
  assert.ok(a.ok);
  assert.ok(b.ok);
  assert.deepEqual(stripSpans(a.module), stripSpans(b.module));
});

test("guarded equation with two-space guards and four-space guards produce equivalent ASTs", () => {
  const two = [
    "module M (f)",
    "",
    "f x",
    "  | x < 0 = 0",
    "  | otherwise = x",
  ].join("\n") + "\n";
  const four = [
    "module M (f)",
    "",
    "f x",
    "    | x < 0 = 0",
    "    | otherwise = x",
  ].join("\n") + "\n";
  const a = parseText(two);
  const b = parseText(four);
  assert.ok(a.ok);
  assert.ok(b.ok);
  assert.deepEqual(stripSpans(a.module), stripSpans(b.module));
});

test("record value fields on the same line and one-per-line produce structurally identical ASTs", () => {
  const one = "module M (p)\n\np = { a = 1, b = 2, c = 3 }\n";
  const multi = [
    "module M (p)",
    "",
    "p =",
    "  { a = 1",
    "  , b = 2",
    "  , c = 3",
    "  }",
  ].join("\n") + "\n";
  const a = parseText(one);
  const b = parseText(multi);
  assert.ok(a.ok);
  assert.ok(b.ok);
  assert.deepEqual(stripSpans(a.module), stripSpans(b.module));
});

test("comments do not disturb layout; a valid file with comments interleaved still parses", () => {
  const src = [
    "-- opening banner",
    "module M (a, b)",
    "",
    "-- an import block",
    "import X (Foo)",
    "",
    "-- the first binding",
    "a = 1",
    "",
    "-- and the second",
    "b =",
    "  let",
    "    -- inside the let",
    "    x = 1",
    "  in",
    "    -- final",
    "    x",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok);
  assert.equal(outcome.module.declarations.length, 2);
});
