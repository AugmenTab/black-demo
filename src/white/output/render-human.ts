import type { CommandResult, Diagnostic } from "./diagnostics.js";

export function renderDiagnostic(diag: Diagnostic): string {
  const header = `${diag.severity}[${diag.code}]: ${diag.message}`;
  const lines: string[] = [header];
  if (diag.file) {
    if (diag.span) {
      const { start } = diag.span;
      lines.push(`  at ${diag.file}:${start.line}:${start.column}`);
    } else {
      lines.push(`  at ${diag.file}`);
    }
  }
  if (diag.details) {
    for (const [key, value] of Object.entries(diag.details)) {
      lines.push(`  ${key}: ${formatDetail(value)}`);
    }
  }
  return lines.join("\n");
}

function formatDetail(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function renderHuman(result: CommandResult, extra?: string): string {
  const parts: string[] = [];
  for (const diag of result.diagnostics) {
    parts.push(renderDiagnostic(diag));
  }
  if (extra && extra.length > 0) parts.push(extra);
  return parts.join("\n");
}
