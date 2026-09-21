import { test } from "node:test";
import assert from "node:assert/strict";
import { lexSource } from "../helpers/parse.js";

function kinds(source: string): string[] {
  const { tokens, errors } = lexSource(source);
  assert.equal(errors.length, 0, `unexpected lex errors: ${JSON.stringify(errors)}`);
  return tokens.map((t) => t.kind);
}

test("the fixed preview operator set lexes to distinct kinds", () => {
  assert.deepEqual(kinds("+"),  ["OP_PLUS",  "EOF"]);
  assert.deepEqual(kinds("-"),  ["OP_MINUS", "EOF"]);
  assert.deepEqual(kinds("*"),  ["OP_STAR",  "EOF"]);
  assert.deepEqual(kinds("/"),  ["OP_SLASH", "EOF"]);
  assert.deepEqual(kinds("=="), ["OP_EQ",    "EOF"]);
  assert.deepEqual(kinds("<"),  ["OP_LT",    "EOF"]);
  assert.deepEqual(kinds("<="), ["OP_LE",    "EOF"]);
  assert.deepEqual(kinds(">"),  ["OP_GT",    "EOF"]);
  assert.deepEqual(kinds(">="), ["OP_GE",    "EOF"]);
});

test("multi-char operators are not split into single-char runs", () => {
  // `<=` must be one token, not `<` then `=`.
  assert.deepEqual(kinds("<="), ["OP_LE", "EOF"]);
  assert.deepEqual(kinds(">="), ["OP_GE", "EOF"]);
  assert.deepEqual(kinds("=="), ["OP_EQ", "EOF"]);
});

test("`=` alone is EQUALS, distinct from OP_EQ (==)", () => {
  assert.deepEqual(kinds("="), ["EQUALS", "EOF"]);
});

test("`->` and `::` are distinct multi-char tokens, not split", () => {
  assert.deepEqual(kinds("->"), ["ARROW", "EOF"]);
  assert.deepEqual(kinds("::"), ["COLON_COLON", "EOF"]);
});

test("delimiters and structural punctuation each get their own token", () => {
  assert.deepEqual(kinds("()"), ["LPAREN", "RPAREN", "EOF"]);
  assert.deepEqual(kinds("[]"), ["LBRACK", "RBRACK", "EOF"]);
  assert.deepEqual(kinds("{}"), ["LBRACE", "RBRACE", "EOF"]);
  assert.deepEqual(kinds(","),  ["COMMA",  "EOF"]);
  assert.deepEqual(kinds("|"),  ["PIPE",   "EOF"]);
  assert.deepEqual(kinds("\\"), ["BACKSLASH", "EOF"]);
});

test("unrecognized symbolic operators lex as OP_UNKNOWN", () => {
  // `&&`, `!=`, `<>` etc. are not in the preview operator table.
  // (Note: `||` is a pair of PIPE tokens rather than a single OP_UNKNOWN,
  // because `|` is an ordinary punctuation token in Black; the parser
  // rejects `||` structurally rather than lexically.)
  // Note: `<>` is not one OP_UNKNOWN — it is OP_LT then OP_GT, both valid
  // lexer tokens. The parser rejects the combination structurally.
  for (const source of ["&&", "!=", "@@", "$$"]) {
    const { tokens } = lexSource(source);
    assert.equal(tokens[0]!.kind, "OP_UNKNOWN", `expected OP_UNKNOWN for ${source}, got ${tokens[0]!.kind}`);
  }
});

test("keywords lex to their reserved kinds", () => {
  assert.deepEqual(kinds("module"), ["MODULE", "EOF"]);
  assert.deepEqual(kinds("import"), ["IMPORT", "EOF"]);
  assert.deepEqual(kinds("type"),   ["TYPE",   "EOF"]);
  assert.deepEqual(kinds("as"),     ["AS",     "EOF"]);
  assert.deepEqual(kinds("let"),    ["LET",    "EOF"]);
  assert.deepEqual(kinds("in"),     ["IN",     "EOF"]);
  assert.deepEqual(kinds("case"),   ["CASE",   "EOF"]);
  assert.deepEqual(kinds("of"),     ["OF",     "EOF"]);
  assert.deepEqual(kinds("True"),   ["TRUE",   "EOF"]);
  assert.deepEqual(kinds("False"),  ["FALSE",  "EOF"]);
});
