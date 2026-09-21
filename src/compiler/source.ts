// Source-position primitives for the Black front end.
//
// Conventions:
//   line   1-based
//   column 1-based (in UTF-16 code units)
//   offset 0-based (UTF-16 code-unit index into the source string)
//   Spans use inclusive start / exclusive end.

export interface Position {
  offset: number;
  line: number;
  column: number;
}

export interface Span {
  file: string;
  start: Position;
  end: Position;
}

export interface SourceFile {
  file: string;
  text: string;
}

export function makeSourceFile(file: string, text: string): SourceFile {
  return { file, text };
}

export function startOfFile(file: string): Position {
  return { offset: 0, line: 1, column: 1 };
}

export function makeSpan(file: string, start: Position, end: Position): Span {
  return { file, start, end };
}

export function joinSpans(a: Span, b: Span): Span {
  if (a.file !== b.file) {
    // Prefer the first file if they somehow differ; callers should not mix.
    return { file: a.file, start: a.start, end: b.end };
  }
  const start = a.start.offset <= b.start.offset ? a.start : b.start;
  const end = a.end.offset >= b.end.offset ? a.end : b.end;
  return { file: a.file, start, end };
}

export function spanContains(outer: Span, inner: Span): boolean {
  if (outer.file !== inner.file) return false;
  return outer.start.offset <= inner.start.offset && outer.end.offset >= inner.end.offset;
}

export function spanIsEmpty(s: Span): boolean {
  return s.start.offset === s.end.offset;
}

// Diagnostic-compatible span (line/column only, no offset).
export function toDiagnosticSpan(span: Span): {
  start: { line: number; column: number };
  end: { line: number; column: number };
} {
  return {
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}
