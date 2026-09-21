import { test } from "node:test";
import assert from "node:assert/strict";
import { lexSource } from "../helpers/parse.js";

test("stray non-ASCII/unassigned character reports BLACK_LEX_INVALID_CHARACTER", () => {
  const { errors } = lexSource("`");
  assert.ok(errors.length > 0);
  assert.equal(errors[0]!.code, "BLACK_LEX_INVALID_CHARACTER");
});

test("lexer always emits a trailing EOF token even on empty input", () => {
  const { tokens, errors } = lexSource("");
  assert.equal(errors.length, 0);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0]!.kind, "EOF");
});

test("lexer never produces zero-width infinite loops on invalid characters", () => {
  // Emit a run of otherwise-uninterpretable characters. The scanner should
  // consume them and terminate — no timeout should trigger.
  const source = "`~;".repeat(10);
  const { tokens, errors } = lexSource(source);
  // We tolerate any number of errors, but the token stream MUST end with EOF.
  assert.ok(errors.length > 0);
  assert.equal(tokens[tokens.length - 1]!.kind, "EOF");
});
