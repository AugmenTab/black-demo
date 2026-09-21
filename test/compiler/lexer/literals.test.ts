import { test } from "node:test";
import assert from "node:assert/strict";
import { lexSource } from "../helpers/parse.js";

function tokens(source: string) {
  const { tokens, errors } = lexSource(source);
  return { tokens, errors };
}

test("simple non-negative integers lex as INT with the correct lexeme", () => {
  for (const n of ["0", "1", "42", "999999"]) {
    const { tokens, errors } = lexSource(n);
    assert.equal(errors.length, 0, `unexpected lex errors on ${n}`);
    assert.equal(tokens[0]!.kind, "INT");
    assert.equal(tokens[0]!.lexeme, n);
  }
});

test("well-formed floats lex as FLOAT with the correct lexeme", () => {
  for (const n of ["0.0", "1.0", "3.14159", "123.456"]) {
    const { tokens, errors } = lexSource(n);
    assert.equal(errors.length, 0, `unexpected lex errors on ${n}`);
    assert.equal(tokens[0]!.kind, "FLOAT");
    assert.equal(tokens[0]!.lexeme, n);
  }
});

test("`1.` (trailing dot with no fractional digits) is a lex error", () => {
  const { errors } = tokens("1.");
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_INVALID_NUMBER");
});

test("`.5` is not a numeric literal; the '.' is a separate token", () => {
  const { tokens: toks, errors } = lexSource(".5");
  // The '.' begins a token; the numeric portion is INT '5'.
  assert.equal(errors.length, 0, "'.' plus '5' is not itself a lex error");
  assert.equal(toks[0]!.kind, "DOT");
  assert.equal(toks[1]!.kind, "INT");
  assert.equal(toks[1]!.lexeme, "5");
});

test("`1.2.3` (multiple decimal points) is a lex error", () => {
  const { errors } = tokens("1.2.3");
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_INVALID_NUMBER");
});

test("numeric literal followed immediately by identifier chars is a lex error", () => {
  const { errors } = tokens("42foo");
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_INVALID_NUMBER");
});

test("empty string lexes as one STRING token with empty content", () => {
  const { tokens: toks, errors } = lexSource('""');
  assert.equal(errors.length, 0);
  assert.equal(toks[0]!.kind, "STRING");
  assert.equal(toks[0]!.lexeme, '""');
});

test("string with escaped quotes and backslashes lexes without error", () => {
  const { tokens: toks, errors } = lexSource('"a\\"b\\\\c"');
  assert.equal(errors.length, 0);
  assert.equal(toks[0]!.kind, "STRING");
});

test("unterminated string is a lex error", () => {
  const { errors } = tokens('"hello');
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_UNTERMINATED_STRING");
});

test("a newline inside a string terminates it and reports an error", () => {
  const { errors } = tokens('"broken\nhere"');
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_UNTERMINATED_STRING");
});

test("invalid escape sequences are reported", () => {
  const { errors } = tokens('"bad \\q escape"');
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_INVALID_ESCAPE");
});

test("`-42` lexes as OP_MINUS followed by INT (unary is not fused into the literal)", () => {
  const { tokens: toks, errors } = lexSource("-42");
  assert.equal(errors.length, 0);
  assert.equal(toks[0]!.kind, "OP_MINUS");
  assert.equal(toks[1]!.kind, "INT");
  assert.equal(toks[1]!.lexeme, "42");
});
