import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText, lexSource } from "./helpers/parse.js";
import type {
  DeclDefinition,
  DeclSignature,
  DeclVariant,
  ExprInfix,
  ExprInt,
  ExprVar,
} from "../../src/compiler/ast.js";

// Span conventions locked in DEMO_PROFILE / phase-02:
//   line   1-based
//   column 1-based
//   offset 0-based (UTF-16 code-unit)
//   end    exclusive

test("token span for a single identifier covers exactly its characters", () => {
  const { tokens } = lexSource("carrot");
  const t = tokens[0]!;
  assert.equal(t.span.start.line, 1);
  assert.equal(t.span.start.column, 1);
  assert.equal(t.span.start.offset, 0);
  assert.equal(t.span.end.line, 1);
  assert.equal(t.span.end.column, 7, "column at end is one past the last character (1-based, exclusive end)");
  assert.equal(t.span.end.offset, 6);
});

test("token span for a token on line 2 records line=2 and column relative to its line", () => {
  const { tokens } = lexSource("first\nsecond");
  // Skip 'first' + newline: 'second' begins on line 2 column 1.
  const t = tokens[1]!;
  assert.equal(t.lexeme, "second");
  assert.equal(t.span.start.line, 2);
  assert.equal(t.span.start.column, 1);
});

test("column advances across whitespace", () => {
  const { tokens } = lexSource("f    x");
  const x = tokens[1]!;
  assert.equal(x.lexeme, "x");
  assert.equal(x.span.start.column, 6);
});

test("EOF token has an empty span (start == end) at end of input", () => {
  const { tokens } = lexSource("abc");
  const eof = tokens[tokens.length - 1]!;
  assert.equal(eof.kind, "EOF");
  assert.equal(eof.span.start.offset, eof.span.end.offset);
  assert.equal(eof.span.start.offset, 3);
});

test("a Boolean literal spans exactly its keyword characters", () => {
  const { tokens } = lexSource("True");
  const t = tokens[0]!;
  assert.equal(t.kind, "TRUE");
  assert.equal(t.span.start.column, 1);
  assert.equal(t.span.end.column, 5);
});

test("comments before code do not corrupt the span of the following identifier", () => {
  const { tokens } = lexSource("-- prelude comment\nfoo");
  // COMMENT_LINE then IDENT `foo` on line 2 column 1.
  const foo = tokens[1]!;
  assert.equal(foo.lexeme, "foo");
  assert.equal(foo.span.start.line, 2);
  assert.equal(foo.span.start.column, 1);
});

test("definition span covers its full RHS across multiple lines", () => {
  const src = "module M (foo)\n\nfoo x =\n  x + 1\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const foo = result.module.declarations[0] as DeclDefinition;
  assert.equal(foo.kind, "DeclDefinition");
  // The definition span must start at the name and end at the end of the RHS.
  assert.equal(foo.span.start.line, 3);
  assert.equal(foo.span.start.column, 1);
  assert.equal(foo.span.end.line, 4);
  // The `1` sits at column 7 on line 4; exclusive end is column 8.
  assert.equal(foo.span.end.column, 8);
});

test("infix expression span covers its whole operand-op-operand extent", () => {
  const src = "module M (foo)\n\nfoo x =\n  x + 1\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const foo = result.module.declarations[0] as DeclDefinition;
  const body = foo.body as ExprInfix;
  assert.equal(body.kind, "ExprInfix");
  assert.equal(body.op, "+");
  // The infix span should start where the LHS begins and end where the RHS
  // ends: line 4 columns 3..8 (inclusive-start, exclusive-end).
  assert.equal(body.span.start.line, 4);
  assert.equal(body.span.start.column, 3);
  assert.equal(body.span.end.line, 4);
  assert.equal(body.span.end.column, 8);
});

test("infix operand spans point at their individual tokens, not the whole expression", () => {
  const src = "module M (foo)\n\nfoo x =\n  x + 1\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const foo = result.module.declarations[0] as DeclDefinition;
  const body = foo.body as ExprInfix;
  const left = body.left as ExprVar;
  const right = body.right as ExprInt;
  assert.equal(left.kind, "ExprVar");
  assert.equal(right.kind, "ExprInt");
  assert.equal(left.span.start.column, 3);
  assert.equal(left.span.end.column, 4);
  assert.equal(right.span.start.column, 7);
  assert.equal(right.span.end.column, 8);
});

test("operator token span points at the operator itself, not surrounding operands", () => {
  const src = "module M (foo)\n\nfoo x =\n  x + 1\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const foo = result.module.declarations[0] as DeclDefinition;
  const body = foo.body as ExprInfix;
  assert.equal(body.opSpan.start.line, 4);
  assert.equal(body.opSpan.start.column, 5);
  assert.equal(body.opSpan.end.column, 6);
});

test("signature declaration span covers `name :: Type` including the type", () => {
  const src = "module M (f)\n\nf :: Int -> Int\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const sig = result.module.declarations[0] as DeclSignature;
  assert.equal(sig.kind, "DeclSignature");
  assert.equal(sig.span.start.column, 1);
  assert.equal(sig.span.end.column, 16, "the last char of the type is at column 15, exclusive end is 16");
});

test("variant declaration span covers `type Name = | Alt | Alt | Alt`", () => {
  const src = "module M (T (..))\n\ntype T =\n  | A\n  | B\n  | C\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const v = result.module.declarations[0] as DeclVariant;
  assert.equal(v.kind, "DeclVariant");
  assert.equal(v.alternatives.length, 3);
  assert.equal(v.span.start.line, 3);
  assert.equal(v.span.end.line, 6);
});

test("nested nodes' spans lie inside their parents", () => {
  const src = "module M (foo)\n\nfoo x =\n  x + 1\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const foo = result.module.declarations[0] as DeclDefinition;
  const body = foo.body as ExprInfix;
  // LHS span is inside the infix span; infix span is inside the decl span.
  const inside = (outer: { start: { offset: number }; end: { offset: number } }, inner: { start: { offset: number }; end: { offset: number } }) =>
    outer.start.offset <= inner.start.offset && outer.end.offset >= inner.end.offset;
  assert.ok(inside(body.span, body.left.span));
  assert.ok(inside(body.span, body.right.span));
  assert.ok(inside(body.span, body.opSpan));
  assert.ok(inside(foo.span, body.span));
});

test("unit value span covers both parentheses: `main = ()` → ExprUnit span from `(` to just past `)`", () => {
  const src = "module M (main)\n\nmain =\n  ()\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const decl = result.module.declarations[0] as DeclDefinition;
  const body = decl.body!;
  assert.equal(body.kind, "ExprUnit");
  assert.equal(body.span.end.offset - body.span.start.offset, 2, "unit value span covers exactly `()`");
});

test("unit type span covers both parentheses in a signature: `f :: ()`", () => {
  const src = "module M (f)\n\nf :: ()\n";
  const result = parseText(src);
  assert.ok(result.ok);
  const sig = result.module.declarations[0] as DeclSignature;
  const t = sig.type;
  assert.equal(t.kind, "TypeUnit");
  assert.equal(t.span.end.offset - t.span.start.offset, 2);
});
