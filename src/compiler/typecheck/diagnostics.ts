// Structured Phase-4 typechecker diagnostic helpers.
//
// Every emitted diagnostic carries a stable BLACK_TYPE_* / BLACK_* code and
// machine-readable `details` (§52, §53). Human prose and JSON describe the
// same underlying error; upstream renderers already handle both.

import type { Span } from "../source.js";
import type { Diagnostic } from "../../white/output/diagnostics.js";
import { makeDiagnostic } from "../../white/output/diagnostics.js";
import { toDiagnosticSpan } from "../source.js";

export const typeCodes = {
  mismatch: "BLACK_TYPE_MISMATCH",
  badArgument: "BLACK_BAD_ARGUMENT",
  unknownField: "BLACK_UNKNOWN_FIELD",
  missingField: "BLACK_MISSING_FIELD",
  badConstructorPayload: "BLACK_BAD_CONSTRUCTOR_PAYLOAD",
  nonExhaustiveCase: "BLACK_NON_EXHAUSTIVE_CASE",
  nonExhaustiveFunction: "BLACK_NON_EXHAUSTIVE_FUNCTION",
  missingSignature: "BLACK_TYPE_MISSING_SIGNATURE",
  missingDefinition: "BLACK_TYPE_MISSING_DEFINITION",
  arityMismatch: "BLACK_TYPE_ARITY_MISMATCH",
  aliasCycle: "BLACK_TYPE_ALIAS_CYCLE",
  ambiguous: "BLACK_TYPE_AMBIGUOUS",
  occursCheck: "BLACK_TYPE_OCCURS_CHECK",
  unboundVariable: "BLACK_TYPE_UNBOUND_VARIABLE",
  duplicateRecordField: "BLACK_DUPLICATE_RECORD_FIELD",
  unsupportedFeature: "BLACK_UNSUPPORTED_FEATURE",
} as const;

export interface EmitOptions {
  code: string;
  message: string;
  file: string;
  span: Span;
  details?: Record<string, unknown>;
}

export function typeDiag(opts: EmitOptions): Diagnostic {
  return makeDiagnostic({
    code: opts.code,
    kind: "typecheck",
    severity: "error",
    message: opts.message,
    file: opts.file,
    span: toDiagnosticSpan(opts.span),
    ...(opts.details !== undefined ? { details: opts.details } : {}),
  });
}
