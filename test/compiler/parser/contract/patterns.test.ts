import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";
import type { DeclDefinition, ExprCase, PatternCon, PatternRecord, PatternVar, PatternWildcard, PatternInt, PatternBool } from "../../../../src/compiler/ast.js";

function firstCaseInMain(source: string): ExprCase {
  const outcome = parseText(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  return decl.body as ExprCase;
}

test("variable pattern in a case branch parses as PatternVar", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    y -> y\n");
  const branch = c.branches[0]!;
  const pat = branch.pattern as PatternVar;
  assert.equal(pat.kind, "PatternVar");
  assert.equal(pat.name, "y");
});

test("wildcard pattern `_` parses as PatternWildcard", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    _ -> 0\n");
  const pat = c.branches[0]!.pattern as PatternWildcard;
  assert.equal(pat.kind, "PatternWildcard");
});

test("literal integer pattern parses as PatternInt with the correct value", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    42 -> 1\n");
  const pat = c.branches[0]!.pattern as PatternInt;
  assert.equal(pat.kind, "PatternInt");
  assert.equal(pat.value, 42);
  assert.equal(pat.text, "42");
});

test("Boolean literal pattern parses as PatternBool", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    True -> 1\n    False -> 0\n");
  const t = c.branches[0]!.pattern as PatternBool;
  const f = c.branches[1]!.pattern as PatternBool;
  assert.equal(t.kind, "PatternBool");
  assert.equal(t.value, true);
  assert.equal(f.kind, "PatternBool");
  assert.equal(f.value, false);
});

test("bare constructor `None` parses as a zero-arg PatternCon", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    None -> 0\n");
  const pat = c.branches[0]!.pattern as PatternCon;
  assert.equal(pat.kind, "PatternCon");
  assert.equal(pat.name, "None");
  assert.equal(pat.args.length, 0);
});

test("constructor pattern with a positional argument records the argument", () => {
  const c = firstCaseInMain("module M (main)\n\nmain x =\n  case x of\n    Some y -> y\n");
  const pat = c.branches[0]!.pattern as PatternCon;
  assert.equal(pat.kind, "PatternCon");
  assert.equal(pat.name, "Some");
  assert.equal(pat.args.length, 1);
  const arg = pat.args[0] as PatternVar;
  assert.equal(arg.kind, "PatternVar");
  assert.equal(arg.name, "y");
});

test("record pattern with an explicit field binding parses as PatternRecord", () => {
  const src = "module M (main)\n\nmain p =\n  case p of\n    Point { x = px, y = py } -> px\n";
  const c = firstCaseInMain(src);
  const pat = c.branches[0]!.pattern as PatternRecord;
  assert.equal(pat.kind, "PatternRecord");
  assert.equal(pat.constructor?.name, "Point");
  assert.equal(pat.fields.length, 2);
  assert.equal(pat.fields[0]!.name, "x");
  assert.equal(pat.fields[1]!.name, "y");
});

test("bare record pattern (no constructor) parses as PatternRecord with a null constructor", () => {
  const src = "module M (main)\n\nmain p =\n  case p of\n    { x = px } -> px\n";
  const c = firstCaseInMain(src);
  const pat = c.branches[0]!.pattern as PatternRecord;
  assert.equal(pat.kind, "PatternRecord");
  assert.equal(pat.constructor, null);
  assert.equal(pat.fields.length, 1);
});

test("record-punning pattern `Point { x, y }` is rejected as unsupported syntax", () => {
  const outcome = parseText("module M (main)\n\nmain p =\n  case p of\n    Point { x, y } -> x\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});
