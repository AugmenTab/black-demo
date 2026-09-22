// Recursive-descent parser for the Black preview surface, with a small
// Pratt-style infix expression sub-parser. Layout is handled by carrying a
// `minCol` argument through parsing: no token at column ≤ minCol is treated
// as part of the current construct.
//
// Public API:
//   parseModule(source) -> ParseModuleResult
//
// The parser stops at the first structural error and reports a single
// diagnostic. This matches the phase-2 "one accurate diagnostic > five
// misleading guesses" rule.

import { lex, type LexError } from "./lexer.js";
import {
  makeSpan,
  type Position,
  type Span,
  type SourceFile,
} from "./source.js";
import type { Token, TokenKind } from "./token.js";
import type {
  CaseBranch,
  Decl,
  DeclDefinition,
  DeclSignature,
  DeclTypeAlias,
  DeclVariant,
  ExportSpec,
  Expr,
  GuardedRhs,
  ImportDecl,
  InfixOp,
  LetBinding,
  Module,
  Pattern,
  PatternRecordField,
  RecordFieldValue,
  SelectedImport,
  TypeNode,
  TypeRecordField,
  VariantAlt,
  VariantPayload,
} from "./ast.js";

export interface ParseDiagnostic {
  code: ParseDiagnosticCode;
  message: string;
  span: Span;
}

export type ParseDiagnosticCode =
  | "BLACK_LEX_INVALID_CHARACTER"
  | "BLACK_LEX_INVALID_NUMBER"
  | "BLACK_LEX_UNTERMINATED_STRING"
  | "BLACK_LEX_INVALID_ESCAPE"
  | "BLACK_PARSE_UNEXPECTED_TOKEN"
  | "BLACK_PARSE_UNEXPECTED_EOF"
  | "BLACK_PARSE_TRAILING_TOKENS"
  | "BLACK_PARSE_LAYOUT_ERROR"
  | "BLACK_PARSE_UNSUPPORTED_SYNTAX";

export interface ParseModuleResult {
  module: Module | null;
  diagnostics: ParseDiagnostic[];
}

class Bail extends Error {
  constructor(public readonly diagnostic: ParseDiagnostic) {
    super(diagnostic.message);
  }
}

export function parseModule(source: SourceFile): ParseModuleResult {
  const { tokens, errors } = lex(source);

  const diagnostics: ParseDiagnostic[] = errors.map(lexErrorToParse);
  if (diagnostics.length > 0) {
    return { module: null, diagnostics: [diagnostics[0]!] };
  }

  const parser = new Parser(tokens.filter(nonComment), source);
  try {
    const mod = parser.parseModule();
    return { module: mod, diagnostics: [] };
  } catch (err) {
    if (err instanceof Bail) {
      return { module: null, diagnostics: [err.diagnostic] };
    }
    throw err;
  }
}

function nonComment(t: Token): boolean {
  return t.kind !== "COMMENT_LINE" && t.kind !== "COMMENT_DOC";
}

function lexErrorToParse(err: LexError): ParseDiagnostic {
  return { code: err.code, message: err.message, span: err.span };
}

const INFIX_TABLE: Record<InfixOp, { precedence: number; associativity: "left" | "right" | "none" }> = {
  "*": { precedence: 7, associativity: "left" },
  "/": { precedence: 7, associativity: "left" },
  "+": { precedence: 6, associativity: "left" },
  "-": { precedence: 6, associativity: "left" },
  "==": { precedence: 4, associativity: "none" },
  "<":  { precedence: 4, associativity: "none" },
  "<=": { precedence: 4, associativity: "none" },
  ">":  { precedence: 4, associativity: "none" },
  ">=": { precedence: 4, associativity: "none" },
};

function tokenToInfixOp(kind: TokenKind): InfixOp | null {
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

class Parser {
  private readonly tokens: Token[];
  private readonly file: string;
  private i = 0;

  constructor(tokens: Token[], source: SourceFile) {
    this.tokens = tokens;
    this.file = source.file;
  }

  // ---- Token utilities ------------------------------------------------

  private peek(off = 0): Token {
    return this.tokens[this.i + off] ?? this.tokens[this.tokens.length - 1]!;
  }

  private cur(): Token {
    return this.tokens[this.i]!;
  }

  private advance(): Token {
    const t = this.tokens[this.i]!;
    if (this.i < this.tokens.length - 1) this.i += 1;
    return t;
  }

  private check(kind: TokenKind): boolean {
    return this.cur().kind === kind;
  }

  private accept(kind: TokenKind): Token | null {
    if (this.check(kind)) return this.advance();
    return null;
  }

  private expect(kind: TokenKind, description?: string): Token {
    if (this.check(kind)) return this.advance();
    const t = this.cur();
    const what = description ?? kind;
    if (t.kind === "EOF") {
      throw new Bail({
        code: "BLACK_PARSE_UNEXPECTED_EOF",
        message: `unexpected end of input; expected ${what}`,
        span: t.span,
      });
    }
    throw new Bail({
      code: "BLACK_PARSE_UNEXPECTED_TOKEN",
      message: `unexpected ${describeToken(t)}; expected ${what}`,
      span: t.span,
    });
  }

  private unexpected(t: Token, expected: string): never {
    if (t.kind === "EOF") {
      throw new Bail({
        code: "BLACK_PARSE_UNEXPECTED_EOF",
        message: `unexpected end of input; expected ${expected}`,
        span: t.span,
      });
    }
    throw new Bail({
      code: "BLACK_PARSE_UNEXPECTED_TOKEN",
      message: `unexpected ${describeToken(t)}; expected ${expected}`,
      span: t.span,
    });
  }

  private unsupported(t: Token, feature: string): never {
    throw new Bail({
      code: "BLACK_PARSE_UNSUPPORTED_SYNTAX",
      message: `unsupported syntax: ${feature}`,
      span: t.span,
    });
  }

  private layoutError(t: Token, why: string): never {
    throw new Bail({
      code: "BLACK_PARSE_LAYOUT_ERROR",
      message: `layout error: ${why}`,
      span: t.span,
    });
  }

  // ---- Module ---------------------------------------------------------

  parseModule(): Module {
    // A module MUST begin with `module`.
    const first = this.cur();
    if (first.kind === "EOF") {
      throw new Bail({
        code: "BLACK_PARSE_UNEXPECTED_EOF",
        message: "unexpected end of input; expected `module`",
        span: first.span,
      });
    }
    const moduleKw = this.expect("MODULE", "`module` keyword");

    const namePath = this.parseQualifiedConstructorPath();
    const nameSpan = joinSpanRange(namePath.map((p) => p.span));

    // Canonical Black requires an explicit parenthesized export list on every
    // module header. `module M ()` is a legal empty export list; a bare
    // `module M` header is a parse error.
    if (!this.check("LPAREN")) {
      this.unexpected(this.cur(), "'(' opening the module export list");
    }
    const exports: ExportSpec[] = this.parseExportList();

    // Header ends. Imports follow (any number).
    const imports: ImportDecl[] = [];
    while (this.check("IMPORT")) {
      imports.push(this.parseImport());
    }

    // Top-level declarations. The reference column is the column of the first
    // declaration keyword or name.
    const declarations: Decl[] = [];
    if (!this.check("EOF")) {
      const topRefCol = this.cur().span.start.column;
      // Top-level declarations must begin at column 1 to keep the layout
      // predictable in the preview profile.
      if (topRefCol !== 1) {
        this.layoutError(this.cur(), "top-level declarations must begin at column 1");
      }
      while (!this.check("EOF")) {
        const decl = this.parseTopLevelDecl(topRefCol);
        declarations.push(decl);
      }
    }

    // Require consuming to EOF.
    if (!this.check("EOF")) {
      const t = this.cur();
      throw new Bail({
        code: "BLACK_PARSE_TRAILING_TOKENS",
        message: `unexpected ${describeToken(t)} after top-level declarations`,
        span: t.span,
      });
    }

    const lastSpan = declarations.length > 0
      ? declarations[declarations.length - 1]!.span
      : imports.length > 0
        ? imports[imports.length - 1]!.span
        : exports.length > 0
          ? exports[exports.length - 1]!.span
          : nameSpan;
    return {
      kind: "Module",
      name: namePath.map((p) => p.name),
      nameSpan,
      exports,
      imports,
      declarations,
      span: makeSpan(this.file, moduleKw.span.start, lastSpan.end),
    };
  }

  private parseQualifiedConstructorPath(): { name: string; span: Span }[] {
    // A dotted path of CONID components. The initial CONID is required.
    const first = this.expect("CONID", "capitalized identifier");
    const parts: { name: string; span: Span }[] = [{ name: first.lexeme, span: first.span }];
    while (this.check("DOT")) {
      // Sanity: peek to ensure it's followed by CONID; otherwise leave it.
      const next = this.peek(1);
      if (next.kind !== "CONID") break;
      this.advance(); // consume DOT
      const t = this.advance();
      parts.push({ name: t.lexeme, span: t.span });
    }
    return parts;
  }

  private parseExportList(): ExportSpec[] {
    const lparen = this.expect("LPAREN");
    const items: ExportSpec[] = [];
    if (this.check("RPAREN")) {
      this.advance();
      return items; // empty list is legal
    }
    while (true) {
      items.push(this.parseExportSpec());
      if (this.accept("COMMA")) {
        // Trailing separators are not permitted.
        if (this.check("RPAREN")) {
          this.unexpected(this.cur(), "an export entry after ','");
        }
        continue;
      }
      break;
    }
    this.expect("RPAREN", "')' to close export list");
    void lparen;
    return items;
  }

  private parseExportSpec(): ExportSpec {
    const t = this.cur();
    if (t.kind === "IDENT") {
      this.advance();
      return { name: t.lexeme, nameSpan: t.span, kind: "term", span: t.span };
    }
    if (t.kind === "CONID") {
      this.advance();
      // Optional `(..)` suffix.
      if (this.check("LPAREN")) {
        const lp = this.advance();
        // Expect two dots. The lexer emits DOTs individually.
        const d1 = this.expect("DOT", "'..' (double dot)");
        const d2 = this.expect("DOT", "'..' (second dot)");
        // Adjacency check: the two dots must be contiguous.
        if (d1.span.end.offset !== d2.span.start.offset) {
          throw new Bail({
            code: "BLACK_PARSE_UNEXPECTED_TOKEN",
            message: "expected '..' (no whitespace between the two dots)",
            span: makeSpan(this.file, d1.span.start, d2.span.end),
          });
        }
        const rp = this.expect("RPAREN", "')' to close '(..)'");
        return {
          name: t.lexeme,
          nameSpan: t.span,
          kind: "typeAll",
          span: makeSpan(this.file, t.span.start, rp.span.end),
        };
        void lp;
      }
      return { name: t.lexeme, nameSpan: t.span, kind: "type", span: t.span };
    }
    this.unexpected(t, "an export entry");
  }

  private parseImport(): ImportDecl {
    const kw = this.expect("IMPORT");
    const parts = this.parseQualifiedConstructorPath();
    const path = parts.map((p) => p.name);
    const pathSpan = joinSpanRange(parts.map((p) => p.span));

    if (this.check("LPAREN")) {
      // Selected import: `import Foo.Bar (a, B, C (..))`.
      this.advance();
      const selected: SelectedImport[] = [];
      if (this.check("RPAREN")) {
        this.advance();
      } else {
        while (true) {
          const t = this.cur();
          if (t.kind === "IDENT") {
            this.advance();
            selected.push({ name: t.lexeme, span: t.span });
          } else if (t.kind === "CONID") {
            this.advance();
            let end = t.span.end;
            let name = t.lexeme;
            if (this.check("LPAREN")) {
              const lp = this.advance();
              const d1 = this.expect("DOT", "'..' (double dot)");
              const d2 = this.expect("DOT", "'..' (second dot)");
              if (d1.span.end.offset !== d2.span.start.offset) {
                throw new Bail({
                  code: "BLACK_PARSE_UNEXPECTED_TOKEN",
                  message: "expected '..' (no whitespace between the two dots)",
                  span: makeSpan(this.file, d1.span.start, d2.span.end),
                });
              }
              const rp = this.expect("RPAREN", "')' to close '(..)'");
              end = rp.span.end;
              name = t.lexeme + "(..)";
              void lp;
            }
            selected.push({ name, span: makeSpan(this.file, t.span.start, end) });
          } else {
            this.unexpected(t, "an imported name");
          }
          if (this.accept("COMMA")) {
            if (this.check("RPAREN")) this.unexpected(this.cur(), "an imported name after ','");
            continue;
          }
          break;
        }
        this.expect("RPAREN", "')' to close selected-import list");
      }
      // The selected-plus-qualified hybrid is explicitly rejected.
      if (this.check("AS")) {
        const asTok = this.cur();
        this.unsupported(asTok, "`import X (...) as Y` (mixing selected import with a qualifier)");
      }
      const endSpan = selected.length > 0
        ? selected[selected.length - 1]!.span
        : pathSpan;
      return {
        path,
        pathSpan,
        kind: "selected",
        selected,
        alias: null,
        span: makeSpan(this.file, kw.span.start, endSpan.end),
      };
    }

    if (this.check("AS")) {
      this.advance();
      const alias = this.expect("CONID", "an alias (capitalized identifier) after `as`");
      return {
        path,
        pathSpan,
        kind: "qualified",
        selected: null,
        alias: { name: alias.lexeme, span: alias.span },
        span: makeSpan(this.file, kw.span.start, alias.span.end),
      };
    }

    // Bare `import Path` is not part of the preview surface.
    this.unsupported(this.cur(), "`import` must specify a selected-name list or `as` alias");
  }

  // ---- Top-level declarations ----------------------------------------

  private parseTopLevelDecl(refCol: number): Decl {
    const t = this.cur();
    if (t.span.start.column !== refCol) {
      this.layoutError(t, `expected declaration at column ${refCol}`);
    }
    if (t.kind === "TYPE") {
      return this.parseTypeDecl(refCol);
    }
    if (t.kind === "IDENT") {
      // Either `name :: Type` (signature) or `name pat* = expr` / guarded.
      // Peek ahead to distinguish.
      // We look at the token immediately after the name.
      const nameTok = this.advance();
      if (this.check("COLON_COLON")) {
        return this.parseSignatureRest(nameTok, refCol);
      }
      return this.parseDefinitionRest(nameTok, refCol);
    }
    this.unexpected(t, "a top-level declaration");
  }

  private parseTypeDecl(refCol: number): DeclTypeAlias | DeclVariant {
    const kw = this.expect("TYPE");
    const nameTok = this.expect("CONID", "a type name");
    this.expect("EQUALS", "'=' in type declaration");

    // Variant if the very next token is a PIPE.
    if (this.check("PIPE")) {
      const alternatives: VariantAlt[] = [];
      // Determine the alt reference column: column of the leading '|'.
      const altRefCol = this.cur().span.start.column;
      const altRefLine = this.cur().span.start.line;
      while (this.check("PIPE") && this.isSibling(altRefCol, altRefLine)) {
        alternatives.push(this.parseVariantAlt(altRefCol));
      }
      // After variant alternatives, the declaration is complete.
      const last = alternatives[alternatives.length - 1]!;
      return {
        kind: "DeclVariant",
        name: nameTok.lexeme,
        nameSpan: nameTok.span,
        alternatives,
        span: makeSpan(this.file, kw.span.start, last.span.end),
      };
    }

    // Type alias.
    // The RHS type may span multiple lines; its minCol is refCol.
    const body = this.parseType(refCol);
    return {
      kind: "DeclTypeAlias",
      name: nameTok.lexeme,
      nameSpan: nameTok.span,
      body,
      span: makeSpan(this.file, kw.span.start, body.span.end),
    };
  }

  private parseVariantAlt(altRefCol: number): VariantAlt {
    const pipe = this.expect("PIPE", "'|' at the start of a variant alternative");
    void altRefCol;
    const name = this.expect("CONID", "constructor name");

    // Payload options: none, single type expression, or record type.
    let payload: VariantPayload;
    let endSpan = name.span;

    // Terminate if the next PIPE is a sibling variant alternative (either the
    // same alt column on a later line, or the same physical line as the
    // opening '|' of this decl).
    if (this.check("PIPE") && this.isSiblingFromPipe(pipe)) {
      payload = { kind: "None" };
    } else if (this.check("EOF") || this.currentStartsTopLevel(altRefCol)) {
      payload = { kind: "None" };
    } else if (this.check("LBRACE")) {
      // Record-type payload. `{` on the same or next line at deeper indent.
      const rec = this.parseTypeRecord(altRefCol);
      payload = { kind: "Record", fields: rec.fields, span: rec.span };
      endSpan = rec.span;
    } else {
      // Single type-expression payload. It parses as a type application (not
      // as a function type). Blocks like `Foo -> Bar` in a payload position
      // are ambiguous with subsequent alternatives; require explicit parens.
      const payloadType = this.parseTypeApp(altRefCol);
      payload = { kind: "Type", type: payloadType };
      endSpan = payloadType.span;
    }

    return {
      name: name.lexeme,
      nameSpan: name.span,
      payload,
      span: makeSpan(this.file, pipe.span.start, endSpan.end),
    };
  }

  private currentStartsTopLevel(minCol: number): boolean {
    const t = this.cur();
    if (t.kind === "EOF") return true;
    // A token at column ≤ minCol that is not a pipe at that column signals
    // the current construct is done.
    return t.span.start.column < minCol;
  }

  private parseSignatureRest(nameTok: Token, minCol: number): DeclSignature {
    this.expect("COLON_COLON");
    const type = this.parseType(minCol);
    return {
      kind: "DeclSignature",
      name: nameTok.lexeme,
      nameSpan: nameTok.span,
      type,
      span: makeSpan(this.file, nameTok.span.start, type.span.end),
    };
  }

  private parseDefinitionRest(nameTok: Token, minCol: number): DeclDefinition {
    // Parameters: patterns until we see `=` or `|` at the appropriate position.
    const params: Pattern[] = [];
    while (!this.check("EQUALS") && !this.check("PIPE")) {
      const t = this.cur();
      if (t.kind === "EOF") this.unexpected(t, "'=' in function definition");
      if (t.span.start.column <= minCol) {
        this.layoutError(t, "unexpected dedent while parsing definition parameters");
      }
      params.push(this.parsePatternAtom(minCol));
    }

    if (this.check("PIPE")) {
      const guards = this.parseGuardedRhs(minCol);
      const last = guards[guards.length - 1]!;
      return {
        kind: "DeclDefinition",
        name: nameTok.lexeme,
        nameSpan: nameTok.span,
        params,
        body: null,
        guards,
        span: makeSpan(this.file, nameTok.span.start, last.span.end),
      };
    }

    this.expect("EQUALS", "'=' in function definition");
    const body = this.parseExpr(minCol);
    return {
      kind: "DeclDefinition",
      name: nameTok.lexeme,
      nameSpan: nameTok.span,
      params,
      body,
      guards: null,
      span: makeSpan(this.file, nameTok.span.start, body.span.end),
    };
  }

  private parseGuardedRhs(minCol: number): GuardedRhs[] {
    // Each guard begins with '|'. In multi-line form, subsequent guards align
    // at the same column; in single-line form, they may all appear on the
    // same physical line.
    const guardCol = this.cur().span.start.column;
    const guardLine = this.cur().span.start.line;
    if (guardCol <= minCol) {
      this.layoutError(this.cur(), "guarded equation must be indented past the definition");
    }
    const guards: GuardedRhs[] = [];
    while (this.check("PIPE") && this.isSibling(guardCol, guardLine)) {
      const pipe = this.advance();
      const condition = this.parseExpr(guardCol);
      this.expect("EQUALS", "'=' after guard condition");
      const body = this.parseExpr(guardCol);
      guards.push({
        condition,
        body,
        span: makeSpan(this.file, pipe.span.start, body.span.end),
      });
    }
    if (guards.length === 0) {
      this.unexpected(this.cur(), "'|' to start a guard");
    }
    return guards;
  }

  // A "sibling" of an original PIPE at (col, line) is another PIPE that
  // either aligns to the same column (multi-line form) OR sits on the same
  // physical line (single-line form: `| a | b | c`).
  private isSibling(refCol: number, refLine: number): boolean {
    const t = this.cur();
    if (t.span.start.column === refCol) return true;
    if (t.span.start.line === refLine && t.span.start.column > refCol) return true;
    return false;
  }

  private isSiblingFromPipe(referencePipe: Token): boolean {
    return this.isSibling(referencePipe.span.start.column, referencePipe.span.start.line);
  }

  // ---- Types ----------------------------------------------------------

  private parseType(minCol: number): TypeNode {
    const left = this.parseTypeApp(minCol);
    if (this.checkAtCol("ARROW", minCol)) {
      this.advance();
      const right = this.parseType(minCol); // right-associative
      return {
        kind: "TypeFun",
        from: left,
        to: right,
        span: makeSpan(this.file, left.span.start, right.span.end),
      };
    }
    return left;
  }

  private parseTypeApp(minCol: number): TypeNode {
    let head = this.parseTypeAtom(minCol);
    while (true) {
      const t = this.cur();
      if (t.kind === "EOF") break;
      if (t.span.start.column <= minCol) break;
      if (!canStartTypeAtom(t.kind)) break;
      const arg = this.parseTypeAtom(minCol);
      head = {
        kind: "TypeApp",
        head,
        arg,
        span: makeSpan(this.file, head.span.start, arg.span.end),
      };
    }
    return head;
  }

  private parseTypeAtom(minCol: number): TypeNode {
    const t = this.cur();
    if (t.kind === "CONID") {
      this.advance();
      // Optionally qualified: Path.Foo (module-qualified type).
      const parts: { name: string; span: Span }[] = [{ name: t.lexeme, span: t.span }];
      while (this.check("DOT") && this.peek(1).kind === "CONID") {
        this.advance();
        const c = this.advance();
        parts.push({ name: c.lexeme, span: c.span });
      }
      const span = makeSpan(this.file, parts[0]!.span.start, parts[parts.length - 1]!.span.end);
      return { kind: "TypeCon", path: parts.map((p) => p.name), span };
    }
    if (t.kind === "IDENT") {
      this.advance();
      return { kind: "TypeVar", name: t.lexeme, span: t.span };
    }
    if (t.kind === "LPAREN") {
      const lp = this.advance();
      if (this.check("RPAREN")) {
        const rp = this.advance();
        return { kind: "TypeUnit", span: makeSpan(this.file, lp.span.start, rp.span.end) };
      }
      const inner = this.parseType(minCol);
      const rp = this.expect("RPAREN", "')' to close parenthesized type");
      return {
        kind: "TypeParen",
        inner,
        span: makeSpan(this.file, lp.span.start, rp.span.end),
      };
    }
    if (t.kind === "LBRACE") {
      const rec = this.parseTypeRecord(minCol);
      return { kind: "TypeRecord", fields: rec.fields, span: rec.span };
    }
    if (t.kind === "LBRACK") {
      this.unsupported(t, "Haskell-style list-type syntax `[a]` is not supported; write `List a`");
    }
    this.unexpected(t, "a type");
  }

  private parseTypeRecord(minCol: number): { fields: TypeRecordField[]; span: Span } {
    const lb = this.expect("LBRACE");
    const fields: TypeRecordField[] = [];
    if (this.check("RBRACE")) {
      const rb = this.advance();
      return { fields, span: makeSpan(this.file, lb.span.start, rb.span.end) };
    }
    while (true) {
      const name = this.expect("IDENT", "a record field name");
      this.expect("COLON_COLON", "'::' between field name and type");
      const fieldType = this.parseType(minCol);
      fields.push({
        name: name.lexeme,
        nameSpan: name.span,
        fieldType,
        span: makeSpan(this.file, name.span.start, fieldType.span.end),
      });
      if (this.accept("COMMA")) continue;
      break;
    }
    const rb = this.expect("RBRACE", "'}' to close record type");
    return { fields, span: makeSpan(this.file, lb.span.start, rb.span.end) };
  }

  // ---- Patterns -------------------------------------------------------

  private parsePattern(minCol: number): Pattern {
    // Constructor pattern possibly with arguments; module-qualified via
    // `Alias.Ctor arg…` (§12).
    const t = this.cur();
    if (t.kind === "CONID") {
      this.advance();
      // Collect module-qualifier segments: any number of `.CONID`. The final
      // CONID (still consumed here) is the terminal constructor name.
      const conids: Token[] = [t];
      while (this.check("DOT") && this.peek(1).kind === "CONID") {
        this.advance();
        const next = this.expect("CONID", "a constructor name after module qualifier");
        conids.push(next);
      }
      const ctorTok: Token = conids[conids.length - 1]!;
      const qualifierToks = conids.slice(0, -1);
      const qualifier =
        qualifierToks.length > 0
          ? {
              parts: qualifierToks.map((q) => ({ name: q.lexeme, span: q.span })),
              span: makeSpan(
                this.file,
                qualifierToks[0]!.span.start,
                qualifierToks[qualifierToks.length - 1]!.span.end,
              ),
            }
          : null;
      // `CONID { ... }` on the same line is a labelled record pattern.
      if (this.check("LBRACE") && this.cur().span.start.line === ctorTok.span.end.line) {
        void qualifier;
        return this.parseRecordPatternRest(ctorTok);
      }
      const args: Pattern[] = [];
      while (true) {
        const u = this.cur();
        if (u.kind === "EOF") break;
        if (u.span.start.column <= minCol) break;
        if (!canStartPatternAtom(u.kind)) break;
        args.push(this.parsePatternAtom(minCol));
      }
      const start = qualifier?.span.start ?? ctorTok.span.start;
      const end = args.length > 0 ? args[args.length - 1]!.span.end : ctorTok.span.end;
      return {
        kind: "PatternCon",
        qualifier,
        name: ctorTok.lexeme,
        nameSpan: ctorTok.span,
        args,
        span: makeSpan(this.file, start, end),
      };
    }
    return this.parsePatternAtom(minCol);
  }

  private parsePatternAtom(minCol: number): Pattern {
    void minCol;
    const t = this.cur();
    if (t.kind === "UNDERSCORE") {
      this.advance();
      return { kind: "PatternWildcard", span: t.span };
    }
    if (t.kind === "IDENT") {
      this.advance();
      return { kind: "PatternVar", name: t.lexeme, span: t.span };
    }
    if (t.kind === "TRUE" || t.kind === "FALSE") {
      this.advance();
      return { kind: "PatternBool", value: t.kind === "TRUE", span: t.span };
    }
    if (t.kind === "INT") {
      this.advance();
      const n = parseIntStrict(t.lexeme);
      return { kind: "PatternInt", value: n, text: t.lexeme, span: t.span };
    }
    if (t.kind === "FLOAT") {
      this.advance();
      const n = Number(t.lexeme);
      return { kind: "PatternFloat", value: n, text: t.lexeme, span: t.span };
    }
    if (t.kind === "STRING") {
      this.advance();
      return { kind: "PatternString", value: decodeStringLexeme(t.lexeme), span: t.span };
    }
    if (t.kind === "CONID") {
      // Bare constructor (no arguments) or the beginning of a constructor
      // application when appearing as a full pattern. Since we're inside
      // an atom parser (used for e.g. definition parameters), keep it as
      // a zero-arg constructor to avoid consuming subsequent arguments.
      // Also support module-qualified nullary constructor `Mod.Sub.Ctor` (§12).
      this.advance();
      const conids: Token[] = [t];
      while (this.check("DOT") && this.peek(1).kind === "CONID") {
        this.advance();
        const next = this.expect("CONID", "a constructor name after module qualifier");
        conids.push(next);
      }
      const ctorTok: Token = conids[conids.length - 1]!;
      const qualifierToks = conids.slice(0, -1);
      const qualifier =
        qualifierToks.length > 0
          ? {
              parts: qualifierToks.map((q) => ({ name: q.lexeme, span: q.span })),
              span: makeSpan(
                this.file,
                qualifierToks[0]!.span.start,
                qualifierToks[qualifierToks.length - 1]!.span.end,
              ),
            }
          : null;
      // If a record pattern follows immediately, this is a labelled record
      // pattern: `Point { x = px, y = py }`.
      if (this.check("LBRACE") && this.cur().span.start.line === ctorTok.span.end.line) {
        void qualifier;
        return this.parseRecordPatternRest(ctorTok);
      }
      const start = qualifier?.span.start ?? ctorTok.span.start;
      return {
        kind: "PatternCon",
        qualifier,
        name: ctorTok.lexeme,
        nameSpan: ctorTok.span,
        args: [],
        span: makeSpan(this.file, start, ctorTok.span.end),
      };
    }
    if (t.kind === "LBRACE") {
      return this.parseRecordPatternRest(null);
    }
    if (t.kind === "LPAREN") {
      const lp = this.advance();
      const inner = this.parsePattern(0);
      const rp = this.expect("RPAREN", "')' to close parenthesized pattern");
      // Preserve original inner; drop the paren from the AST since patterns
      // don't need paren nodes. Keep the outer span though.
      inner.span = makeSpan(this.file, lp.span.start, rp.span.end);
      return inner;
    }
    this.unexpected(t, "a pattern");
  }

  private parseRecordPatternRest(constructor: Token | null): Pattern {
    const lb = this.expect("LBRACE");
    const startSpan = constructor ? constructor.span : lb.span;
    const fields: PatternRecordField[] = [];
    if (this.check("RBRACE")) {
      const rb = this.advance();
      return {
        kind: "PatternRecord",
        constructor: constructor ? { name: constructor.lexeme, span: constructor.span } : null,
        fields,
        span: makeSpan(this.file, startSpan.start, rb.span.end),
      };
    }
    while (true) {
      const name = this.cur();
      if (name.kind !== "IDENT") {
        // Punning (`{ x, y }`) is intentionally unavailable in this profile.
        if (name.kind === "COMMA" || name.kind === "RBRACE") {
          this.unsupported(name, "record-punning patterns are not supported in `preview-web-1`; write `{ field = binding, ... }`");
        }
        this.unexpected(name, "a record field name");
      }
      this.advance();
      // Require `= <pattern>` — no punning.
      if (!this.check("EQUALS")) {
        this.unsupported(this.cur(), "record-punning patterns are not supported in `preview-web-1`; write `{ field = binding, ... }`");
      }
      this.advance();
      const pat = this.parsePattern(0);
      fields.push({
        name: name.lexeme,
        nameSpan: name.span,
        pattern: pat,
        span: makeSpan(this.file, name.span.start, pat.span.end),
      });
      if (this.accept("COMMA")) continue;
      break;
    }
    const rb = this.expect("RBRACE", "'}' to close record pattern");
    return {
      kind: "PatternRecord",
      constructor: constructor ? { name: constructor.lexeme, span: constructor.span } : null,
      fields,
      span: makeSpan(this.file, startSpan.start, rb.span.end),
    };
  }

  // ---- Expressions ----------------------------------------------------

  private parseExpr(minCol: number): Expr {
    // Prefix-forming expressions: lambda, let, case.
    const t = this.cur();
    if (t.kind === "BACKSLASH") return this.parseLambda(minCol);
    if (t.kind === "LET") return this.parseLet(minCol);
    if (t.kind === "CASE") return this.parseCase(minCol);
    return this.parseInfix(minCol, 0);
  }

  private parseInfix(minCol: number, minPrec: number): Expr {
    let left = this.parseApp(minCol);
    while (true) {
      const t = this.cur();
      if (t.kind === "EOF") break;
      if (t.span.start.column <= minCol) break;
      if (t.kind === "OP_UNKNOWN") {
        this.unsupported(t, `operator '${t.lexeme}' is not in the preview operator table`);
      }
      const op = tokenToInfixOp(t.kind);
      if (!op) break;
      const info = INFIX_TABLE[op];
      if (info.precedence < minPrec) break;
      // Non-associative operators cannot chain at the same precedence.
      if (info.associativity === "none" && info.precedence === minPrec) {
        throw new Bail({
          code: "BLACK_PARSE_UNEXPECTED_TOKEN",
          message: `operator '${op}' is non-associative and cannot chain at the same precedence`,
          span: t.span,
        });
      }
      const opTok = this.advance();
      const nextMin = info.associativity === "left" ? info.precedence + 1 : info.precedence;
      const right = this.parseInfix(minCol, nextMin);
      left = {
        kind: "ExprInfix",
        op,
        opSpan: opTok.span,
        left,
        right,
        span: makeSpan(this.file, left.span.start, right.span.end),
      };
    }
    return left;
  }

  private parseApp(minCol: number): Expr {
    let head = this.parseAtomWithPostfix(minCol);
    while (true) {
      const t = this.cur();
      if (t.kind === "EOF") break;
      if (t.span.start.column <= minCol) break;
      if (!canStartExprAtom(t.kind)) break;
      const arg = this.parseAtomWithPostfix(minCol);
      head = {
        kind: "ExprApp",
        fn: head,
        arg,
        span: makeSpan(this.file, head.span.start, arg.span.end),
      };
    }
    return head;
  }

  private parseAtomWithPostfix(minCol: number): Expr {
    let atom = this.parseAtom(minCol);
    while (true) {
      const t = this.cur();
      if (t.kind === "DOT") {
        // `record.field` or module-qualified access `Alias.Name` (§10). The
        // segment after '.' may be either an IDENT (structural field or
        // qualified term) or a CONID (qualified constructor). The resolver
        // distinguishes qualified access from structural field access by
        // checking whether the record head is a known module alias.
        const dot = this.advance();
        const nextTok = this.cur();
        if (nextTok.kind !== "IDENT" && nextTok.kind !== "CONID") {
          this.unexpected(nextTok, "a field name or qualified constructor after '.'");
        }
        this.advance();
        atom = {
          kind: "ExprField",
          record: atom,
          field: nextTok.lexeme,
          fieldSpan: nextTok.span,
          span: makeSpan(this.file, atom.span.start, nextTok.span.end),
        };
        void dot;
        continue;
      }
      if (t.kind === "LBRACE"
          && atom.span.end.line === t.span.start.line
          && (atom.kind === "ExprVar" || atom.kind === "ExprField" || atom.kind === "ExprCon")) {
        // Record update: `<atom> { field = value, ... }` where the '{' is on
        // the same line as `atom`.
        const startSpan = atom.span;
        const lb = this.advance();
        const fields = this.parseRecordFieldValueList();
        const rb = this.expect("RBRACE", "'}' to close record update");
        atom = {
          kind: "ExprRecordUpdate",
          record: atom,
          fields,
          span: makeSpan(this.file, startSpan.start, rb.span.end),
        };
        void lb;
        continue;
      }
      break;
    }
    return atom;
  }

  private parseAtom(minCol: number): Expr {
    const t = this.cur();
    if (t.kind === "INT") {
      this.advance();
      const n = parseIntStrict(t.lexeme);
      return { kind: "ExprInt", value: n, text: t.lexeme, span: t.span };
    }
    if (t.kind === "FLOAT") {
      this.advance();
      return { kind: "ExprFloat", value: Number(t.lexeme), text: t.lexeme, span: t.span };
    }
    if (t.kind === "STRING") {
      this.advance();
      return { kind: "ExprString", value: decodeStringLexeme(t.lexeme), span: t.span };
    }
    if (t.kind === "TRUE" || t.kind === "FALSE") {
      this.advance();
      return { kind: "ExprBool", value: t.kind === "TRUE", span: t.span };
    }
    if (t.kind === "IDENT") {
      this.advance();
      return { kind: "ExprVar", name: t.lexeme, span: t.span };
    }
    if (t.kind === "CONID") {
      this.advance();
      return { kind: "ExprCon", name: t.lexeme, span: t.span };
    }
    if (t.kind === "LPAREN") {
      const lp = this.advance();
      if (this.check("RPAREN")) {
        const rp = this.advance();
        return { kind: "ExprUnit", span: makeSpan(this.file, lp.span.start, rp.span.end) };
      }
      const inner = this.parseExpr(0);
      const rp = this.expect("RPAREN", "')' to close parenthesized expression");
      return {
        kind: "ExprParen",
        inner,
        span: makeSpan(this.file, lp.span.start, rp.span.end),
      };
    }
    if (t.kind === "LBRACE") {
      return this.parseRecordConstruction(minCol);
    }
    if (t.kind === "LBRACK") {
      return this.parseListLiteral(minCol);
    }
    // Reserved words that cannot start an atom.
    if (t.kind === "LET" || t.kind === "CASE" || t.kind === "BACKSLASH") {
      // Should be handled at parseExpr; encountering here means we tried to
      // start an atom with a non-atom construct (e.g. as an application
      // argument). Require parentheses.
      throw new Bail({
        code: "BLACK_PARSE_UNEXPECTED_TOKEN",
        message: `${describeToken(t)} cannot appear here; wrap it in parentheses to use as an argument`,
        span: t.span,
      });
    }
    if (t.kind === "OP_MINUS") {
      // Unary minus is not supported in the preview profile.
      this.unsupported(t, "unary '-' is not supported; use `0 - x` or `(0.0 - x)` for negation");
    }
    if (t.kind === "UNDERSCORE") {
      // Canonical Black permits underscore-lambda shorthand (`_ + 1`, `_.name`)
      // but the preview intentionally omits it. `_` remains valid as a pattern
      // (including in lambda parameters via `\_ -> ...`).
      this.unsupported(t, "underscore-lambda shorthand is not supported in `preview-web-1`; use an explicit lambda like `\\x -> x + 1`");
    }
    if (t.kind === "OP_UNKNOWN") {
      this.unsupported(t, `operator '${t.lexeme}' is not in the preview operator table`);
    }
    this.unexpected(t, "an expression");
  }

  private parseRecordConstruction(minCol: number): Expr {
    const lb = this.expect("LBRACE");
    void minCol;
    if (this.check("RBRACE")) {
      const rb = this.advance();
      return {
        kind: "ExprRecord",
        fields: [],
        span: makeSpan(this.file, lb.span.start, rb.span.end),
      };
    }
    const fields = this.parseRecordFieldValueList();
    const rb = this.expect("RBRACE", "'}' to close record construction");
    return {
      kind: "ExprRecord",
      fields,
      span: makeSpan(this.file, lb.span.start, rb.span.end),
    };
  }

  private parseRecordFieldValueList(): RecordFieldValue[] {
    const fields: RecordFieldValue[] = [];
    while (true) {
      const name = this.cur();
      if (name.kind !== "IDENT") {
        if (name.kind === "COMMA" || name.kind === "RBRACE") {
          this.unsupported(name, "record punning is not supported in `preview-web-1`; write `field = value`");
        }
        this.unexpected(name, "a record field name");
      }
      this.advance();
      if (!this.check("EQUALS")) {
        this.unsupported(this.cur(), "record punning is not supported in `preview-web-1`; write `field = value`");
      }
      this.advance();
      const value = this.parseExpr(0);
      fields.push({
        name: name.lexeme,
        nameSpan: name.span,
        value,
        span: makeSpan(this.file, name.span.start, value.span.end),
      });
      if (this.accept("COMMA")) continue;
      break;
    }
    return fields;
  }

  private parseListLiteral(minCol: number): Expr {
    void minCol;
    const lb = this.expect("LBRACK");
    const elements: Expr[] = [];
    if (this.check("RBRACK")) {
      const rb = this.advance();
      return {
        kind: "ExprList",
        elements,
        span: makeSpan(this.file, lb.span.start, rb.span.end),
      };
    }
    while (true) {
      elements.push(this.parseExpr(0));
      if (this.accept("COMMA")) continue;
      break;
    }
    const rb = this.expect("RBRACK", "']' to close list literal");
    return {
      kind: "ExprList",
      elements,
      span: makeSpan(this.file, lb.span.start, rb.span.end),
    };
  }

  private parseLambda(minCol: number): Expr {
    const bs = this.expect("BACKSLASH");
    if (this.check("ARROW")) {
      this.unexpected(this.cur(), "at least one lambda parameter before '->'");
    }
    const params: Pattern[] = [];
    while (!this.check("ARROW")) {
      const t = this.cur();
      if (t.kind === "EOF") this.unexpected(t, "'->' in lambda");
      params.push(this.parsePatternAtom(minCol));
    }
    this.expect("ARROW", "'->' in lambda");
    const body = this.parseExpr(minCol);
    return {
      kind: "ExprLambda",
      params,
      body,
      span: makeSpan(this.file, bs.span.start, body.span.end),
    };
  }

  private parseLet(minCol: number): Expr {
    const kw = this.expect("LET");
    if (this.check("IN")) {
      this.unexpected(this.cur(), "at least one binding in `let`");
    }
    const bindRefCol = this.cur().span.start.column;
    if (bindRefCol <= minCol) {
      this.layoutError(this.cur(), "`let` bindings must be indented past the surrounding block");
    }
    const bindings: LetBinding[] = [];
    while (true) {
      bindings.push(this.parseLetBinding(bindRefCol));
      const t = this.cur();
      if (t.kind === "IN") break;
      if (t.kind === "EOF") this.unexpected(t, "'in' after `let` bindings");
      if (t.span.start.column === bindRefCol) continue;
      if (t.span.start.column < bindRefCol) {
        // Any dedent before `in` is a layout error.
        this.layoutError(t, "expected another binding or `in`");
      }
      this.layoutError(t, "unexpected token after `let` binding; expected sibling binding or `in`");
    }
    this.expect("IN");
    const body = this.parseExpr(minCol);
    return {
      kind: "ExprLet",
      bindings,
      body,
      span: makeSpan(this.file, kw.span.start, body.span.end),
    };
  }

  private parseLetBinding(refCol: number): LetBinding {
    const nameTok = this.expect("IDENT", "a binding name");
    if (nameTok.span.start.column !== refCol) {
      this.layoutError(nameTok, `expected binding at column ${refCol}`);
    }
    const params: Pattern[] = [];
    while (!this.check("EQUALS")) {
      const t = this.cur();
      if (t.kind === "EOF") this.unexpected(t, "'=' in `let` binding");
      if (t.span.start.column <= refCol) this.layoutError(t, "unexpected dedent while parsing binding parameters");
      params.push(this.parsePatternAtom(refCol));
    }
    this.expect("EQUALS", "'=' in `let` binding");
    const body = this.parseExpr(refCol);
    return {
      name: nameTok.lexeme,
      nameSpan: nameTok.span,
      params,
      body,
      span: makeSpan(this.file, nameTok.span.start, body.span.end),
    };
  }

  private parseCase(minCol: number): Expr {
    const kw = this.expect("CASE");
    const scrutinee = this.parseInfix(minCol, 0);
    this.expect("OF", "'of' in `case` expression");
    const branchRefCol = this.cur().span.start.column;
    if (branchRefCol <= minCol) {
      this.layoutError(this.cur(), "`case` branches must be indented past the surrounding block");
    }
    const branches: CaseBranch[] = [];
    while (true) {
      branches.push(this.parseCaseBranch(branchRefCol));
      const t = this.cur();
      if (t.kind === "EOF") break;
      if (t.span.start.column === branchRefCol && canStartPatternAtom(t.kind)) continue;
      if (t.span.start.column > branchRefCol) {
        // Continuation of the previous branch body — should have been
        // consumed. Treat as layout error.
        this.layoutError(t, "unexpected token following case branch body");
      }
      // Dedent past ref col: end of case.
      break;
    }
    const last = branches[branches.length - 1]!;
    return {
      kind: "ExprCase",
      scrutinee,
      branches,
      span: makeSpan(this.file, kw.span.start, last.span.end),
    };
  }

  private parseCaseBranch(refCol: number): CaseBranch {
    const patTok = this.cur();
    if (patTok.span.start.column !== refCol) {
      this.layoutError(patTok, `expected case branch at column ${refCol}`);
    }
    const pattern = this.parsePattern(refCol);
    this.expect("ARROW", "'->' in case branch");
    const body = this.parseExpr(refCol);
    return {
      pattern,
      body,
      span: makeSpan(this.file, pattern.span.start, body.span.end),
    };
  }

  // ---- Utilities ------------------------------------------------------

  private checkAtCol(kind: TokenKind, minCol: number): boolean {
    const t = this.cur();
    if (t.kind !== kind) return false;
    return t.span.start.column > minCol;
  }
}

function canStartExprAtom(kind: TokenKind): boolean {
  switch (kind) {
    case "IDENT":
    case "CONID":
    case "INT":
    case "FLOAT":
    case "STRING":
    case "TRUE":
    case "FALSE":
    case "LPAREN":
    case "LBRACE":
    case "LBRACK":
      return true;
    default:
      return false;
  }
}

function canStartPatternAtom(kind: TokenKind): boolean {
  switch (kind) {
    case "IDENT":
    case "CONID":
    case "INT":
    case "FLOAT":
    case "STRING":
    case "TRUE":
    case "FALSE":
    case "UNDERSCORE":
    case "LPAREN":
    case "LBRACE":
      return true;
    default:
      return false;
  }
}

function canStartTypeAtom(kind: TokenKind): boolean {
  switch (kind) {
    case "IDENT":
    case "CONID":
    case "LPAREN":
    case "LBRACE":
      return true;
    default:
      return false;
  }
}

function describeToken(t: Token): string {
  switch (t.kind) {
    case "EOF": return "end of input";
    case "IDENT": return `identifier '${t.lexeme}'`;
    case "CONID": return `constructor '${t.lexeme}'`;
    case "INT": return `integer '${t.lexeme}'`;
    case "FLOAT": return `float '${t.lexeme}'`;
    case "STRING": return `string literal`;
    case "OP_UNKNOWN": return `unknown operator '${t.lexeme}'`;
    default: return `token '${t.lexeme}'`;
  }
}

function joinSpanRange(spans: Span[]): Span {
  if (spans.length === 0) throw new Error("joinSpanRange: empty");
  const first = spans[0]!;
  const last = spans[spans.length - 1]!;
  return { file: first.file, start: first.start, end: last.end };
}

function parseIntStrict(text: string): number {
  // The lexer guarantees text matches [0-9]+.
  const n = Number(text);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function decodeStringLexeme(lexeme: string): string {
  // The lexeme includes surrounding quotes. Decode escapes.
  const inner = lexeme.startsWith('"') && lexeme.endsWith('"') && lexeme.length >= 2
    ? lexeme.slice(1, -1)
    : lexeme.replace(/^"/, "").replace(/"$/, "");
  let out = "";
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i]!;
    if (ch === "\\" && i + 1 < inner.length) {
      const esc = inner[i + 1]!;
      switch (esc) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case "\\": out += "\\"; break;
        case "\"": out += "\""; break;
        default: out += esc; break;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// Position/Span exports for consumers.
export type { Position, Span };
