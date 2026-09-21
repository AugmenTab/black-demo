import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText, parseSingleDefinition } from "../../helpers/parse.js";
import type {
  DeclDefinition,
  Expr,
  ExprApp,
  ExprBool,
  ExprCon,
  ExprField,
  ExprFloat,
  ExprInt,
  ExprList,
  ExprRecord,
  ExprRecordUpdate,
  ExprString,
  ExprVar,
} from "../../../../src/compiler/ast.js";

function body(source: string): Expr {
  const { outcome } = parseSingleDefinition(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  if (decl.body === null) throw new Error("expected non-null body");
  return decl.body;
}

test("integer literal parses as ExprInt preserving value and lexeme", () => {
  const e = body("42") as ExprInt;
  assert.equal(e.kind, "ExprInt");
  assert.equal(e.value, 42);
  assert.equal(e.text, "42");
});

test("float literal parses as ExprFloat preserving value and lexeme", () => {
  const e = body("3.14159") as ExprFloat;
  assert.equal(e.kind, "ExprFloat");
  assert.equal(e.value, 3.14159);
  assert.equal(e.text, "3.14159");
});

test("string literal parses as ExprString decoding escape sequences", () => {
  const e = body('"hello"') as ExprString;
  assert.equal(e.kind, "ExprString");
  assert.equal(e.value, "hello");
});

test("string with `\\n` escape decodes to a real newline in the AST value", () => {
  const e = body('"a\\nb"') as ExprString;
  assert.equal(e.kind, "ExprString");
  assert.equal(e.value, "a\nb");
});

test("Boolean literals True/False parse as ExprBool", () => {
  const t = body("True") as ExprBool;
  const f = body("False") as ExprBool;
  assert.equal(t.kind, "ExprBool");
  assert.equal(t.value, true);
  assert.equal(f.value, false);
});

test("bare identifier parses as ExprVar", () => {
  const e = body("carrot") as ExprVar;
  assert.equal(e.kind, "ExprVar");
  assert.equal(e.name, "carrot");
});

test("bare capitalized identifier parses as ExprCon", () => {
  const e = body("None") as ExprCon;
  assert.equal(e.kind, "ExprCon");
  assert.equal(e.name, "None");
});

test("`()` in expression position parses as an ExprUnit node (canonical unit value)", () => {
  const e = body("()");
  assert.equal(e.kind, "ExprUnit");
});

test("`(x)` in expression position parses as ExprParen wrapping the inner expression, distinct from ExprUnit", () => {
  const e = body("(x)");
  assert.equal(e.kind, "ExprParen");
});

test("record construction produces ExprRecord with the named fields", () => {
  const src = "module M (origin)\n\norigin =\n  { x = 0.0\n  , y = 0.0\n  }\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok);
  const decl = outcome.module.declarations[0] as DeclDefinition;
  const rec = decl.body as ExprRecord;
  assert.equal(rec.kind, "ExprRecord");
  assert.equal(rec.fields.length, 2);
  assert.equal(rec.fields[0]!.name, "x");
  assert.equal(rec.fields[1]!.name, "y");
});

test("empty record `{}` parses as ExprRecord with no fields", () => {
  const e = body("{}") as ExprRecord;
  assert.equal(e.kind, "ExprRecord");
  assert.equal(e.fields.length, 0);
});

test("record punning `{ name, lives }` in an expression is rejected as unsupported", () => {
  const outcome = parseText("module M (p)\n\np =\n  { name, lives }\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("field access `player.lives` parses as ExprField over an ExprVar", () => {
  const e = body("player.lives") as ExprField;
  assert.equal(e.kind, "ExprField");
  assert.equal(e.field, "lives");
  const rec = e.record as ExprVar;
  assert.equal(rec.kind, "ExprVar");
  assert.equal(rec.name, "player");
});

test("chained field access `player.position.x` groups on the left", () => {
  const e = body("player.position.x") as ExprField;
  assert.equal(e.kind, "ExprField");
  assert.equal(e.field, "x");
  const inner = e.record as ExprField;
  assert.equal(inner.kind, "ExprField");
  assert.equal(inner.field, "position");
  const root = inner.record as ExprVar;
  assert.equal(root.name, "player");
});

test("record update `player { lives = 5 }` parses distinctly from record construction", () => {
  const e = body("player { lives = 5 }") as ExprRecordUpdate;
  assert.equal(e.kind, "ExprRecordUpdate");
  const rec = e.record as ExprVar;
  assert.equal(rec.name, "player");
  assert.equal(e.fields.length, 1);
  assert.equal(e.fields[0]!.name, "lives");
});

test("record construction and record update produce distinct AST kinds", () => {
  const ctor = body("{ x = 1 }") as ExprRecord;
  const upd = body("player { x = 1 }") as ExprRecordUpdate;
  assert.equal(ctor.kind, "ExprRecord");
  assert.equal(upd.kind, "ExprRecordUpdate");
  assert.notEqual(ctor.kind, upd.kind);
});

test("empty list literal `[]` parses as ExprList with no elements", () => {
  const e = body("[]") as ExprList;
  assert.equal(e.kind, "ExprList");
  assert.equal(e.elements.length, 0);
});

test("list literal preserves element order and count", () => {
  const e = body("[1, 2, 3]") as ExprList;
  assert.equal(e.kind, "ExprList");
  assert.equal(e.elements.length, 3);
  assert.equal((e.elements[0] as ExprInt).value, 1);
  assert.equal((e.elements[1] as ExprInt).value, 2);
  assert.equal((e.elements[2] as ExprInt).value, 3);
});

test("list literal accepts arbitrary expressions as elements, not only literals", () => {
  const e = body("[f x, g y]") as ExprList;
  assert.equal(e.kind, "ExprList");
  assert.equal(e.elements.length, 2);
  assert.equal(e.elements[0]!.kind, "ExprApp");
  assert.equal(e.elements[1]!.kind, "ExprApp");
});

test("function application is left-associative: `f x y` == `(f x) y`", () => {
  const e = body("f x y") as ExprApp;
  assert.equal(e.kind, "ExprApp");
  const outerArg = e.arg as ExprVar;
  assert.equal(outerArg.kind, "ExprVar");
  assert.equal(outerArg.name, "y");
  const inner = e.fn as ExprApp;
  assert.equal(inner.kind, "ExprApp");
  const innerFn = inner.fn as ExprVar;
  const innerArg = inner.arg as ExprVar;
  assert.equal(innerFn.name, "f");
  assert.equal(innerArg.name, "x");
});

test("three-arg application `map update players` nests as `((map update) players)`", () => {
  const e = body("map update players") as ExprApp;
  const players = e.arg as ExprVar;
  assert.equal(players.name, "players");
  const inner = e.fn as ExprApp;
  const map = inner.fn as ExprVar;
  const update = inner.arg as ExprVar;
  assert.equal(map.name, "map");
  assert.equal(update.name, "update");
});

test("parenthesized expression produces an ExprParen wrapper", () => {
  const e = body("(x)");
  assert.equal(e.kind, "ExprParen");
});
