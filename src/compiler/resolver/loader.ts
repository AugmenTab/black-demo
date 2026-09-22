// Reachable-module loader.
//
// Given a project source root + entry file, discover the reachable-module
// closure by walking `import` declarations. Each file is parsed with the
// Phase 2 parser (§11) and its declared module name is compared against the
// path-derived expected identity (§7–§8).
//
// This module does not scan unrelated .blk files. See phase-03.md §9.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { makeSourceFile } from "../source.js";
import { parseModule, type ParseDiagnostic } from "../parser.js";
import type { Module } from "../ast.js";
import type { Diagnostic } from "../../white/output/diagnostics.js";
import { codes, makeDiagnostic } from "../../white/output/diagnostics.js";
import type { ModuleId } from "./types.js";
import { moduleIdFromPath } from "./types.js";

export interface LoadedModuleRecord {
  moduleId: ModuleId;
  file: string;
  parsed: Module;
}

export interface LoadReachableRequest {
  projectRoot: string;
  sourceRoot: string;
  entryPath: string;
}

export interface LoadReachableResult {
  hardFailure: boolean;
  entryModule: ModuleId;
  modules: Map<ModuleId, LoadedModuleRecord>;
  diagnostics: Diagnostic[];
}

export async function loadReachableModules(
  request: LoadReachableRequest,
): Promise<LoadReachableResult> {
  const diagnostics: Diagnostic[] = [];
  const modules = new Map<ModuleId, LoadedModuleRecord>();

  // Entry module identity is derived from its path relative to sourceRoot.
  const entryRelative = path.relative(request.sourceRoot, request.entryPath);
  if (entryRelative.startsWith("..") || path.isAbsolute(entryRelative)) {
    diagnostics.push(
      makeDiagnostic({
        code: codes.moduleNotFound,
        kind: "resolve",
        message: `entry file ${request.entryPath} is not inside source root ${request.sourceRoot}`,
        file: request.entryPath,
      }),
    );
    return { hardFailure: true, entryModule: "", modules, diagnostics };
  }
  const entryModule = pathToModuleId(entryRelative);

  // BFS queue of (moduleId, expectedFile, requestOrigin).
  interface WorkItem {
    moduleId: ModuleId;
    filePath: string;
    // Diagnostic file+span pair to attribute a not-found error to. Null for
    // the entry module (whose absence is a project-config issue caught
    // earlier).
    requestedFrom: {
      file: string;
      span: { start: { line: number; column: number }; end: { line: number; column: number } };
    } | null;
  }

  const queue: WorkItem[] = [
    {
      moduleId: entryModule,
      filePath: request.entryPath,
      requestedFrom: null,
    },
  ];

  let hardFailure = false;

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (modules.has(item.moduleId)) continue;

    if (!existsSync(item.filePath)) {
      hardFailure = true;
      diagnostics.push(
        makeDiagnostic({
          code: codes.moduleNotFound,
          kind: "resolve",
          message: `module ${item.moduleId} not found at ${path.relative(request.projectRoot, item.filePath) || item.filePath}`,
          file: item.requestedFrom?.file ?? item.filePath,
          span: item.requestedFrom?.span,
          details: {
            module: item.moduleId,
            expectedFile: item.filePath,
          },
        }),
      );
      continue;
    }

    const text = await readFile(item.filePath, "utf8");
    const source = makeSourceFile(item.filePath, text);
    const parseResult = parseModule(source);
    if (parseResult.module === null || parseResult.diagnostics.length > 0) {
      hardFailure = true;
      for (const d of parseResult.diagnostics) {
        diagnostics.push(parseDiagnosticToWhite(d, item.filePath));
      }
      continue;
    }

    const parsed = parseResult.module;

    // Validate module/path identity (§8).
    const declaredId = moduleIdFromPath(parsed.name);
    if (declaredId !== item.moduleId) {
      hardFailure = true;
      diagnostics.push(
        makeDiagnostic({
          code: codes.modulePathMismatch,
          kind: "resolve",
          message: `file ${path.relative(request.projectRoot, item.filePath) || item.filePath} declares module '${declaredId}' but its path expects '${item.moduleId}'`,
          file: item.filePath,
          span: toWhiteSpan(parsed.nameSpan),
          details: {
            declared: declaredId,
            expected: item.moduleId,
          },
        }),
      );
      continue;
    }

    modules.set(item.moduleId, {
      moduleId: item.moduleId,
      file: item.filePath,
      parsed,
    });

    // Enqueue imports.
    for (const imp of parsed.imports) {
      const importedId = moduleIdFromPath(imp.path);
      const importedFile = moduleIdToPath(request.sourceRoot, importedId);
      queue.push({
        moduleId: importedId,
        filePath: importedFile,
        requestedFrom: {
          file: item.filePath,
          span: toWhiteSpan(imp.pathSpan),
        },
      });
    }
  }

  return { hardFailure, entryModule, modules, diagnostics };
}

// Convert a path relative to sourceRoot into a canonical ModuleId. The path
// must end with `.blk` and use directory separators to encode dotted
// components. `Main.blk` → `Main`. `Game/Model.blk` → `Game.Model`.
function pathToModuleId(relative: string): ModuleId {
  const withoutExt = relative.replace(/\.blk$/, "");
  const parts = withoutExt.split(path.sep).filter((s) => s.length > 0);
  return parts.join(".");
}

// Inverse of pathToModuleId: resolve a canonical ModuleId to an absolute file
// path underneath sourceRoot. No search heuristics (§10).
export function moduleIdToPath(sourceRoot: string, moduleId: ModuleId): string {
  const parts = moduleId.split(".");
  return path.join(sourceRoot, ...parts) + ".blk";
}

function parseDiagnosticToWhite(d: ParseDiagnostic, file: string): Diagnostic {
  const kind = d.code.startsWith("BLACK_LEX_") ? "lex" : "parse";
  const code = mapParseCode(d.code);
  return makeDiagnostic({
    code,
    kind,
    severity: "error",
    message: d.message,
    file,
    span: toWhiteSpan(d.span),
  });
}

function mapParseCode(code: string): string {
  switch (code) {
    case "BLACK_LEX_INVALID_CHARACTER": return codes.lexInvalidCharacter;
    case "BLACK_LEX_INVALID_NUMBER": return codes.lexInvalidNumber;
    case "BLACK_LEX_UNTERMINATED_STRING": return codes.lexUnterminatedString;
    case "BLACK_LEX_INVALID_ESCAPE": return codes.lexInvalidEscape;
    case "BLACK_PARSE_UNEXPECTED_TOKEN": return codes.parseUnexpectedToken;
    case "BLACK_PARSE_UNEXPECTED_EOF": return codes.parseUnexpectedEof;
    case "BLACK_PARSE_TRAILING_TOKENS": return codes.parseTrailingTokens;
    case "BLACK_PARSE_LAYOUT_ERROR": return codes.parseLayoutError;
    case "BLACK_PARSE_UNSUPPORTED_SYNTAX": return codes.parseUnsupportedSyntax;
    default: return code;
  }
}

function toWhiteSpan(span: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}

