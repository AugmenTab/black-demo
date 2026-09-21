import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";
import type { DeclDefinition, DeclSignature, DeclTypeAlias, DeclVariant, TypeCon, TypeFun } from "../../../../src/compiler/ast.js";

function firstDecl(source: string) {
  const outcome = parseText(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  return outcome.module.declarations[0]!;
}

test("type alias `type PlayerId = Text` parses to DeclTypeAlias over a bare TypeCon", () => {
  const d = firstDecl("module M (T)\n\ntype PlayerId = Text\n");
  assert.equal(d.kind, "DeclTypeAlias");
  const alias = d as DeclTypeAlias;
  assert.equal(alias.name, "PlayerId");
  const body = alias.body as TypeCon;
  assert.deepEqual(body.path, ["Text"]);
});

test("function signature parses to DeclSignature preserving arrow types", () => {
  const d = firstDecl("module M (f)\n\nmovePaddle :: Float -> Player -> Player\n");
  assert.equal(d.kind, "DeclSignature");
  const sig = d as DeclSignature;
  assert.equal(sig.name, "movePaddle");
  const outer = sig.type as TypeFun;
  assert.equal(outer.kind, "TypeFun");
  const inner = outer.to as TypeFun;
  assert.equal(inner.kind, "TypeFun");
});

test("function definition with one argument parses to DeclDefinition with one param", () => {
  const d = firstDecl("module M (f)\n\nsquare x = x * x\n") as DeclDefinition;
  assert.equal(d.kind, "DeclDefinition");
  assert.equal(d.name, "square");
  assert.equal(d.params.length, 1);
  assert.equal(d.body?.kind, "ExprInfix");
  assert.equal(d.guards, null);
});

test("function definition with multiple arguments preserves parameter order", () => {
  const d = firstDecl("module M (f)\n\nadd x y = x + y\n") as DeclDefinition;
  assert.equal(d.params.length, 2);
});

test("zero-argument binding is a legal definition", () => {
  const src = "module M (origin)\n\norigin =\n  { x = 0.0\n  , y = 0.0\n  }\n";
  const d = firstDecl(src) as DeclDefinition;
  assert.equal(d.kind, "DeclDefinition");
  assert.equal(d.params.length, 0);
  assert.equal(d.body?.kind, "ExprRecord");
});

test("definition without `=` is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf x x\n");
  assert.equal(outcome.ok, false);
});

test("signature without a type after `::` is a parse error", () => {
  const outcome = parseText("module M (f)\n\nf ::\n");
  assert.equal(outcome.ok, false);
});

test("guarded equation parses to DeclDefinition with guards, not a body", () => {
  const src = [
    "module M (clamp)",
    "",
    "clamp x",
    "  | x < 0.0 = 0.0",
    "  | x > 1.0 = 1.0",
    "  | otherwise = x",
  ].join("\n") + "\n";
  const d = firstDecl(src) as DeclDefinition;
  assert.equal(d.kind, "DeclDefinition");
  assert.equal(d.body, null);
  assert.equal(d.guards?.length, 3);
});

test("`otherwise` in a guard is parsed as an ordinary identifier, not a keyword", () => {
  const src = [
    "module M (f)",
    "",
    "f x",
    "  | otherwise = x",
  ].join("\n") + "\n";
  const d = firstDecl(src) as DeclDefinition;
  const g = d.guards![0]!;
  assert.equal(g.condition.kind, "ExprVar");
});

test("multiple top-level declarations are collected in source order", () => {
  const src = [
    "module M (a, b, c)",
    "",
    "a = 1",
    "b = 2",
    "c = 3",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok);
  const decls = outcome.module.declarations;
  assert.equal(decls.length, 3);
  assert.equal((decls[0] as DeclDefinition).name, "a");
  assert.equal((decls[1] as DeclDefinition).name, "b");
  assert.equal((decls[2] as DeclDefinition).name, "c");
});

test("top-level declaration not at column 1 is a layout error", () => {
  const outcome = parseText("module M (a)\n\n  a = 1\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_LAYOUT_ERROR");
});

test("variant declaration with three nullary alternatives parses correctly", () => {
  const src = [
    "module M (Phase (..))",
    "",
    "type Phase =",
    "  | Lobby",
    "  | Playing",
    "  | GameOver",
  ].join("\n") + "\n";
  const d = firstDecl(src) as DeclVariant;
  assert.equal(d.kind, "DeclVariant");
  assert.equal(d.name, "Phase");
  assert.equal(d.alternatives.length, 3);
  for (const alt of d.alternatives) {
    assert.equal(alt.payload.kind, "None");
  }
});

test("variant alternative with a single-type payload records the payload", () => {
  const src = [
    "module M (X (..))",
    "",
    "type X =",
    "  | Empty",
    "  | Named Text",
  ].join("\n") + "\n";
  const d = firstDecl(src) as DeclVariant;
  assert.equal(d.alternatives[0]!.payload.kind, "None");
  const p = d.alternatives[1]!.payload;
  assert.equal(p.kind, "Type");
  if (p.kind === "Type") {
    const t = p.type as TypeCon;
    assert.deepEqual(t.path, ["Text"]);
  }
});

test("variant alternative with a record payload records fields", () => {
  const src = [
    "module M (Msg (..))",
    "",
    "type Msg =",
    "  | Join",
    "  | PaddleMoved",
    "      { playerId :: Text",
    "      , position :: Float",
    "      }",
  ].join("\n") + "\n";
  const d = firstDecl(src) as DeclVariant;
  const p = d.alternatives[1]!.payload;
  assert.equal(p.kind, "Record");
  if (p.kind === "Record") {
    assert.equal(p.fields.length, 2);
    assert.equal(p.fields[0]!.name, "playerId");
  }
});

test("missing leading pipe on the first variant alternative is a parse error", () => {
  const src = [
    "module M (X (..))",
    "",
    "type X =",
    "  Lobby",
    "  | Playing",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
});

test("angle-bracket variant syntax `<A|B>` is rejected", () => {
  const outcome = parseText("module M (X (..))\n\ntype X = <Lobby | Playing>\n");
  assert.equal(outcome.ok, false);
});

test("single-line variant `type X = | A | B` parses when written on one line", () => {
  const outcome = parseText("module M (X (..))\n\ntype X = | A | B\n");
  assert.ok(outcome.ok);
  const d = outcome.module.declarations[0] as DeclVariant;
  assert.equal(d.alternatives.length, 2);
});
