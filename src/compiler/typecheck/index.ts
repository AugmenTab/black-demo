// Phase-4 typechecker public entry point.
//
// Orchestrates the four sub-passes: install the prelude, register user type
// identities, run inference/checking, and finalize into a distinct
// `TypedProgram` (§55, §57, §79).

import type { Diagnostic } from "../../white/output/diagnostics.js";
import type { ResolvedProgram } from "../resolver/types.js";
import type { TypedDecl, TypedProgram } from "./typed-ast.js";
import { makeSchemeEnv, makeTypeConEnv } from "./env.js";
import { MetaStore } from "./subst.js";
import { installPrelude } from "./prelude.js";
import { registerUserTypes } from "./convert.js";
import { finalizeTypedDecls, inferProgram } from "./infer.js";

export interface TypecheckResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  program: TypedProgram | null;
}

export function typecheckProgram(program: ResolvedProgram): TypecheckResult {
  const diagnostics: Diagnostic[] = [];
  const env = makeTypeConEnv();
  const schemes = makeSchemeEnv();
  const store = new MetaStore();

  const prelude = installPrelude(program.prelude, env, schemes);
  registerUserTypes(program, env, schemes, diagnostics);

  const inference = inferProgram({
    program,
    env,
    schemes,
    store,
    prelude,
  });
  diagnostics.push(...inference.diagnostics);

  // Zonk every observable type in the TypedProgram and report residual
  // metas as BLACK_TYPE_AMBIGUOUS (§33, §34).
  const fileByModule = new Map<string, string>();
  for (const rmod of program.modules.values()) {
    fileByModule.set(rmod.moduleId, rmod.file);
  }
  const finalizeDiags: Diagnostic[] = [];
  finalizeTypedDecls(inference.typedDecls, store, fileByModule, finalizeDiags);
  diagnostics.push(...finalizeDiags);

  const modules: TypedProgram["modules"] = new Map();
  for (const rmod of program.modules.values()) {
    const decls: TypedDecl[] = inference.typedDecls.get(rmod.moduleId) ?? [];
    modules.set(rmod.moduleId, {
      moduleId: rmod.moduleId,
      file: rmod.file,
      declarations: decls,
    });
  }

  const ok = !diagnostics.some((d) => d.severity === "error");
  const typedProgram: TypedProgram = {
    entryModule: program.entryModule,
    modules,
    typeConEnv: env,
    schemeEnv: schemes,
  };
  return { ok, diagnostics, program: typedProgram };
}

export type { TypedProgram } from "./typed-ast.js";
