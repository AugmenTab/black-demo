// Deep-copy AST while dropping every `span`, `nameSpan`, `fieldSpan`,
// `opSpan`, and `pathSpan` field. Useful when a test cares about structure
// only. Span tests must inspect real AST separately.

const SPAN_KEYS = new Set([
  "span",
  "nameSpan",
  "fieldSpan",
  "opSpan",
  "pathSpan",
]);

export function stripSpans<T>(node: T): T {
  return strip(node) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SPAN_KEYS.has(k)) continue;
      out[k] = strip(v);
    }
    return out;
  }
  return value;
}
