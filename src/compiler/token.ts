// Tokens produced by the Black lexer.

import type { Span } from "./source.js";

export type TokenKind =
  // Identifiers and literals
  | "IDENT"                 // lowercase-leading identifier, possibly ending in ?
  | "CONID"                 // capital-leading identifier (constructor/type/module component)
  | "INT"                   // integer literal
  | "FLOAT"                 // floating-point literal
  | "STRING"                // string literal
  // Reserved words used in surface syntax.
  //   NOTE: `otherwise` is deliberately NOT a keyword; it lexes as IDENT and
  //   is treated syntactically wherever a Prelude value is expected.
  | "MODULE"
  | "IMPORT"
  | "AS"
  | "TYPE"
  | "LET"
  | "IN"
  | "CASE"
  | "OF"
  | "TRUE"
  | "FALSE"
  // Punctuation and structural tokens
  | "LPAREN" | "RPAREN"
  | "LBRACE" | "RBRACE"
  | "LBRACK" | "RBRACK"
  | "COMMA"
  | "DOT"
  | "EQUALS"          // =
  | "COLON_COLON"     // ::
  | "ARROW"           // ->
  | "PIPE"            // |
  | "BACKSLASH"       // \
  | "UNDERSCORE"      // _
  // Operators (the fixed preview set)
  | "OP_PLUS"      // +
  | "OP_MINUS"     // -
  | "OP_STAR"      // *
  | "OP_SLASH"     // /
  | "OP_EQ"        // ==
  | "OP_LT"        // <
  | "OP_LE"        // <=
  | "OP_GT"        // >
  | "OP_GE"        // >=
  // Unrecognized symbolic operator (parser will reject as unsupported).
  | "OP_UNKNOWN"
  // Miscellaneous
  | "COMMENT_LINE"    // -- comment (produced then filtered before parsing)
  | "COMMENT_DOC"     // -- | doc comment
  | "EOF";

export interface Token {
  kind: TokenKind;
  lexeme: string;
  span: Span;
}

export function isKeywordKind(kind: TokenKind): boolean {
  switch (kind) {
    case "MODULE":
    case "IMPORT":
    case "AS":
    case "TYPE":
    case "LET":
    case "IN":
    case "CASE":
    case "OF":
    case "TRUE":
    case "FALSE":
      return true;
    default:
      return false;
  }
}

export const RESERVED_IDENTIFIERS: Record<string, TokenKind> = {
  module: "MODULE",
  import: "IMPORT",
  as: "AS",
  type: "TYPE",
  let: "LET",
  in: "IN",
  case: "CASE",
  of: "OF",
  True: "TRUE",
  False: "FALSE",
};

export function operatorLexeme(kind: TokenKind): string | null {
  switch (kind) {
    case "OP_PLUS": return "+";
    case "OP_MINUS": return "-";
    case "OP_STAR": return "*";
    case "OP_SLASH": return "/";
    case "OP_EQ": return "==";
    case "OP_LT": return "<";
    case "OP_LE": return "<=";
    case "OP_GT": return ">";
    case "OP_GE": return ">=";
    default: return null;
  }
}

export function isInfixOperator(kind: TokenKind): boolean {
  return operatorLexeme(kind) !== null;
}
