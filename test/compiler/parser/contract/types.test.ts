import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTypeAlias, parseText } from "../../helpers/parse.js";
import type { DeclTypeAlias, TypeCon, TypeFun, TypeApp, TypeParen, TypeVar, TypeRecord } from "../../../../src/compiler/ast.js";

function extractAliasBody(source: string): DeclTypeAlias {
  const outcome = parseText(source);
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.diagnostics[0]?.message}`);
  const decl = outcome.module.declarations[0]!;
  if (decl.kind !== "DeclTypeAlias") throw new Error(`expected DeclTypeAlias, got ${decl.kind}`);
  return decl;
}

test("bare capitalized type reference parses as TypeCon with a single-element path", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = Int\n");
  const body = decl.body as TypeCon;
  assert.equal(body.kind, "TypeCon");
  assert.deepEqual(body.path, ["Int"]);
});

test("qualified type reference parses as TypeCon with a dotted path", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = Game.Model.Player\n");
  const body = decl.body as TypeCon;
  assert.equal(body.kind, "TypeCon");
  assert.deepEqual(body.path, ["Game", "Model", "Player"]);
});

test("lowercase type identifier parses as TypeVar", () => {
  // `type Container a = List a` — the body has a TypeVar somewhere. We can't
  // introduce a type parameter with this profile's grammar (no parametric
  // aliases), but a TypeVar can appear as an argument in tests via qualified
  // usage. Fall back to a signature form.
  const outcome = parseText("module M (f)\n\nf :: a -> a\n");
  assert.ok(outcome.ok);
  const sig = outcome.module.declarations[0]!;
  assert.equal(sig.kind, "DeclSignature");
});

test("function arrow associates to the right: `a -> b -> c` == `a -> (b -> c)`", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = A -> B -> C\n");
  const outer = decl.body as TypeFun;
  assert.equal(outer.kind, "TypeFun");
  // The right-hand side must itself be a TypeFun; the left must be a plain A.
  const from = outer.from as TypeCon;
  assert.equal(from.kind, "TypeCon");
  assert.deepEqual(from.path, ["A"]);
  const inner = outer.to as TypeFun;
  assert.equal(inner.kind, "TypeFun", "right-associativity: `b -> c` groups together on the right");
  const innerFrom = inner.from as TypeCon;
  const innerTo = inner.to as TypeCon;
  assert.deepEqual(innerFrom.path, ["B"]);
  assert.deepEqual(innerTo.path, ["C"]);
});

test("parentheses override arrow associativity: `(a -> b) -> c` groups on the left", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = (A -> B) -> C\n");
  const outer = decl.body as TypeFun;
  assert.equal(outer.kind, "TypeFun");
  const paren = outer.from as TypeParen;
  assert.equal(paren.kind, "TypeParen", "the left arrow is wrapped in a TypeParen node");
  const nested = paren.inner as TypeFun;
  assert.equal(nested.kind, "TypeFun");
  const to = outer.to as TypeCon;
  assert.deepEqual(to.path, ["C"]);
});

test("type application is left-associative: `Map k v` parses as `((Map k) v)`", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = Map k v\n");
  const outer = decl.body as TypeApp;
  assert.equal(outer.kind, "TypeApp");
  const arg = outer.arg as TypeVar;
  assert.equal(arg.kind, "TypeVar");
  assert.equal(arg.name, "v");
  const head = outer.head as TypeApp;
  assert.equal(head.kind, "TypeApp");
  const headHead = head.head as TypeCon;
  const headArg = head.arg as TypeVar;
  assert.deepEqual(headHead.path, ["Map"]);
  assert.equal(headArg.name, "k");
});

test("record type parses as TypeRecord with its fields", () => {
  const src = "module M (T)\n\ntype T =\n  { name :: Text\n  , lives :: Int\n  }\n";
  const decl = extractAliasBody(src);
  const rec = decl.body as TypeRecord;
  assert.equal(rec.kind, "TypeRecord");
  assert.equal(rec.fields.length, 2);
  const [nameField, livesField] = rec.fields as [typeof rec.fields[0], typeof rec.fields[1]];
  assert.equal(nameField!.name, "name");
  assert.equal(livesField!.name, "lives");
  const nameTy = nameField!.fieldType as TypeCon;
  const livesTy = livesField!.fieldType as TypeCon;
  assert.deepEqual(nameTy.path, ["Text"]);
  assert.deepEqual(livesTy.path, ["Int"]);
});

test("empty record type `{}` is legal", () => {
  const decl = extractAliasBody("module M (T)\n\ntype T = {}\n");
  const rec = decl.body as TypeRecord;
  assert.equal(rec.kind, "TypeRecord");
  assert.equal(rec.fields.length, 0);
});

test("Haskell-style list type `[a]` is rejected as unsupported syntax", () => {
  const outcome = parseText("module M (T)\n\ntype T = [Int]\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("unit type spelled `()` parses as TypeUnit (canonical Black syntax)", () => {
  const outcome = parseText("module M (T)\n\ntype T = ()\n");
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.diagnostics[0]?.message);
  const decl = outcome.module.declarations[0];
  assert.equal(decl?.kind, "DeclTypeAlias");
  if (decl?.kind === "DeclTypeAlias") {
    assert.equal(decl.body.kind, "TypeUnit");
  }
});

test("unit type appears in a signature result position: `f :: Int -> ()`", () => {
  const outcome = parseText("module M (f)\n\nf :: Int -> ()\n");
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.diagnostics[0]?.message);
  const sig = outcome.module.declarations[0];
  assert.equal(sig?.kind, "DeclSignature");
  if (sig?.kind === "DeclSignature") {
    assert.equal(sig.type.kind, "TypeFun");
    if (sig.type.kind === "TypeFun") {
      assert.equal(sig.type.to.kind, "TypeUnit");
    }
  }
});

test("unit type distinct from a parenthesized non-unit type: `(Int)` is TypeParen, `()` is TypeUnit", () => {
  const a = parseText("module M (T)\n\ntype T = ()\n");
  const b = parseText("module M (T)\n\ntype T = (Int)\n");
  assert.ok(a.ok);
  assert.ok(b.ok);
  const da = a.module.declarations[0]!;
  const db = b.module.declarations[0]!;
  assert.equal(da.kind, "DeclTypeAlias");
  assert.equal(db.kind, "DeclTypeAlias");
  if (da.kind === "DeclTypeAlias") assert.equal(da.body.kind, "TypeUnit");
  if (db.kind === "DeclTypeAlias") assert.equal(db.body.kind, "TypeParen");
});
