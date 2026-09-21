import { lex, type LexResult } from "../../../src/compiler/lexer.js";
import { parseModule, type ParseDiagnostic } from "../../../src/compiler/parser.js";
import { makeSourceFile } from "../../../src/compiler/source.js";
import type { Module } from "../../../src/compiler/ast.js";

const DEFAULT_FILE = "test.blk";

export function lexSource(text: string, file: string = DEFAULT_FILE): LexResult {
  return lex(makeSourceFile(file, text));
}

export interface ParseOk {
  ok: true;
  module: Module;
  diagnostics: ParseDiagnostic[];
}
export interface ParseErr {
  ok: false;
  diagnostics: ParseDiagnostic[];
}
export type ParseOutcome = ParseOk | ParseErr;

export function parseText(text: string, file: string = DEFAULT_FILE): ParseOutcome {
  const source = makeSourceFile(file, text);
  const result = parseModule(source);
  if (result.module && result.diagnostics.length === 0) {
    return { ok: true, module: result.module, diagnostics: [] };
  }
  return { ok: false, diagnostics: result.diagnostics };
}

// Convenience helpers for building tests that focus on a specific declaration.

export function parseSingleDefinition(bodySource: string): {
  outcome: ParseOutcome;
} {
  const src = `module M (x)\n\nx = ${bodySource}\n`;
  return { outcome: parseText(src) };
}

export function parseDefinitionMultiline(source: string): ParseOutcome {
  const src = `module M (x)\n\n${source}\n`;
  return parseText(src);
}

export function parseTypeAlias(rhs: string): ParseOutcome {
  const src = `module M (T)\n\ntype T = ${rhs}\n`;
  return parseText(src);
}

export function parseSignature(rhs: string): ParseOutcome {
  const src = `module M (f)\n\nf :: ${rhs}\n`;
  return parseText(src);
}
