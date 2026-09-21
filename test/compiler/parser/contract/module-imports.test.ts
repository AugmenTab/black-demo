import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

test("module header with a single export parses with a one-element export list", () => {
  const outcome = parseText("module Main (main)\n\nmain = ()\n");
  assert.ok(outcome.ok);
  assert.deepEqual(outcome.module.name, ["Main"]);
  assert.equal(outcome.module.exports.length, 1);
  assert.equal(outcome.module.exports[0]!.name, "main");
  assert.equal(outcome.module.exports[0]!.kind, "term");
});

test("module header with a dotted module name preserves the whole path", () => {
  const outcome = parseText("module Game.Model.Player (update)\n\nupdate x = x\n");
  assert.ok(outcome.ok);
  assert.deepEqual(outcome.module.name, ["Game", "Model", "Player"]);
});

test("export list can mix term names, type names, and `Type (..)`", () => {
  const outcome = parseText("module M (foo, Phase (..), PlayerId)\n\nfoo = ()\n");
  assert.ok(outcome.ok);
  const exps = outcome.module.exports;
  assert.equal(exps.length, 3);
  assert.equal(exps[0]!.name, "foo");   assert.equal(exps[0]!.kind, "term");
  assert.equal(exps[1]!.name, "Phase"); assert.equal(exps[1]!.kind, "typeAll");
  assert.equal(exps[2]!.name, "PlayerId"); assert.equal(exps[2]!.kind, "type");
});

test("empty export list `()` is legal", () => {
  const outcome = parseText("module M ()\n\nfoo = ()\n");
  assert.ok(outcome.ok);
  assert.equal(outcome.module.exports.length, 0);
});

test("bare module header without an export list is rejected (canonical Black requires explicit exports)", () => {
  const outcome = parseText("module M\n\nfoo = ()\n");
  assert.equal(outcome.ok, false);
  assert.ok(outcome.diagnostics.length > 0);
});

test("bare module header followed by signatures is rejected (no silent empty-export inference)", () => {
  const outcome = parseText("module M\n\nfoo :: Int\nfoo = 1\n");
  assert.equal(outcome.ok, false);
});

test("multi-line export list `module M\\n  ( foo\\n  )` parses", () => {
  const outcome = parseText("module M\n  ( foo\n  )\n\nfoo = ()\n");
  assert.ok(outcome.ok, `expected parse success; got: ${outcome.diagnostics[0]?.message}`);
  assert.deepEqual(outcome.module.name, ["M"]);
  assert.equal(outcome.module.exports.length, 1);
  assert.equal(outcome.module.exports[0]!.name, "foo");
});

test("module header missing the module name is a parse error", () => {
  const outcome = parseText("module (main)\n\nmain = ()\n");
  assert.equal(outcome.ok, false);
});

test("unclosed export list `module M (foo` is a parse error, not a silent success", () => {
  const outcome = parseText("module M (foo\n\nfoo = ()\n");
  assert.equal(outcome.ok, false);
});

test("trailing comma in export list is a parse error", () => {
  const outcome = parseText("module M (foo,)\n\nfoo = ()\n");
  assert.equal(outcome.ok, false);
});

test("selected import parses to a `selected` ImportDecl with the correct names", () => {
  const outcome = parseText("module M (m)\n\nimport Game.Geometry (Arena, midpoint)\n\nm = ()\n");
  assert.ok(outcome.ok);
  const imp = outcome.module.imports[0]!;
  assert.equal(imp.kind, "selected");
  assert.deepEqual(imp.path, ["Game", "Geometry"]);
  assert.equal(imp.selected?.length, 2);
  assert.equal(imp.selected![0]!.name, "Arena");
  assert.equal(imp.selected![1]!.name, "midpoint");
});

test("selected import `Type (..)` records the constructor-export marker on the name", () => {
  const outcome = parseText("module M (m)\n\nimport Game.Model (Phase (..))\n\nm = ()\n");
  assert.ok(outcome.ok);
  const imp = outcome.module.imports[0]!;
  assert.equal(imp.kind, "selected");
  assert.equal(imp.selected![0]!.name, "Phase(..)");
});

test("qualified import `import Platform.Server as Server` records the alias", () => {
  const outcome = parseText("module M (m)\n\nimport Platform.Server as Server\n\nm = ()\n");
  assert.ok(outcome.ok);
  const imp = outcome.module.imports[0]!;
  assert.equal(imp.kind, "qualified");
  assert.deepEqual(imp.path, ["Platform", "Server"]);
  assert.equal(imp.alias?.name, "Server");
});

test("selected import and qualified import produce structurally distinct AST forms", () => {
  const sel = parseText("module M (m)\n\nimport X (a)\n\nm = ()\n");
  const qual = parseText("module M (m)\n\nimport X as Y\n\nm = ()\n");
  assert.ok(sel.ok);
  assert.ok(qual.ok);
  assert.equal(sel.module.imports[0]!.kind, "selected");
  assert.equal(qual.module.imports[0]!.kind, "qualified");
});

test("hybrid `import X (a, b) as Y` is rejected as unsupported syntax", () => {
  const outcome = parseText("module M (m)\n\nimport X (a, b) as Y\n\nm = ()\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("bare `import X` (no selected list and no `as` alias) is rejected as unsupported", () => {
  const outcome = parseText("module M (m)\n\nimport X\n\nm = ()\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNSUPPORTED_SYNTAX");
});

test("multiple imports are collected in source order", () => {
  const src = [
    "module M (m)",
    "",
    "import A (foo)",
    "import B as Bee",
    "import C.D (Bar (..))",
    "",
    "m = ()",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok);
  const imps = outcome.module.imports;
  assert.equal(imps.length, 3);
  assert.equal(imps[0]!.kind, "selected");
  assert.equal(imps[1]!.kind, "qualified");
  assert.equal(imps[2]!.kind, "selected");
});
