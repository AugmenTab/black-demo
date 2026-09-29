// ResolvedType → semantic `Ty` conversion (§8, §9, §11).
//
// This pass consults the type-constructor environment for arity, records
// arity-mismatch and unbound-type-variable diagnostics, and rejects alias
// cycles. It runs once per program: after registering every type identity
// and once alias bodies are known.

import type { Diagnostic } from "../../white/output/diagnostics.js";
import type {
  DefId,
  DefinitionRecord,
  ResolvedProgram,
  ResolvedType,
  ResolvedTypeRecordField,
  ResolvedVariantAlt,
  ResolvedVariantPayload,
} from "../resolver/types.js";
import type { Scheme, Ty, TyRigid } from "./types.js";
import {
  monoScheme,
  tyCon,
  tyFun,
  tyRecord,
  tyRigid,
  TyErrorSingleton,
  TyUnitSingleton,
} from "./types.js";
import type { SchemeEnv, TypeConEnv, VariantConstructor } from "./env.js";
import { registerTyCon, lookupTyCon } from "./env.js";
import { typeCodes, typeDiag } from "./diagnostics.js";

// Convert one `ResolvedType` inside a fully populated type environment.
// `rigidsByDefId` maps signature/type-decl variable DefIds to their rigid
// vars — passed in by the caller so that instantiation later can bind them
// consistently.
export interface ConvertCtx {
  env: TypeConEnv;
  file: string;
  program: ResolvedProgram;
  rigidsByDefId: Map<number, TyRigid>;
  diagnostics: Diagnostic[];
}

export function convertType(node: ResolvedType, ctx: ConvertCtx): Ty {
  switch (node.kind) {
    case "TypeUnit":
      return TyUnitSingleton;
    case "TypeVarRef": {
      const ref = node.ref;
      if ("kind" in ref && ref.kind === "unresolved") {
        // Resolver already reported. Fall through as an error type so callers
        // don't cascade.
        return TyErrorSingleton;
      }
      const resolved = ref as { id: DefId; name: string };
      const rigid = ctx.rigidsByDefId.get(resolved.id.value);
      if (rigid !== undefined) return rigid;
      // A `TypeVar` reference outside a signature/typeDecl scope is an
      // unbound type variable (§9).
      ctx.diagnostics.push(
        typeDiag({
          code: typeCodes.unboundVariable,
          message: `unbound type variable '${resolved.name}'`,
          file: ctx.file,
          span: node.span,
          details: { name: resolved.name },
        }),
      );
      return TyErrorSingleton;
    }
    case "TypeConRef": {
      // Type-constructor application must be checked separately at the
      // enclosing `TypeApp` node. Bare `TypeConRef` requires arity 0.
      return applyTypeCon(node, [], ctx);
    }
    case "TypeApp": {
      // Peel every TypeApp to collect the head `TypeConRef` plus arguments
      // in source order.
      const args: ResolvedType[] = [];
      let head: ResolvedType = node;
      while (head.kind === "TypeApp") {
        args.unshift(head.arg);
        head = head.head;
      }
      if (head.kind === "TypeConRef") {
        const argTys = args.map((a) => convertType(a, ctx));
        return applyTypeCon(head, argTys, ctx);
      }
      // Applying a non-constructor is not supported in `preview-web-1`.
      ctx.diagnostics.push(
        typeDiag({
          code: typeCodes.unsupportedFeature,
          message: `higher-kinded type application is not supported in preview-web-1`,
          file: ctx.file,
          span: node.span,
        }),
      );
      return TyErrorSingleton;
    }
    case "TypeFun":
      return tyFun(convertType(node.from, ctx), convertType(node.to, ctx));
    case "TypeRecord": {
      const seen = new Set<string>();
      const fields: { name: string; ty: Ty }[] = [];
      for (const f of node.fields) {
        if (seen.has(f.name)) {
          ctx.diagnostics.push(
            typeDiag({
              code: typeCodes.duplicateRecordField,
              message: `duplicate record field '${f.name}'`,
              file: ctx.file,
              span: f.nameSpan,
              details: { field: f.name },
            }),
          );
          continue;
        }
        seen.add(f.name);
        fields.push({ name: f.name, ty: convertType(f.fieldType, ctx) });
      }
      return tyRecord(fields);
    }
    case "TypeParen":
      return convertType(node.inner, ctx);
  }
}

function applyTypeCon(
  head: Extract<ResolvedType, { kind: "TypeConRef" }>,
  args: Ty[],
  ctx: ConvertCtx,
): Ty {
  const ref = head.ref;
  if ("kind" in ref && ref.kind === "unresolved") return TyErrorSingleton;
  const resolved = ref as { id: DefId; name: string };
  const info = lookupTyCon(ctx.env, resolved.id);
  if (!info) {
    // No metadata: this is a genuine internal inconsistency (resolver said
    // OK but the type wasn't registered). Emit an unsupported-feature error
    // to preserve the boundary between "invalid Black" and "preview limit".
    ctx.diagnostics.push(
      typeDiag({
        code: typeCodes.unsupportedFeature,
        message: `type constructor '${resolved.name}' is not typeable in preview-web-1`,
        file: ctx.file,
        span: head.span,
      }),
    );
    return TyErrorSingleton;
  }
  if (info.arity !== args.length) {
    ctx.diagnostics.push(
      typeDiag({
        code: typeCodes.arityMismatch,
        message: `type constructor '${info.name}' expects ${info.arity} argument(s) but got ${args.length}`,
        file: ctx.file,
        span: head.span,
        details: { name: info.name, expected: info.arity, actual: args.length },
      }),
    );
    return TyErrorSingleton;
  }
  return tyCon(resolved.id, args);
}

// Register every user type in the program: aliases first (with cycle
// rejection), then variants (which need their constructor payloads
// converted). Signature-scoped type variables are handled per-declaration
// later, but type-declaration-scoped variables must fail here since
// preview-web-1 does not support parameterized user types (§9).
export function registerUserTypes(
  program: ResolvedProgram,
  env: TypeConEnv,
  schemes: SchemeEnv,
  diagnostics: Diagnostic[],
): void {
  // First pass: allocate placeholders for every user type (alias/variant),
  // so that mutually referring types can be forward-declared.
  interface Pending {
    file: string;
    kind: "alias" | "variant";
    name: string;
    defId: DefId;
    node: ResolvedType | null; // alias body
    variantAlts: ResolvedVariantAlt[] | null;
  }
  const pending: Pending[] = [];
  for (const rmod of program.modules.values()) {
    for (const decl of rmod.declarations) {
      if (decl.kind === "DeclTypeAlias") {
        pending.push({
          file: rmod.file,
          kind: "alias",
          name: decl.name,
          defId: decl.defId,
          node: decl.body,
          variantAlts: null,
        });
        // Provisional registration so lookups during the second pass find
        // the identity. Body will be rewritten below.
        registerTyCon(env, decl.defId, {
          kind: "alias",
          name: decl.name,
          arity: 0,
          body: TyErrorSingleton,
        });
      } else if (decl.kind === "DeclVariant") {
        pending.push({
          file: rmod.file,
          kind: "variant",
          name: decl.name,
          defId: decl.defId,
          node: null,
          variantAlts: decl.alternatives,
        });
        registerTyCon(env, decl.defId, {
          kind: "variant",
          name: decl.name,
          arity: 0,
          constructors: [],
        });
      }
    }
  }

  // Second pass: convert bodies. Alias-cycle detection is a DFS over alias
  // identities discovered while walking a candidate body.
  for (const p of pending) {
    if (p.kind === "alias") {
      const rigidsByDefId = new Map<number, TyRigid>();
      // Cycle detection: while converting an alias body, walk its `TypeConRef`
      // chain of alias identities. If we return to the same alias identity
      // before hitting a non-alias constructor, reject.
      if (detectAliasCycle(p.defId, p.node!, program, diagnostics, p.file)) {
        // Emit and leave placeholder body as TyError.
        continue;
      }
      const ctx: ConvertCtx = {
        env,
        file: p.file,
        program,
        rigidsByDefId,
        diagnostics,
      };
      const body = convertType(p.node!, ctx);
      // Rewrite the previously registered alias body.
      registerTyCon(env, p.defId, {
        kind: "alias",
        name: p.name,
        arity: 0,
        body,
      });
    }
  }

  // Third pass: convert variant payloads. Variants are DefId-identified so
  // they need no cycle rejection — recursion is fine.
  for (const p of pending) {
    if (p.kind === "variant") {
      const rigidsByDefId = new Map<number, TyRigid>();
      const ctx: ConvertCtx = {
        env,
        file: p.file,
        program,
        rigidsByDefId,
        diagnostics,
      };
      const constructors: VariantConstructor[] = [];
      const variantTy = tyCon(p.defId);
      for (const alt of p.variantAlts!) {
        const payload = convertVariantPayload(alt.payload, ctx);
        constructors.push({ id: alt.defId, name: alt.name, payload });
        // Register a term scheme for the constructor. Nullary alternatives
        // are pure values (`Circle :: Shape`); alternatives with a payload
        // are one-argument constructors (`Some :: a -> Maybe a`).
        const conTy: Ty = payload === null ? variantTy : tyFun(payload, variantTy);
        const scheme: Scheme = monoScheme(conTy);
        schemes.byDefId.set(alt.defId.value, scheme);
      }
      registerTyCon(env, p.defId, {
        kind: "variant",
        name: p.name,
        arity: 0,
        constructors,
      });
    }
  }
}

function convertVariantPayload(payload: ResolvedVariantPayload, ctx: ConvertCtx): Ty | null {
  switch (payload.kind) {
    case "None":
      return null;
    case "Type":
      return convertType(payload.type, ctx);
    case "Record": {
      const seen = new Set<string>();
      const fields: { name: string; ty: Ty }[] = [];
      for (const f of payload.fields) {
        if (seen.has(f.name)) {
          ctx.diagnostics.push(
            typeDiag({
              code: typeCodes.duplicateRecordField,
              message: `duplicate record field '${f.name}' in variant payload`,
              file: ctx.file,
              span: f.nameSpan,
              details: { field: f.name },
            }),
          );
          continue;
        }
        seen.add(f.name);
        fields.push({ name: f.name, ty: convertType(f.fieldType, ctx) });
      }
      return tyRecord(fields);
    }
  }
}

// Alias-cycle detection: DFS over alias references reachable from the body.
function detectAliasCycle(
  rootAlias: DefId,
  body: ResolvedType,
  program: ResolvedProgram,
  diagnostics: Diagnostic[],
  file: string,
): boolean {
  const visiting = new Set<number>([rootAlias.value]);

  const aliasesByDefId = new Map<number, ResolvedType>();
  for (const rmod of program.modules.values()) {
    for (const decl of rmod.declarations) {
      if (decl.kind === "DeclTypeAlias") {
        aliasesByDefId.set(decl.defId.value, decl.body);
      }
    }
  }

  function walk(node: ResolvedType): boolean {
    switch (node.kind) {
      case "TypeUnit":
      case "TypeVarRef":
        return false;
      case "TypeConRef": {
        if ("kind" in node.ref && node.ref.kind === "unresolved") return false;
        const ref = node.ref as { id: DefId; name: string };
        if (visiting.has(ref.id.value)) {
          const rootName = program.definitions.get(rootAlias.value)?.name ?? "?";
          diagnostics.push(
            typeDiag({
              code: typeCodes.aliasCycle,
              message: `transparent alias cycle involving '${rootName}'`,
              file,
              span: node.span,
              details: { root: rootName, via: ref.name },
            }),
          );
          return true;
        }
        const aliasBody = aliasesByDefId.get(ref.id.value);
        if (aliasBody !== undefined) {
          visiting.add(ref.id.value);
          const cyc = walk(aliasBody);
          visiting.delete(ref.id.value);
          return cyc;
        }
        return false;
      }
      case "TypeApp":
        return walk(node.head) || walk(node.arg);
      case "TypeFun":
        return walk(node.from) || walk(node.to);
      case "TypeRecord":
        return node.fields.some((f: ResolvedTypeRecordField) => walk(f.fieldType));
      case "TypeParen":
        return walk(node.inner);
    }
  }

  return walk(body);
}

// Suppress unused-import warning for records not used elsewhere.
void undefined as unknown as DefinitionRecord;
