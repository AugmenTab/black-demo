import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText, parseSingleDefinition } from "../../helpers/parse.js";
import type {
  CaseBranch,
  DeclDefinition,
  Expr,
  ExprCase,
  ExprInt,
  ExprLambda,
  ExprLet,
  ExprVar,
  PatternCon,
  PatternVar,
  PatternWildcard,
} from "../../../../src/compiler/ast.js";

function body(source: string): Expr {
  const { outcome } = parseSingleDefinition(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  if (decl.body === null) throw new Error("expected non-null body");
  return decl.body;
}

function bodyMulti(fnSource: string): Expr {
  // fnSource must be a full `main = ...` declaration body across multiple lines.
  const src = `module M (main)\n\n${fnSource}\n`;
  const outcome = parseText(src);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  if (decl.body === null) throw new Error("expected non-null body");
  return decl.body;
}

test("single-parameter lambda parses to ExprLambda with one PatternVar", () => {
  const e = body("\\x -> x + 1") as ExprLambda;
  assert.equal(e.kind, "ExprLambda");
  assert.equal(e.params.length, 1);
  const p = e.params[0] as PatternVar;
  assert.equal(p.kind, "PatternVar");
  assert.equal(p.name, "x");
});

test("multi-parameter lambda `\\x y -> ...` preserves both params in order", () => {
  const e = body("\\x y -> x + y") as ExprLambda;
  assert.equal(e.kind, "ExprLambda");
  assert.equal(e.params.length, 2);
  assert.equal((e.params[0] as PatternVar).name, "x");
  assert.equal((e.params[1] as PatternVar).name, "y");
});

test("lambda missing `->` is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf = \\x x + 1\n");
  assert.equal(outcome.ok, false);
});

test("lambda with no parameters `\\->` is a parse error (must have at least one param)", () => {
  const outcome = parseText("module M (f)\n\nf = \\-> 1\n");
  assert.equal(outcome.ok, false);
});

test("underscore-lambda `_ + 1` is rejected as unsupported preview shorthand", () => {
  const outcome = parseText("module M (inc)\n\ninc = _ + 1\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("underscore-field `_.name` is rejected as unsupported preview shorthand", () => {
  const outcome = parseText("module M (getName)\n\ngetName = _.name\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("wildcard-parameter lambda `\\_ -> 42` parses to ExprLambda with a PatternWildcard param", () => {
  const e = body("\\_ -> 42") as ExprLambda;
  assert.equal(e.kind, "ExprLambda");
  assert.equal(e.params.length, 1);
  const p = e.params[0] as PatternWildcard;
  assert.equal(p.kind, "PatternWildcard");
});

test("wildcard-parameter mixed with named parameter `\\x _ -> x` records both patterns in order", () => {
  const e = body("\\x _ -> x") as ExprLambda;
  assert.equal(e.kind, "ExprLambda");
  assert.equal(e.params.length, 2);
  assert.equal((e.params[0] as PatternVar).kind, "PatternVar");
  assert.equal((e.params[0] as PatternVar).name, "x");
  assert.equal((e.params[1] as PatternWildcard).kind, "PatternWildcard");
});

test("simple let-in parses to ExprLet with the expected bindings and body", () => {
  const src = "main =\n  let\n    x = 1\n    y = 2\n  in\n    x + y";
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.kind, "ExprLet");
  assert.equal(e.bindings.length, 2);
  assert.equal(e.bindings[0]!.name, "x");
  assert.equal(e.bindings[1]!.name, "y");
});

test("let-in body is parsed as its own expression, not merged into the last binding", () => {
  const src = "main =\n  let\n    x = 1\n  in\n    x + 1";
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.body.kind, "ExprInfix");
});

test("let with zero bindings is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf = let in 1\n");
  assert.equal(outcome.ok, false);
});

test("let without `in` fails with a parse error", () => {
  const src = "module M (f)\n\nf =\n  let\n    x = 1\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
});

test("nested let: inner let inside outer let body", () => {
  const src = "main =\n  let\n    x = 1\n  in\n    let\n      y = 2\n    in\n      x + y";
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.kind, "ExprLet");
  assert.equal(e.body.kind, "ExprLet");
});

test("case expression with a single branch parses to ExprCase", () => {
  const src = "main x =\n  case x of\n    None -> 0";
  const e = bodyMulti(src) as ExprCase;
  assert.equal(e.kind, "ExprCase");
  assert.equal(e.branches.length, 1);
  const p = e.branches[0]!.pattern as PatternCon;
  assert.equal(p.name, "None");
});

test("case expression with multiple branches parses each in order", () => {
  const src = "main x =\n  case x of\n    Some y -> y\n    None -> 0";
  const e = bodyMulti(src) as ExprCase;
  assert.equal(e.branches.length, 2);
  const b0 = e.branches[0] as CaseBranch;
  const b1 = e.branches[1] as CaseBranch;
  assert.equal((b0.pattern as PatternCon).name, "Some");
  assert.equal((b1.pattern as PatternCon).name, "None");
});

test("case without `of` is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf x = case x\n  Some y -> y\n");
  assert.equal(outcome.ok, false);
});

test("ordinary case branch without a leading `|` is accepted", () => {
  const src = "main x =\n  case x of\n    Point ->\n      1";
  const e = bodyMulti(src) as ExprCase;
  assert.equal(e.kind, "ExprCase");
  assert.equal(e.branches.length, 1);
  assert.equal((e.branches[0]!.pattern as PatternCon).name, "Point");
});

test("ordinary case branch with a leading `|` is rejected (declaration-style pipe is not permitted)", () => {
  const src = "module M (f)\n\nf x =\n  case x of\n    | Point ->\n        1\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
});

test("case with second branch introduced by a leading `|` is rejected", () => {
  const src = "module M (f)\n\nf x =\n  case x of\n    Foo -> 1\n    | Bar -> 2\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
});

test("case branch missing `->` is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf x =\n  case x of\n    Some y y\n");
  assert.equal(outcome.ok, false);
});

test("case-in-let: a case expression can be the RHS of a let binding", () => {
  const src = [
    "main x =",
    "  let",
    "    result =",
    "      case x of",
    "        Some y -> y",
    "        None -> 0",
    "  in",
    "    result",
  ].join("\n");
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.kind, "ExprLet");
  assert.equal(e.bindings[0]!.body.kind, "ExprCase");
});

test("let-in-case: a let expression can be the body of a case branch", () => {
  const src = [
    "main x =",
    "  case x of",
    "    Some y ->",
    "      let",
    "        z = y",
    "      in",
    "        z",
    "    None -> 0",
  ].join("\n");
  const e = bodyMulti(src) as ExprCase;
  assert.equal(e.kind, "ExprCase");
  assert.equal(e.branches[0]!.body.kind, "ExprLet");
  const noneBody = e.branches[1]!.body as ExprInt;
  assert.equal(noneBody.value, 0);
});

test("let and case are distinct AST kinds — they do not collapse into each other", () => {
  const l = bodyMulti("main =\n  let\n    x = 1\n  in\n    x") as ExprLet;
  const c = bodyMulti("main x =\n  case x of\n    _ -> 0") as ExprCase;
  assert.equal(l.kind, "ExprLet");
  assert.equal(c.kind, "ExprCase");
  assert.notEqual(l.kind, c.kind);
});

test("lambda and function application are distinct AST kinds", () => {
  const lam = body("\\x -> x");
  const app = body("f x");
  assert.equal(lam.kind, "ExprLambda");
  assert.equal(app.kind, "ExprApp");
});

test("let binding may itself be a function definition with parameters", () => {
  const src = [
    "main =",
    "  let",
    "    inc x = x + 1",
    "  in",
    "    inc 5",
  ].join("\n");
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.bindings.length, 1);
  assert.equal(e.bindings[0]!.params.length, 1);
  const p = e.bindings[0]!.params[0] as PatternVar;
  assert.equal(p.name, "x");
});

test("let body may reference bindings — Phase 2 does not check that; parsing succeeds", () => {
  // Deliberate: `z` is not defined anywhere but the parser has no reason to
  // fail. Semantic resolution belongs to Phase 3.
  const src = "main =\n  let\n    x = 1\n  in\n    z";
  const e = bodyMulti(src) as ExprLet;
  assert.equal(e.kind, "ExprLet");
  const b = e.body as ExprVar;
  assert.equal(b.name, "z");
});
