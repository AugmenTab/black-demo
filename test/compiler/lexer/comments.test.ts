import { test } from "node:test";
import assert from "node:assert/strict";
import { lexSource } from "../helpers/parse.js";

test("`-- text` produces a COMMENT_LINE token whose lexeme includes the dashes and body", () => {
  const { tokens, errors } = lexSource("-- hello world\n");
  assert.equal(errors.length, 0);
  assert.equal(tokens[0]!.kind, "COMMENT_LINE");
  assert.equal(tokens[0]!.lexeme, "-- hello world");
});

test("`-- | text` produces a COMMENT_DOC token, distinct from COMMENT_LINE", () => {
  const { tokens, errors } = lexSource("-- | documentation\n");
  assert.equal(errors.length, 0);
  assert.equal(tokens[0]!.kind, "COMMENT_DOC");
});

test("comment runs to end-of-line without consuming the newline as part of the token", () => {
  const { tokens } = lexSource("-- comment\nnext\n");
  // Sequence: COMMENT_LINE, IDENT `next`, EOF (the newline is whitespace).
  assert.equal(tokens[0]!.kind, "COMMENT_LINE");
  assert.equal(tokens[1]!.kind, "IDENT");
  assert.equal(tokens[1]!.lexeme, "next");
});

test("multiple comments and blank lines each become individual COMMENT tokens", () => {
  const { tokens, errors } = lexSource("-- one\n-- two\n-- | doc\n");
  assert.equal(errors.length, 0);
  assert.equal(tokens[0]!.kind, "COMMENT_LINE");
  assert.equal(tokens[1]!.kind, "COMMENT_LINE");
  assert.equal(tokens[2]!.kind, "COMMENT_DOC");
});

test("comment at EOF (no trailing newline) still produces a comment token followed by EOF", () => {
  const { tokens } = lexSource("-- final");
  assert.equal(tokens[0]!.kind, "COMMENT_LINE");
  assert.equal(tokens[tokens.length - 1]!.kind, "EOF");
});
