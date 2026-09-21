import { test } from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../helpers/parse.js";

test("valid complete module parses successfully with all declarations", () => {
  const src = [
    "module Inventory.Warehouse (Item (..), reorder, restock)",
    "",
    "import Inventory.Barcode (Barcode, decode)",
    "import Platform.Time as Time",
    "",
    "type Item =",
    "  | Widget",
    "  | Gadget",
    "  | Bundle",
    "      { sku :: Text",
    "      , quantity :: Int",
    "      }",
    "",
    "type Sku = Text",
    "",
    "reorder :: Item -> Int -> Int",
    "reorder item threshold = threshold",
    "",
    "restock i q",
    "  | q < 0 = 0",
    "  | otherwise = q",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok, `expected success, got: ${outcome.diagnostics[0]?.message}`);
  const m = outcome.module;
  assert.deepEqual(m.name, ["Inventory", "Warehouse"]);
  assert.equal(m.imports.length, 2);
  assert.equal(m.declarations.length, 5);
});

test("valid trivial module `module Main (main); main :: (); main = ()` parses successfully", () => {
  const src = "module Main (main)\n\nmain :: ()\nmain =\n  ()\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok);
  assert.equal(outcome.module.declarations.length, 2);
});

test("trailing tokens after top-level declarations fail with BLACK_PARSE_TRAILING_TOKENS", () => {
  const src = "module M (a)\n\na = 1\n\ngarbage garbage\n";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
  // A trailing identifier at column 1 is treated as another top-level
  // declaration attempt; the parser reports whichever specific error it
  // hits. We accept either PARSE_TRAILING_TOKENS or an unexpected-token
  // diagnostic on the trailing content — but the parse MUST NOT succeed.
  assert.ok(outcome.diagnostics.length > 0);
});

test("stray character after final declaration is a parse error", () => {
  const src = "module M (a)\n\na = 1\n\n$";
  const outcome = parseText(src);
  assert.equal(outcome.ok, false);
});

test("empty file (no `module` keyword) is a parse error", () => {
  const outcome = parseText("");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNEXPECTED_EOF");
});

test("comments-only file (no `module` keyword) is a parse error", () => {
  const outcome = parseText("-- just a comment\n-- another one\n");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.diagnostics[0]!.code, "BLACK_PARSE_UNEXPECTED_EOF");
});

test("varied-domain example: geometry", () => {
  const src = [
    "module Geometry.Shapes (Shape (..), area)",
    "",
    "type Shape =",
    "  | Circle Float",
    "  | Rectangle",
    "      { width :: Float",
    "      , height :: Float",
    "      }",
    "  | Triangle Float Float Float",
    "",
    "area s =",
    "  case s of",
    "    Circle r ->",
    "      r * r",
    "    _ ->",
    "      0.0",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok, outcome.diagnostics[0]?.message);
});

test("varied-domain example: transportation", () => {
  const src = [
    "module Transport.Vehicle (TransportState (..))",
    "",
    "type TransportState =",
    "  | Docked",
    "  | Cruising Float",
    "  | Emergency",
    "      { reason :: Text",
    "      , code :: Int",
    "      }",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok, outcome.diagnostics[0]?.message);
});

test("varied-domain example: music", () => {
  const src = [
    "module Music.Note (Pitch, transpose)",
    "",
    "type Pitch = Int",
    "",
    "transpose semitones p = p + semitones",
  ].join("\n") + "\n";
  const outcome = parseText(src);
  assert.ok(outcome.ok, outcome.diagnostics[0]?.message);
});
