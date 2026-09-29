export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticSpan {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface RelatedLocation {
  file?: string;
  span?: DiagnosticSpan;
  message: string;
}

export interface Diagnostic {
  code: string;
  kind: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  span?: DiagnosticSpan;
  details?: Record<string, unknown>;
  related?: RelatedLocation[];
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
  related?: RelatedLocation[];
}): Diagnostic {
  return {
    code: input.code,
    kind: input.kind,
    severity: input.severity ?? "error",
    message: input.message,
    ...(input.file !== undefined ? { file: input.file } : {}),
    ...(input.span !== undefined ? { span: input.span } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.related !== undefined ? { related: input.related } : {}),
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
  lexInvalidCharacter: "BLACK_LEX_INVALID_CHARACTER",
  lexInvalidNumber: "BLACK_LEX_INVALID_NUMBER",
  lexUnterminatedString: "BLACK_LEX_UNTERMINATED_STRING",
  lexInvalidEscape: "BLACK_LEX_INVALID_ESCAPE",
  parseUnexpectedToken: "BLACK_PARSE_UNEXPECTED_TOKEN",
  parseUnexpectedEof: "BLACK_PARSE_UNEXPECTED_EOF",
  parseTrailingTokens: "BLACK_PARSE_TRAILING_TOKENS",
  parseLayoutError: "BLACK_PARSE_LAYOUT_ERROR",
  parseUnsupportedSyntax: "BLACK_PARSE_UNSUPPORTED_SYNTAX",

  // ---------- Phase 3: module graph and name resolution ----------
  moduleNotFound: "BLACK_MODULE_NOT_FOUND",
  modulePathMismatch: "BLACK_MODULE_PATH_MISMATCH",
  moduleCycle: "BLACK_MODULE_CYCLE",

  exportUnknown: "BLACK_EXPORT_UNKNOWN",
  exportInvalidConstructors: "BLACK_EXPORT_INVALID_CONSTRUCTORS",

  importUnknownName: "BLACK_IMPORT_UNKNOWN_NAME",
  importNotExported: "BLACK_IMPORT_NOT_EXPORTED",
  importConstructorsNotExported: "BLACK_IMPORT_CONSTRUCTORS_NOT_EXPORTED",

  nameUnknown: "BLACK_NAME_UNKNOWN",
  typeNameUnknown: "BLACK_TYPE_NAME_UNKNOWN",
  nameAmbiguous: "BLACK_NAME_AMBIGUOUS",
  nameDuplicate: "BLACK_NAME_DUPLICATE",
  nameDuplicateBinding: "BLACK_NAME_DUPLICATE_BINDING",
  nameShadowing: "BLACK_NAME_SHADOWING",

  moduleAliasDuplicate: "BLACK_MODULE_ALIAS_DUPLICATE",
  moduleAliasUnknown: "BLACK_MODULE_ALIAS_UNKNOWN",
  moduleQualifierAmbiguous: "BLACK_MODULE_QUALIFIER_AMBIGUOUS",
  qualifiedNameUnknown: "BLACK_QUALIFIED_NAME_UNKNOWN",

  // ---------- Phase 4: typechecking ----------
  typeMismatch: "BLACK_TYPE_MISMATCH",
  typeBadArgument: "BLACK_BAD_ARGUMENT",
  typeUnknownField: "BLACK_UNKNOWN_FIELD",
  typeMissingField: "BLACK_MISSING_FIELD",
  typeBadConstructorPayload: "BLACK_BAD_CONSTRUCTOR_PAYLOAD",
  typeNonExhaustiveCase: "BLACK_NON_EXHAUSTIVE_CASE",
  typeNonExhaustiveFunction: "BLACK_NON_EXHAUSTIVE_FUNCTION",
  typeMissingSignature: "BLACK_TYPE_MISSING_SIGNATURE",
  typeMissingDefinition: "BLACK_TYPE_MISSING_DEFINITION",
  typeArityMismatch: "BLACK_TYPE_ARITY_MISMATCH",
  typeAliasCycle: "BLACK_TYPE_ALIAS_CYCLE",
  typeAmbiguous: "BLACK_TYPE_AMBIGUOUS",
  typeOccursCheck: "BLACK_TYPE_OCCURS_CHECK",
  typeUnboundVariable: "BLACK_TYPE_UNBOUND_VARIABLE",
  typeDuplicateRecordField: "BLACK_DUPLICATE_RECORD_FIELD",
  typeUnsupportedFeature: "BLACK_UNSUPPORTED_FEATURE",
} as const;
