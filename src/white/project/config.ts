import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Diagnostic } from "../output/diagnostics.js";
import { codes, makeDiagnostic, PROFILE } from "../output/diagnostics.js";

export interface ProjectConfig {
  project: {
    name: string;
    profile: "preview-web-1";
  };
  target: {
    kind: "node";
    entry: string;
  };
}

export interface LoadedConfig {
  configPath: string;
  projectRoot: string;
  config: ProjectConfig;
  absoluteEntry: string;
}

export type ConfigLoad =
  | { ok: true; loaded: LoadedConfig; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

const SUPPORTED_TARGETS = new Set(["node"]);

export async function loadProjectConfig(
  configPath: string,
  projectRoot: string,
): Promise<ConfigLoad> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    return {
      ok: false,
      diagnostics: [
        makeDiagnostic({
          code: codes.configParseError,
          kind: "project",
          message: `cannot read ${configPath}: ${(err as Error).message}`,
          file: configPath,
        }),
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (err) {
    return {
      ok: false,
      diagnostics: [
        makeDiagnostic({
          code: codes.configParseError,
          kind: "project",
          message: `invalid TOML: ${(err as Error).message}`,
          file: configPath,
        }),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const obj = parsed as Record<string, unknown>;
  const project = asRecord(obj["project"]);
  const target = asRecord(obj["target"]);

  if (!project) {
    diagnostics.push(missingField("project", configPath));
  }
  if (!target) {
    diagnostics.push(missingField("target", configPath));
  }

  const name = project ? asString(project["name"]) : undefined;
  const profile = project ? asString(project["profile"]) : undefined;
  const kind = target ? asString(target["kind"]) : undefined;
  const entry = target ? asString(target["entry"]) : undefined;

  if (project && (!name || name.trim().length === 0)) {
    diagnostics.push(missingField("project.name", configPath));
  }
  if (project && !profile) {
    diagnostics.push(missingField("project.profile", configPath));
  } else if (profile && profile !== PROFILE) {
    diagnostics.push(
      makeDiagnostic({
        code: codes.unsupportedProfile,
        kind: "project",
        message: `profile "${profile}" is not supported; expected "${PROFILE}"`,
        file: configPath,
        details: { expected: PROFILE, actual: profile },
      }),
    );
  }

  if (target && !kind) {
    diagnostics.push(missingField("target.kind", configPath));
  } else if (kind && !SUPPORTED_TARGETS.has(kind)) {
    diagnostics.push(
      makeDiagnostic({
        code: codes.unsupportedTarget,
        kind: "project",
        message: `target kind "${kind}" is not supported in ${PROFILE}`,
        file: configPath,
        details: { expected: [...SUPPORTED_TARGETS], actual: kind },
      }),
    );
  }

  if (target && (!entry || entry.trim().length === 0)) {
    diagnostics.push(missingField("target.entry", configPath));
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const entryStr = entry as string;
  const resolvedEntry = path.resolve(projectRoot, entryStr);
  const projectRootAbs = path.resolve(projectRoot);
  const rel = path.relative(projectRootAbs, resolvedEntry);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    diagnostics.push(
      makeDiagnostic({
        code: codes.entryNotFound,
        kind: "project",
        message: `entry "${entryStr}" escapes the project root`,
        file: configPath,
        details: { entry: entryStr },
      }),
    );
    return { ok: false, diagnostics };
  }

  if (path.extname(resolvedEntry) !== ".blk") {
    diagnostics.push(
      makeDiagnostic({
        code: codes.entryNotBlack,
        kind: "project",
        message: `entry must have .blk extension`,
        file: resolvedEntry,
        details: { entry: entryStr },
      }),
    );
    return { ok: false, diagnostics };
  }

  if (!existsSync(resolvedEntry)) {
    diagnostics.push(
      makeDiagnostic({
        code: codes.entryNotFound,
        kind: "project",
        message: `entry file does not exist`,
        file: resolvedEntry,
        details: { entry: entryStr },
      }),
    );
    return { ok: false, diagnostics };
  }

  const loaded: LoadedConfig = {
    configPath,
    projectRoot: projectRootAbs,
    absoluteEntry: resolvedEntry,
    config: {
      project: { name: name as string, profile: PROFILE },
      target: { kind: "node", entry: entryStr },
    },
  };
  return { ok: true, loaded, diagnostics: [] };
}

function missingField(field: string, file: string): Diagnostic {
  return makeDiagnostic({
    code: codes.configMissingField,
    kind: "project",
    message: `missing required field: ${field}`,
    file,
    details: { field },
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
