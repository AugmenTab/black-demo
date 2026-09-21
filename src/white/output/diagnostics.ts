export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticSpan {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface Diagnostic {
  code: string;
  kind: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  span?: DiagnosticSpan;
  details?: Record<string, unknown>;
}

export type Profile = "preview-web-1";
export const PROFILE: Profile = "preview-web-1";

export interface CommandResult {
  ok: boolean;
  command: string;
  profile: Profile;
  diagnostics: Diagnostic[];
  result: unknown | null;
}

export function ok<T>(command: string, result: T, diagnostics: Diagnostic[] = []): CommandResult {
  return { ok: true, command, profile: PROFILE, diagnostics, result };
}

export function fail(command: string, diagnostics: Diagnostic[]): CommandResult {
  return { ok: false, command, profile: PROFILE, diagnostics, result: null };
}

export function makeDiagnostic(input: {
  code: string;
  kind: string;
  severity?: DiagnosticSeverity;
  message: string;
  file?: string;
  span?: DiagnosticSpan;
  details?: Record<string, unknown>;
}): Diagnostic {
  return {
    code: input.code,
    kind: input.kind,
    severity: input.severity ?? "error",
    message: input.message,
    ...(input.file !== undefined ? { file: input.file } : {}),
    ...(input.span !== undefined ? { span: input.span } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };
}

export const codes = {
  projectNotFound: "WHITE_PROJECT_NOT_FOUND",
  configParseError: "WHITE_CONFIG_PARSE_ERROR",
  configMissingField: "WHITE_CONFIG_MISSING_FIELD",
  unsupportedProfile: "WHITE_UNSUPPORTED_PROFILE",
  unsupportedTarget: "WHITE_UNSUPPORTED_TARGET",
  entryNotFound: "WHITE_ENTRY_NOT_FOUND",
  entryNotBlack: "WHITE_ENTRY_NOT_BLACK",
  buildFailed: "WHITE_BUILD_FAILED",
  runtimeFailed: "WHITE_RUNTIME_FAILED",
} as const;
