import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText, parseSingleDefinition } from "../../helpers/parse.js";
import type { DeclDefinition, Expr, ExprInfix, ExprInt, ExprParen, ExprVar } from "../../../../src/compiler/ast.js";

function body(source: string): Expr {
  const { outcome } = parseSingleDefinition(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  if (decl.body === null) throw new Error("expected non-null body");
  return decl.body;
}

test("multiplication binds tighter than addition: `a + b * c` groups as `a + (b * c)`", () => {
  const e = body("a + b * c") as ExprInfix;
  assert.equal(e.kind, "ExprInfix");
  assert.equal(e.op, "+");
  const left = e.left as ExprVar;
  assert.equal(left.name, "a");
  const right = e.right as ExprInfix;
  assert.equal(right.kind, "ExprInfix");
  assert.equal(right.op, "*");
});

test("parentheses override precedence: `(a + b) * c` groups the addition first", () => {
  const e = body("(a + b) * c") as ExprInfix;
  assert.equal(e.op, "*");
  const left = e.left as ExprParen;
  assert.equal(left.kind, "ExprParen");
  const inner = left.inner as ExprInfix;
  assert.equal(inner.kind, "ExprInfix");
  assert.equal(inner.op, "+");
});

test("addition is left-associative: `a - b - c` groups as `(a - b) - c`", () => {
  const e = body("a - b - c") as ExprInfix;
  assert.equal(e.op, "-");
  const right = e.right as ExprVar;
  assert.equal(right.name, "c", "right operand of the outer node is the rightmost operand");
  const left = e.left as ExprInfix;
  assert.equal(left.kind, "ExprInfix");
  assert.equal(left.op, "-");
});

test("multiplication is left-associative: `a / b / c` groups as `(a / b) / c`", () => {
  const e = body("a / b / c") as ExprInfix;
  assert.equal(e.op, "/");
  const right = e.right as ExprVar;
  assert.equal(right.name, "c");
  const left = e.left as ExprInfix;
  assert.equal(left.op, "/");
});

test("comparison operators are non-associative: `a < b < c` is a parse error", () => {
  const outcome = parseText("module M (x)\n\nx = a < b < c\n");
  assert.equal(outcome.ok, false);
  const d = outcome.diagnostics[0]!;
  assert.equal(d.code, "BLACK_PARSE_UNEXPECTED_TOKEN");
  assert.match(d.message, /non-associative/);
});

test("equality is non-associative and cannot chain: `a == b == c` errors", () => {
  const outcome = parseText("module M (x)\n\nx = a == b == c\n");
  assert.equal(outcome.ok, false);
  assert.match(outcome.diagnostics[0]!.message, /non-associative/);
});

test("comparisons bind less tightly than arithmetic: `a + b < c * d` splits at `<`", () => {
  const e = body("a + b < c * d") as ExprInfix;
  assert.equal(e.op, "<");
  const left = e.left as ExprInfix;
  const right = e.right as ExprInfix;
  assert.equal(left.op, "+");
  assert.equal(right.op, "*");
});

test("application binds tighter than infix: `f x + g y` groups as `(f x) + (g y)`", () => {
  const e = body("f x + g y") as ExprInfix;
  assert.equal(e.op, "+");
  assert.equal(e.left.kind, "ExprApp");
  assert.equal(e.right.kind, "ExprApp");
});

test("unary minus is not supported: `x = -1` fails with an unsupported diagnostic", () => {
  const outcome = parseText("module M (x)\n\nx = -1\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("`0 - x` is a valid subtraction from zero (a workaround for lack of unary minus)", () => {
  const e = body("0 - x") as ExprInfix;
  assert.equal(e.op, "-");
  const left = e.left as ExprInt;
  assert.equal(left.value, 0);
});

test("infix `+ - * / == < <= > >=` all parse into an ExprInfix with the expected op field", () => {
  for (const op of ["+", "-", "*", "/", "==", "<", "<=", ">", ">="]) {
    const e = body(`a ${op} b`) as ExprInfix;
    assert.equal(e.kind, "ExprInfix", `expected ExprInfix for op ${op}`);
    assert.equal(e.op, op, `expected op ${op} in AST`);
  }
});
