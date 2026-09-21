import { test } from "node:test";
import assert from "node:assert/strict";
import { lexSource } from "../helpers/parse.js";

function kindsOnly(source: string): string[] {
  const { tokens, errors } = lexSource(source);
  assert.equal(errors.length, 0, `unexpected lex errors: ${JSON.stringify(errors)}`);
  return tokens.map((t) => t.kind);
}

function firstToken(source: string) {
  const { tokens, errors } = lexSource(source);
  assert.equal(errors.length, 0, `unexpected lex errors: ${JSON.stringify(errors)}`);
  return tokens[0]!;
}

test("simple lowercase identifier lexes as IDENT", () => {
  const t = firstToken("carrot");
  assert.equal(t.kind, "IDENT");
  assert.equal(t.lexeme, "carrot");
});

test("camelCase identifiers lex as one IDENT", () => {
  const t = firstToken("paddlePositionX");
  assert.equal(t.kind, "IDENT");
  assert.equal(t.lexeme, "paddlePositionX");
});

test("identifier ending in '?' preserves the question mark in the lexeme", () => {
  const t = firstToken("empty?");
  assert.equal(t.kind, "IDENT");
  assert.equal(t.lexeme, "empty?");
});

test("capitalized identifier lexes as CONID, not IDENT", () => {
  const t = firstToken("Cruising");
  assert.equal(t.kind, "CONID");
  assert.equal(t.lexeme, "Cruising");
});

test("Boolean literals True/False are their own token kinds (not IDENT)", () => {
  assert.equal(firstToken("True").kind, "TRUE");
  assert.equal(firstToken("False").kind, "FALSE");
});

test("`otherwise` is an ordinary identifier, not a keyword", () => {
  const t = firstToken("otherwise");
  assert.equal(t.kind, "IDENT", "the preview treats `otherwise` as a Prelude value, not a reserved word");
  assert.equal(t.lexeme, "otherwise");
});

test("keyword prefixes on longer identifiers remain identifiers", () => {
  // `module` -> keyword. `moduleFoo` should still lex as one identifier, not
  // MODULE followed by IDENT.
  const t = firstToken("moduleFoo");
  assert.equal(t.kind, "IDENT");
  assert.equal(t.lexeme, "moduleFoo");
  const t2 = firstToken("caseValue");
  assert.equal(t2.kind, "IDENT");
  assert.equal(t2.lexeme, "caseValue");
});

test("underscore alone lexes as UNDERSCORE, but `_foo` lexes as IDENT", () => {
  assert.equal(firstToken("_").kind, "UNDERSCORE");
  assert.equal(firstToken("_helper").kind, "IDENT");
});

test("multiple identifiers separated by whitespace produce a token sequence + EOF", () => {
  const kinds = kindsOnly("f x y");
  assert.deepEqual(kinds, ["IDENT", "IDENT", "IDENT", "EOF"]);
});

test("qualified constructor path is a stream of CONID/DOT tokens (no compound token)", () => {
  const { tokens, errors } = lexSource("Game.Model.Player");
  assert.equal(errors.length, 0);
  assert.deepEqual(
    tokens.map((t) => t.kind),
    ["CONID", "DOT", "CONID", "DOT", "CONID", "EOF"],
  );
  assert.deepEqual(tokens.slice(0, 5).map((t) => t.lexeme), ["Game", ".", "Model", ".", "Player"]);
});
