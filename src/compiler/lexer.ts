// Hand-written scanner for the Black preview surface. Reads a source string
// character-by-character and produces a full token stream in one pass.
//
// The lexer emits `COMMENT_LINE` / `COMMENT_DOC` tokens; the parser filters
// them out. This preserves the option of attaching documentation later
// without altering positional behavior.

import { makeSpan, type Position, type Span, type SourceFile } from "./source.js";
import type { Token, TokenKind } from "./token.js";
import { RESERVED_IDENTIFIERS } from "./token.js";

export interface LexError {
  code: "BLACK_LEX_INVALID_CHARACTER"
      | "BLACK_LEX_UNTERMINATED_STRING"
      | "BLACK_LEX_INVALID_ESCAPE"
      | "BLACK_LEX_INVALID_NUMBER";
  message: string;
  span: Span;
}

export interface LexResult {
  tokens: Token[];   // always ends with an EOF token
  errors: LexError[];
}

export function lex(source: SourceFile): LexResult {
  const s = new Scanner(source);
  const tokens: Token[] = [];
  const errors: LexError[] = [];

  while (!s.atEnd()) {
    s.skipInlineWhitespaceAndNewlines();
    if (s.atEnd()) break;
    const t = s.nextToken(errors);
    if (t) tokens.push(t);
  }

  tokens.push({
    kind: "EOF",
    lexeme: "",
    span: makeSpan(source.file, s.position(), s.position()),
  });

  return { tokens, errors };
}

class Scanner {
  private readonly text: string;
  private readonly file: string;
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(source: SourceFile) {
    this.text = source.text;
    this.file = source.file;
  }

  atEnd(): boolean {
    return this.offset >= this.text.length;
  }

  position(): Position {
    return { offset: this.offset, line: this.line, column: this.column };
  }

  private peek(off = 0): string {
    return this.text[this.offset + off] ?? "";
  }

  private advance(): string {
    const ch = this.text[this.offset] ?? "";
    this.offset += 1;
    if (ch === "\n") {
      this.line += 1;
      this.column = 1;
    } else if (ch === "\r") {
      // Handle CR and CRLF: on CR, advance line; if the next char is LF, we'll
      // skip that too when we loop again (it will re-trigger the newline
      // branch). We keep column right so tests don't rely on CR content.
      if (this.text[this.offset] === "\n") {
        // Peek but do not consume; the LF will advance the line itself.
      } else {
        this.line += 1;
        this.column = 1;
      }
    } else {
      this.column += 1;
    }
    return ch;
  }

  private span(start: Position): Span {
    return makeSpan(this.file, start, this.position());
  }

  skipInlineWhitespaceAndNewlines(): void {
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.advance();
      } else {
        break;
      }
    }
  }

  nextToken(errors: LexError[]): Token | null {
    const start = this.position();
    const ch = this.peek();

    // Comments: -- (line) and -- | (doc).
    if (ch === "-" && this.peek(1) === "-") {
      return this.readLineComment(start);
    }

    // Identifiers / keywords / constructors / booleans.
    if (isAsciiLetter(ch) || ch === "_") {
      return this.readWordLike(start);
    }

    // Numeric literals.
    if (isDigit(ch)) {
      return this.readNumber(start, errors);
    }

    // String literals.
    if (ch === '"') {
      return this.readString(start, errors);
    }

    // Punctuation and multi-char operators.
    const punct = this.readPunctuationOrOperator(start);
    if (punct) return punct;

    // Anything else is an invalid character.
    this.advance();
    errors.push({
      code: "BLACK_LEX_INVALID_CHARACTER",
      message: `unexpected character ${JSON.stringify(ch)}`,
      span: this.span(start),
    });
    // Emit an OP_UNKNOWN so the parser can bail cleanly rather than infinite-loop.
    return {
      kind: "OP_UNKNOWN",
      lexeme: ch,
      span: this.span(start),
    };
  }

  private readLineComment(start: Position): Token {
    // Consume the two '-'.
    this.advance();
    this.advance();
    // Doc-comment marker is "-- |" — a single space then a pipe.
    let isDoc = false;
    if (this.peek() === " " && this.peek(1) === "|") {
      isDoc = true;
      this.advance();
      this.advance();
    }
    while (!this.atEnd() && this.peek() !== "\n" && this.peek() !== "\r") {
      this.advance();
    }
    const span = this.span(start);
    const lexeme = this.text.slice(start.offset, this.offset);
    return {
      kind: isDoc ? "COMMENT_DOC" : "COMMENT_LINE",
      lexeme,
      span,
    };
  }

  private readWordLike(start: Position): Token {
    const first = this.peek();
    // Handle `_` alone.
    if (first === "_") {
      this.advance();
      if (isIdentContinue(this.peek())) {
        // `_foo` is not a permitted identifier form in the preview; treat as
        // an ordinary identifier that begins with underscore. But we already
        // consumed the underscore; keep going for a coherent token.
        while (isIdentContinue(this.peek())) this.advance();
        // Optional trailing '?' for question-mark identifiers.
        if (this.peek() === "?") this.advance();
        const span = this.span(start);
        return { kind: "IDENT", lexeme: this.text.slice(start.offset, this.offset), span };
      }
      return { kind: "UNDERSCORE", lexeme: "_", span: this.span(start) };
    }

    while (isIdentContinue(this.peek())) this.advance();
    if (this.peek() === "?") this.advance();

    const lexeme = this.text.slice(start.offset, this.offset);
    const span = this.span(start);
    const reserved = RESERVED_IDENTIFIERS[lexeme];
    if (reserved) {
      return { kind: reserved, lexeme, span };
    }
    const kind: TokenKind = isUppercase(lexeme.charCodeAt(0)) ? "CONID" : "IDENT";
    return { kind, lexeme, span };
  }

  private readNumber(start: Position, errors: LexError[]): Token {
    while (isDigit(this.peek())) this.advance();

    let isFloat = false;
    if (this.peek() === ".") {
      const afterDot = this.peek(1);
      if (isDigit(afterDot)) {
        isFloat = true;
        this.advance(); // consume '.'
        while (isDigit(this.peek())) this.advance();
      } else {
        // Malformed: e.g. `1.` with no fractional digits, or `1.foo`.
        // The `.` is part of a syntactic error in numeric context.
        this.advance(); // consume '.'
        const span = this.span(start);
        errors.push({
          code: "BLACK_LEX_INVALID_NUMBER",
          message: "malformed numeric literal: expected digits after '.'",
          span,
        });
        return {
          kind: "FLOAT",
          lexeme: this.text.slice(start.offset, this.offset),
          span,
        };
      }
    }

    // Reject a trailing dot-plus-digits (like `1.2.3`).
    if (this.peek() === "." && isDigit(this.peek(1))) {
      // Consume the whole extraneous run so we don't loop.
      this.advance();
      while (isDigit(this.peek()) || this.peek() === ".") this.advance();
      const span = this.span(start);
      errors.push({
        code: "BLACK_LEX_INVALID_NUMBER",
        message: "malformed numeric literal: multiple decimal points",
        span,
      });
      return {
        kind: "FLOAT",
        lexeme: this.text.slice(start.offset, this.offset),
        span,
      };
    }

    // Reject identifier characters immediately following a numeric literal.
    if (isIdentContinue(this.peek())) {
      // Absorb the offending run to avoid ambiguity in subsequent tokens.
      while (isIdentContinue(this.peek())) this.advance();
      const span = this.span(start);
      errors.push({
        code: "BLACK_LEX_INVALID_NUMBER",
        message: "malformed numeric literal: identifier characters immediately follow digits",
        span,
      });
      return {
        kind: isFloat ? "FLOAT" : "INT",
        lexeme: this.text.slice(start.offset, this.offset),
        span,
      };
    }

    return {
      kind: isFloat ? "FLOAT" : "INT",
      lexeme: this.text.slice(start.offset, this.offset),
      span: this.span(start),
    };
  }

  private readString(start: Position, errors: LexError[]): Token {
    this.advance(); // opening quote
    let value = "";
    let terminated = false;
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === '"') {
        this.advance();
        terminated = true;
        break;
      }
      if (ch === "\n" || ch === "\r") {
        // Unterminated: newline before closing quote.
        break;
      }
      if (ch === "\\") {
        this.advance();
        const esc = this.peek();
        switch (esc) {
          case "\"": value += "\""; this.advance(); break;
          case "\\": value += "\\"; this.advance(); break;
          case "n": value += "\n"; this.advance(); break;
          case "t": value += "\t"; this.advance(); break;
          case "r": value += "\r"; this.advance(); break;
          case "":
            // EOF right after backslash — treat as invalid escape below.
            errors.push({
              code: "BLACK_LEX_INVALID_ESCAPE",
              message: "invalid escape sequence at end of input",
              span: this.span(start),
            });
            break;
          default:
            errors.push({
              code: "BLACK_LEX_INVALID_ESCAPE",
              message: `invalid escape sequence \\${esc}`,
              span: makeSpan(this.file, { offset: this.offset - 1, line: this.line, column: this.column - 1 }, {
                offset: this.offset + 1,
                line: this.line,
                column: this.column + 1,
              }),
            });
            this.advance();
            break;
        }
        continue;
      }
      value += ch;
      this.advance();
    }
    const span = this.span(start);
    if (!terminated) {
      errors.push({
        code: "BLACK_LEX_UNTERMINATED_STRING",
        message: "unterminated string literal",
        span,
      });
    }
    return {
      kind: "STRING",
      lexeme: this.text.slice(start.offset, this.offset),
      span,
    };
  }

  private readPunctuationOrOperator(start: Position): Token | null {
    const ch = this.peek();
    const next = this.peek(1);
    switch (ch) {
      case "(": this.advance(); return this.tok("LPAREN", "(", start);
      case ")": this.advance(); return this.tok("RPAREN", ")", start);
      case "{": this.advance(); return this.tok("LBRACE", "{", start);
      case "}": this.advance(); return this.tok("RBRACE", "}", start);
      case "[": this.advance(); return this.tok("LBRACK", "[", start);
      case "]": this.advance(); return this.tok("RBRACK", "]", start);
      case ",": this.advance(); return this.tok("COMMA", ",", start);
      case ".": this.advance(); return this.tok("DOT", ".", start);
      case "|": this.advance(); return this.tok("PIPE", "|", start);
      case "\\": this.advance(); return this.tok("BACKSLASH", "\\", start);
      case "+": this.advance(); return this.tok("OP_PLUS", "+", start);
      case "*": this.advance(); return this.tok("OP_STAR", "*", start);
      case "/": this.advance(); return this.tok("OP_SLASH", "/", start);
      case ":":
        if (next === ":") { this.advance(); this.advance(); return this.tok("COLON_COLON", "::", start); }
        // ':' alone is not a supported operator/keyword.
        return this.readSymbolicUnknown(start);
      case "-":
        if (next === ">") { this.advance(); this.advance(); return this.tok("ARROW", "->", start); }
        this.advance();
        return this.tok("OP_MINUS", "-", start);
      case "=":
        if (next === "=") { this.advance(); this.advance(); return this.tok("OP_EQ", "==", start); }
        this.advance();
        return this.tok("EQUALS", "=", start);
      case "<":
        if (next === "=") { this.advance(); this.advance(); return this.tok("OP_LE", "<=", start); }
        this.advance();
        return this.tok("OP_LT", "<", start);
      case ">":
        if (next === "=") { this.advance(); this.advance(); return this.tok("OP_GE", ">=", start); }
        this.advance();
        return this.tok("OP_GT", ">", start);
      case "!":
      case "@":
      case "#":
      case "$":
      case "%":
      case "^":
      case "&":
      case "?":
      case "~":
      case ";":
        return this.readSymbolicUnknown(start);
      default:
        return null;
    }
  }

  private readSymbolicUnknown(start: Position): Token {
    // Absorb a run of symbolic characters so callers don't loop.
    while (!this.atEnd() && isSymbolic(this.peek())) this.advance();
    const lexeme = this.text.slice(start.offset, this.offset);
    return {
      kind: "OP_UNKNOWN",
      lexeme,
      span: this.span(start),
    };
  }

  private tok(kind: TokenKind, lexeme: string, start: Position): Token {
    return { kind, lexeme, span: this.span(start) };
  }
}

function isDigit(ch: string): boolean {
  if (ch.length === 0) return false;
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

function isAsciiLetter(ch: string): boolean {
  if (ch.length === 0) return false;
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isIdentContinue(ch: string): boolean {
  return isAsciiLetter(ch) || isDigit(ch) || ch === "_";
}

function isUppercase(code: number): boolean {
  return code >= 65 && code <= 90;
}

function isSymbolic(ch: string): boolean {
  return (
    ch === "+" || ch === "-" || ch === "*" || ch === "/" ||
    ch === "<" || ch === ">" || ch === "=" || ch === "!" ||
    ch === "@" || ch === "#" || ch === "$" || ch === "%" ||
    ch === "^" || ch === "&" || ch === "|" || ch === ":" ||
    ch === "~" || ch === "?" || ch === ";"
  );
}
