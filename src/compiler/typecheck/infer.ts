// Core inference/checking for Phase 4.
//
// This module implements ordinary rank-1 Hindley–Milner over the
// preview-web-1 subset. Function bodies are checked against their explicit
// signatures with rigid/skolem variables (§17); use-sites instantiate
// polymorphic schemes with fresh metas (§18); local `let` sequential
// generalization matches the resolver (§19, §20).
//
// Every top-level declaration flows through a two-pass strategy: first
// collect explicit signature schemes for every reachable module (§57); then
// check each function body against its declared scheme.

import type { Diagnostic } from "../../white/output/diagnostics.js";
import type {
  DefId,
  InfixOp,
  LocalBinder,
  MaybeResolvedRef,
  ModuleId,
  ResolvedCaseBranch,
  ResolvedDecl,
  ResolvedDeclDefinition,
  ResolvedDeclSignature,
  ResolvedExpr,
  ResolvedGuardedRhs,
  ResolvedLetBinding,
  ResolvedModule,
  ResolvedPattern,
  ResolvedProgram,
  ResolvedRecordFieldValue,
  ResolvedRef,
  ResolvedType,
} from "../resolver/types.js";

function isResolvedRef(r: MaybeResolvedRef): r is ResolvedRef {
  return !("kind" in r && r.kind === "unresolved");
}
import type { Span } from "../source.js";
import type { Scheme, Ty, TyRigid } from "./types.js";
import {
  monoScheme,
  tyCon,
  tyFun,
  tyMeta,
  tyRecord,
  tyRigid,
  TyErrorSingleton,
  TyUnitSingleton,
} from "./types.js";
import type { TypeConEnv, SchemeEnv } from "./env.js";
import { lookupTyCon } from "./env.js";
import type { MetaStore } from "./subst.js";
import { unify } from "./unify.js";
import { convertType } from "./convert.js";
import type { BuiltPrelude } from "./prelude.js";
import { renderTy } from "./render.js";
import type {
  TypedCaseBranch,
  TypedDecl,
  TypedEquation,
  TypedExpr,
  TypedGuardedRhs,
  TypedLetBinding,
  TypedPattern,
} from "./typed-ast.js";
import { typeCodes, typeDiag } from "./diagnostics.js";
import { isExhaustive, missingConstructors, type Matrix } from "./exhaustiveness.js";

export interface InferenceInput {
  program: ResolvedProgram;
  env: TypeConEnv;
  schemes: SchemeEnv;
  store: MetaStore;
  prelude: BuiltPrelude;
}

export interface InferenceOutput {
  diagnostics: Diagnostic[];
  typedDecls: Map<ModuleId, TypedDecl[]>;
}

interface DefinitionGroup {
  defId: DefId;
  name: string;
  moduleId: ModuleId;
  file: string;
  signature: ResolvedDeclSignature | null;
  equations: ResolvedDeclDefinition[];
  span: Span;
}

// The public entry point. Builds the scheme table for every top-level term
// (from explicit signatures), then checks each body against its scheme.
export function inferProgram(input: InferenceInput): InferenceOutput {
  const diagnostics: Diagnostic[] = [];
  const typedDecls = new Map<ModuleId, TypedDecl[]>();

  const groups = collectDefinitionGroups(input.program);

  // First pass — build the scheme table (§57).
  for (const g of groups) {
    if (g.signature === null) {
      // Implementation without a signature (§15).
      diagnostics.push(
        typeDiag({
          code: typeCodes.missingSignature,
          message: `top-level '${g.name}' is missing an explicit signature`,
          file: g.file,
          span: g.equations[0]!.nameSpan,
          details: { name: g.name, module: g.moduleId },
        }),
      );
      // Assign an error scheme so downstream references don't cascade.
      input.schemes.byDefId.set(g.defId.value, monoScheme(TyErrorSingleton));
      continue;
    }
    if (g.equations.length === 0) {
      // Signature without an implementation (§16).
      diagnostics.push(
        typeDiag({
          code: typeCodes.missingDefinition,
          message: `signature for '${g.name}' has no implementation`,
          file: g.file,
          span: g.signature.nameSpan,
          details: { name: g.name, module: g.moduleId },
        }),
      );
    }
    const scheme = signatureToScheme(g.signature, input, diagnostics, g.file);
    input.schemes.byDefId.set(g.defId.value, scheme);
  }

  // Second pass — check each function body against its scheme.
  for (const g of groups) {
    const scheme = input.schemes.byDefId.get(g.defId.value)!;
    if (g.equations.length === 0) {
      // Signature-only; already reported.
      continue;
    }
    const list = typedDecls.get(g.moduleId) ?? [];
    const checker = new BodyChecker(input, diagnostics, g.file);
    const typedEquations = checker.checkEquations(g, scheme);
    list.push({
      kind: "Definition",
      defId: g.defId,
      name: g.name,
      scheme,
      equations: typedEquations,
      span: g.span,
    });
    typedDecls.set(g.moduleId, list);
  }

  // Add stubs for type declarations so the Typed AST captures every module
  // shape.
  for (const [moduleId, rmod] of input.program.modules) {
    const list = typedDecls.get(moduleId) ?? [];
    for (const d of rmod.declarations) {
      if (d.kind === "DeclTypeAlias") {
        list.push({ kind: "TypeAlias", defId: d.defId, name: d.name, span: d.span });
      } else if (d.kind === "DeclVariant") {
        list.push({ kind: "Variant", defId: d.defId, name: d.name, span: d.span });
      }
    }
    typedDecls.set(moduleId, list);
  }

  return { diagnostics, typedDecls };
}

// Walk the emitted TypedDecls, zonk every `Ty` field, and flag any residual
// `TyMeta` as BLACK_TYPE_AMBIGUOUS (§33, §34). Successful typing must not
// expose unresolved metas in the public TypedProgram surface.
export function finalizeTypedDecls(
  typedDecls: Map<ModuleId, TypedDecl[]>,
  store: MetaStore,
  fileByModule: Map<ModuleId, string>,
  diagnostics: Diagnostic[],
): void {
  const seenMetas = new Set<number>();
  for (const [moduleId, decls] of typedDecls) {
    const file = fileByModule.get(moduleId) ?? "<unknown>";
    for (const d of decls) {
      if (d.kind !== "Definition") continue;
      d.scheme = zonkScheme(d.scheme, store);
      for (const eq of d.equations) {
        for (const p of eq.params) zonkPatternInPlace(p, store);
        if (eq.body) zonkExprInPlace(eq.body, store);
        if (eq.guards) for (const gr of eq.guards) {
          zonkExprInPlace(gr.condition, store);
          zonkExprInPlace(gr.body, store);
        }
      }
      // After zonking, scan for residual metas.
      const metas: { id: number; span: Span }[] = [];
      collectExprMetas(d.equations, store, metas);
      for (const m of metas) {
        if (seenMetas.has(m.id)) continue;
        seenMetas.add(m.id);
        diagnostics.push(
          typeDiag({
            code: typeCodes.ambiguous,
            message: `ambiguous type in '${d.name}' — an inferred type was not resolved`,
            file,
            span: m.span,
            details: { name: d.name },
          }),
        );
      }
    }
  }
}

function zonkScheme(s: Scheme, store: MetaStore): Scheme {
  return { rigids: s.rigids, ty: store.zonk(s.ty) };
}

function zonkExprInPlace(e: TypedExpr, store: MetaStore): void {
  e.ty = store.zonk(e.ty);
  switch (e.kind) {
    case "ExprInt":
    case "ExprFloat":
    case "ExprString":
    case "ExprBool":
    case "ExprUnit":
    case "ExprVarRef":
    case "ExprConRef":
    case "ExprQualified":
      return;
    case "ExprApp":
      zonkExprInPlace(e.fn, store);
      zonkExprInPlace(e.arg, store);
      return;
    case "ExprField":
      zonkExprInPlace(e.record, store);
      return;
    case "ExprRecord":
      for (const f of e.fields) zonkExprInPlace(f.value, store);
      return;
    case "ExprRecordUpdate":
      zonkExprInPlace(e.record, store);
      for (const f of e.fields) zonkExprInPlace(f.value, store);
      return;
    case "ExprList":
      for (const el of e.elements) zonkExprInPlace(el, store);
      return;
    case "ExprLambda":
      for (const p of e.params) zonkPatternInPlace(p, store);
      zonkExprInPlace(e.body, store);
      return;
    case "ExprLet":
      for (const b of e.bindings) {
        b.scheme = zonkScheme(b.scheme, store);
        for (const p of b.params) zonkPatternInPlace(p, store);
        zonkExprInPlace(b.body, store);
      }
      zonkExprInPlace(e.body, store);
      return;
    case "ExprCase":
      zonkExprInPlace(e.scrutinee, store);
      for (const br of e.branches) {
        zonkPatternInPlace(br.pattern, store);
        zonkExprInPlace(br.body, store);
      }
      return;
    case "ExprInfix":
      zonkExprInPlace(e.left, store);
      zonkExprInPlace(e.right, store);
      return;
  }
}

function zonkPatternInPlace(p: TypedPattern, store: MetaStore): void {
  p.ty = store.zonk(p.ty);
  switch (p.kind) {
    case "PatternVar":
    case "PatternWildcard":
    case "PatternInt":
    case "PatternFloat":
    case "PatternString":
    case "PatternBool":
      return;
    case "PatternCon":
      for (const a of p.args) zonkPatternInPlace(a, store);
      return;
    case "PatternRecord":
      for (const f of p.fields) zonkPatternInPlace(f.pattern, store);
      return;
  }
}

function collectExprMetas(
  eqs: TypedEquation[],
  store: MetaStore,
  out: { id: number; span: Span }[],
): void {
  const seen = new Set<number>();
  const addTy = (ty: Ty, span: Span): void => {
    const set = store.freeMetas(ty);
    for (const id of set) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, span });
    }
  };
  const walkExpr = (e: TypedExpr): void => {
    addTy(e.ty, e.span);
    switch (e.kind) {
      case "ExprApp":
        walkExpr(e.fn); walkExpr(e.arg); return;
      case "ExprField":
        walkExpr(e.record); return;
      case "ExprRecord":
        for (const f of e.fields) walkExpr(f.value); return;
      case "ExprRecordUpdate":
        walkExpr(e.record);
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "ExprList":
        for (const el of e.elements) walkExpr(el); return;
      case "ExprLambda":
        for (const p of e.params) walkPattern(p);
        walkExpr(e.body);
        return;
      case "ExprLet":
        for (const b of e.bindings) {
          for (const p of b.params) walkPattern(p);
          walkExpr(b.body);
        }
        walkExpr(e.body);
        return;
      case "ExprCase":
        walkExpr(e.scrutinee);
        for (const br of e.branches) {
          walkPattern(br.pattern);
          walkExpr(br.body);
        }
        return;
      case "ExprInfix":
        walkExpr(e.left); walkExpr(e.right); return;
      default:
        return;
    }
  };
  const walkPattern = (p: TypedPattern): void => {
    addTy(p.ty, p.span);
    switch (p.kind) {
      case "PatternCon":
        for (const a of p.args) walkPattern(a);
        return;
      case "PatternRecord":
        for (const f of p.fields) walkPattern(f.pattern);
        return;
      default:
        return;
    }
  };
  for (const eq of eqs) {
    for (const p of eq.params) walkPattern(p);
    if (eq.body) walkExpr(eq.body);
    if (eq.guards) for (const gr of eq.guards) {
      walkExpr(gr.condition);
      walkExpr(gr.body);
    }
  }
}

function collectDefinitionGroups(program: ResolvedProgram): DefinitionGroup[] {
  const byDefId = new Map<number, DefinitionGroup>();
  for (const rmod of program.modules.values()) {
    for (const decl of rmod.declarations) {
      if (decl.kind === "DeclSignature") {
        const g = getOrMake(byDefId, decl.defId, decl.name, rmod);
        g.signature = decl;
        // Widen span to include the signature.
        g.span = decl.span;
        g.file = rmod.file;
      } else if (decl.kind === "DeclDefinition") {
        const g = getOrMake(byDefId, decl.defId, decl.name, rmod);
        g.equations.push(decl);
        if (g.signature === null) g.span = decl.span;
        g.file = rmod.file;
      }
    }
  }
  return [...byDefId.values()];
}

function getOrMake(
  map: Map<number, DefinitionGroup>,
  defId: DefId,
  name: string,
  rmod: ResolvedModule,
): DefinitionGroup {
  const cur = map.get(defId.value);
  if (cur) return cur;
  const g: DefinitionGroup = {
    defId,
    name,
    moduleId: rmod.moduleId,
    file: rmod.file,
    signature: null,
    equations: [],
    span: rmod.span,
  };
  map.set(defId.value, g);
  return g;
}

function signatureToScheme(
  sig: ResolvedDeclSignature,
  input: InferenceInput,
  diagnostics: Diagnostic[],
  file: string,
): Scheme {
  const rigidsByDefId = new Map<number, TyRigid>();
  const rigids: TyRigid[] = [];
  collectRigids(sig.type, input.program, rigidsByDefId, rigids);
  const ty = convertType(sig.type, {
    env: input.env,
    file,
    program: input.program,
    rigidsByDefId,
    diagnostics,
  });
  return { rigids, ty };
}

function collectRigids(
  node: ResolvedType,
  program: ResolvedProgram,
  by: Map<number, TyRigid>,
  order: TyRigid[],
): void {
  const walk = (n: ResolvedType) => {
    switch (n.kind) {
      case "TypeUnit":
      case "TypeConRef":
        return;
      case "TypeVarRef": {
        const ref = n.ref;
        if ("kind" in ref && ref.kind === "unresolved") return;
        const rref = ref as { id: DefId; name: string };
        if (by.has(rref.id.value)) return;
        // Only signature-scoped type variables should become rigids. The
        // resolver assigns them scope: { kind: "signature", owner }.
        const rec = program.definitions.get(rref.id.value);
        if (!rec || rec.namespace !== "type" || rec.category !== "typeVar") return;
        if (rec.scope.kind !== "signature") return;
        const rigid = tyRigid(rref.id, rref.name);
        by.set(rref.id.value, rigid);
        order.push(rigid);
        return;
      }
      case "TypeApp":
        walk(n.head);
        walk(n.arg);
        return;
      case "TypeFun":
        walk(n.from);
        walk(n.to);
        return;
      case "TypeRecord":
        for (const f of n.fields) walk(f.fieldType);
        return;
      case "TypeParen":
        walk(n.inner);
        return;
    }
  };
  walk(node);
}

class BodyChecker {
  private locals = new Map<number, Ty>();
  // Metas whose eventual concrete resolution is constrained by an operator
  // use with no concrete operand context. If the meta remains unresolved at
  // finalization (§21, §43) we emit BLACK_TYPE_AMBIGUOUS at the recorded
  // operator span. `kind` narrows the admissible set: "numeric" → Int|Float
  // (arith and ordered comparisons); "equatable" → Int|Float|Bool|Text|()
  // (`==` supports scalars including Text/Bool/Unit).
  private pendingNumericMetas = new Map<
    number,
    { span: Span; kind: "numeric" | "equatable"; op: InfixOp }
  >();

  constructor(
    private readonly input: InferenceInput,
    private readonly diagnostics: Diagnostic[],
    private readonly file: string,
  ) {}

  checkEquations(g: DefinitionGroup, scheme: Scheme): TypedEquation[] {
    const { params: paramTys, result } = decomposeArrow(scheme.ty, this.input.env);
    // Preview-web-1 permits an equation to supply *fewer* syntactic params
    // than the signature accepts (its body then returns a function), but
    // *more* is an arity error (§28).
    const out: TypedEquation[] = [];
    for (const eqn of g.equations) {
      out.push(this.checkOneEquation(eqn, paramTys, result, g));
    }
    // Function-equation exhaustiveness across all equations combined (§50).
    // Only equations that contribute *unconditional* coverage feed the
    // matrix — a purely conditional guarded equation cannot prove totality
    // just because its patterns admit every value (§14). See
    // `equationCoversUnconditionally`.
    if (paramTys.length > 0 && out.length > 0) {
      const matrix: Matrix = {
        rows: out
          .filter((e) => e.params.length === paramTys.length)
          .filter((e) => equationCoversUnconditionally(e, this.input.prelude))
          .map((e) => e.params),
        colTypes: paramTys.slice(0, out[0]!.params.length),
      };
      if (matrix.colTypes.length > 0) {
        const ex = matrix.rows.length > 0
          ? isExhaustive(matrix, this.input.env, this.input.store)
          : false;
        if (!ex) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.nonExhaustiveFunction,
              message: `top-level function '${g.name}' is not exhaustive`,
              file: this.file,
              span: g.span,
              details: {
                name: g.name,
                missing:
                  matrix.rows.length > 0
                    ? missingListFromMatrix(matrix, this.input.env, this.input.store)
                    : ["<all inputs — no unconditional equation>"],
              },
            }),
          );
        }
      }
    }
    // Guard-only equations: also apply function-equation coverage rules by
    // treating each guarded RHS as unconditional only when its guard is
    // statically true (§31).
    checkGuardCoverage(g, out, this.diagnostics, this.input.prelude, this.file);
    // Finalization (§21, §43): every operator-driven meta must now resolve
    // to a concrete admissible type. Any that remain metas — or resolved to
    // a non-admissible type not already reported — surface as ambiguity.
    this.finalizeAmbiguity(g);
    return out;
  }

  private finalizeAmbiguity(g: DefinitionGroup): void {
    if (this.pendingNumericMetas.size === 0) return;
    const p = this.input.prelude;
    const intId = p.types.int.value;
    const floatId = p.types.float.value;
    const boolId = p.types.bool.value;
    const textId = p.types.text.value;
    const reported = new Set<number>();
    for (const [metaId, info] of this.pendingNumericMetas) {
      if (reported.has(metaId)) continue;
      const resolved = this.expand(this.input.store.prune(tyMeta(metaId)));
      // A meta that reached the end of this body without being pinned to a
      // concrete admissible type is ambiguous. Rigids also count as
      // unresolved: `+ :: a -> a -> a` is not a scheme this HM (no
      // typeclasses) can honor, so generalizing an operator-constrained meta
      // into a rigid is itself an ambiguity signal (§21).
      if (resolved.kind === "TyMeta" || resolved.kind === "TyRigid") {
        this.diagnostics.push(
          typeDiag({
            code: typeCodes.ambiguous,
            message: `ambiguous type for operator '${info.op}' — no context resolves the operand type`,
            file: this.file,
            span: info.span,
            details: { op: info.op, name: g.name },
          }),
        );
        reported.add(metaId);
        continue;
      }
      if (resolved.kind === "TyError") {
        reported.add(metaId);
        continue;
      }
      const conValue = resolved.kind === "TyCon" ? resolved.con.value : null;
      if (info.kind === "numeric") {
        if (conValue !== intId && conValue !== floatId) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.mismatch,
              message: `operator '${info.op}' requires Int or Float, got ${this.rt(resolved)}`,
              file: this.file,
              span: info.span,
              details: { op: info.op, actual: this.rt(resolved) },
            }),
          );
        }
      } else {
        const equatable =
          conValue === intId ||
          conValue === floatId ||
          conValue === boolId ||
          conValue === textId ||
          resolved.kind === "TyUnit";
        if (!equatable) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.mismatch,
              message: `operator '==' requires a scalar (Int, Float, Bool, Text, ()), got ${this.rt(resolved)}`,
              file: this.file,
              span: info.span,
              details: { op: info.op, actual: this.rt(resolved) },
            }),
          );
        }
      }
      reported.add(metaId);
    }
    this.pendingNumericMetas.clear();
  }

  private checkOneEquation(
    eqn: ResolvedDeclDefinition,
    paramTys: Ty[],
    result: Ty,
    g: DefinitionGroup,
  ): TypedEquation {
    if (eqn.params.length > paramTys.length) {
      this.diagnostics.push(
        typeDiag({
          code: typeCodes.arityMismatch,
          message: `equation for '${g.name}' has more parameters (${eqn.params.length}) than its signature accepts (${paramTys.length})`,
          file: this.file,
          span: eqn.span,
          details: { name: g.name, expected: paramTys.length, actual: eqn.params.length },
        }),
      );
    }
    // Check the params against the leading portion of the signature.
    const typedParams: TypedPattern[] = [];
    for (let i = 0; i < eqn.params.length && i < paramTys.length; i++) {
      typedParams.push(this.checkPattern(eqn.params[i]!, paramTys[i]!));
    }
    // The remaining result type = whatever's left after consuming
    // eqn.params.length parameters.
    let remaining: Ty = result;
    for (let i = eqn.params.length; i < paramTys.length; i++) {
      remaining = tyFun(paramTys[i]!, remaining);
    }
    let body: TypedExpr | null = null;
    let guards: TypedGuardedRhs[] | null = null;
    if (eqn.body !== null) {
      body = this.checkExpr(eqn.body, remaining);
    } else if (eqn.guards !== null) {
      guards = eqn.guards.map((gr) => this.checkGuard(gr, remaining));
    }
    return { params: typedParams, body, guards, span: eqn.span };
  }

  private checkGuard(g: ResolvedGuardedRhs, expected: Ty): TypedGuardedRhs {
    const cond = this.checkExpr(g.condition, this.input.prelude.tyBool);
    const body = this.checkExpr(g.body, expected);
    return { condition: cond, body, span: g.span };
  }

  // ---- Expressions ----

  private inferExpr(e: ResolvedExpr): TypedExpr {
    switch (e.kind) {
      case "ExprInt":
        return { kind: "ExprInt", value: e.value, text: e.text, ty: this.input.prelude.tyInt, span: e.span };
      case "ExprFloat":
        return { kind: "ExprFloat", value: e.value, text: e.text, ty: this.input.prelude.tyFloat, span: e.span };
      case "ExprString":
        return { kind: "ExprString", value: e.value, ty: this.input.prelude.tyText, span: e.span };
      case "ExprBool":
        return { kind: "ExprBool", value: e.value, ty: this.input.prelude.tyBool, span: e.span };
      case "ExprUnit":
        return { kind: "ExprUnit", ty: TyUnitSingleton, span: e.span };
      case "ExprVarRef":
      case "ExprConRef": {
        const ref = e.ref;
        if ("kind" in ref && ref.kind === "unresolved") {
          return {
            kind: e.kind === "ExprVarRef" ? "ExprVarRef" : "ExprConRef",
            ref: { value: -1 },
            name: ref.name,
            ty: TyErrorSingleton,
            span: e.span,
          };
        }
        const rref = ref as { id: DefId; name: string };
        const ty = this.instantiate(rref.id, e.span);
        return {
          kind: e.kind === "ExprVarRef" ? "ExprVarRef" : "ExprConRef",
          ref: rref.id,
          name: rref.name,
          ty,
          span: e.span,
        };
      }
      case "ExprQualified": {
        const ref = e.ref;
        if ("kind" in ref && ref.kind === "unresolved") {
          return {
            kind: "ExprQualified",
            alias: e.alias,
            moduleId: e.moduleId,
            ref: { value: -1 },
            name: ref.name,
            ty: TyErrorSingleton,
            span: e.span,
          };
        }
        const rref = ref as { id: DefId; name: string };
        const ty = this.instantiate(rref.id, e.span);
        return {
          kind: "ExprQualified",
          alias: e.alias,
          moduleId: e.moduleId,
          ref: rref.id,
          name: rref.name,
          ty,
          span: e.span,
        };
      }
      case "ExprApp": {
        const fn = this.inferExpr(e.fn);
        const argMeta = this.input.store.fresh();
        const resultMeta = this.input.store.fresh();
        const expectedFn = tyFun(argMeta, resultMeta);
        const r = unify(fn.ty, expectedFn, this.input.store, this.input.env);
        if (!r.ok) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.mismatch,
              message: `applying a non-function: ${this.rt(fn.ty)}`,
              file: this.file,
              span: e.fn.span,
              details: { actual: this.rt(fn.ty) },
            }),
          );
          const arg = this.inferExpr(e.arg);
          return { kind: "ExprApp", fn, arg, ty: TyErrorSingleton, span: e.span };
        }
        // Constructor payload check (§26). When the applied function is a
        // constructor reference and the payload doesn't fit, emit the
        // constructor-specific diagnostic instead of a generic mismatch.
        const ctorName = this.constructorName(e.fn);
        if (ctorName !== null) {
          const arg = this.inferExpr(e.arg);
          const u = unify(arg.ty, argMeta, this.input.store, this.input.env);
          if (!u.ok) {
            const expected = this.rt(argMeta);
            const actual = this.rt(arg.ty);
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.badConstructorPayload,
                message: `constructor '${ctorName}' payload has wrong type — expected ${expected}, got ${actual}`,
                file: this.file,
                span: e.arg.span,
                details: { name: ctorName, expected, actual },
              }),
            );
            return { kind: "ExprApp", fn, arg: { ...arg, ty: TyErrorSingleton }, ty: TyErrorSingleton, span: e.span };
          }
          return { kind: "ExprApp", fn, arg, ty: resultMeta, span: e.span };
        }
        const arg = this.checkExpr(e.arg, argMeta);
        return { kind: "ExprApp", fn, arg, ty: resultMeta, span: e.span };
      }
      case "ExprField": {
        const record = this.inferExpr(e.record);
        const pruned = this.expand(this.input.store.prune(record.ty));
        if (pruned.kind === "TyRecord") {
          const f = pruned.fields.find((ff) => ff.name === e.field);
          if (!f) {
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.unknownField,
                message: `unknown record field '${e.field}' on ${this.rt(pruned)}`,
                file: this.file,
                span: e.fieldSpan,
                details: { field: e.field, actual: this.rt(pruned) },
              }),
            );
            return { kind: "ExprField", record, field: e.field, ty: TyErrorSingleton, span: e.span };
          }
          return { kind: "ExprField", record, field: e.field, ty: f.ty, span: e.span };
        }
        if (pruned.kind === "TyError") {
          return { kind: "ExprField", record, field: e.field, ty: TyErrorSingleton, span: e.span };
        }
        if (pruned.kind === "TyMeta") {
          // Open-row inference unsupported (§35).
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.unsupportedFeature,
              message: `cannot infer record type from field access '${e.field}' — preview-web-1 does not support open-row inference`,
              file: this.file,
              span: e.fieldSpan,
              details: { field: e.field },
            }),
          );
          return { kind: "ExprField", record, field: e.field, ty: TyErrorSingleton, span: e.span };
        }
        this.diagnostics.push(
          typeDiag({
            code: typeCodes.mismatch,
            message: `field access on non-record type ${this.rt(pruned)}`,
            file: this.file,
            span: e.fieldSpan,
            details: { field: e.field, actual: this.rt(pruned) },
          }),
        );
        return { kind: "ExprField", record, field: e.field, ty: TyErrorSingleton, span: e.span };
      }
      case "ExprRecord": {
        // Infer field types and produce a closed record type.
        const seen = new Set<string>();
        const fields: { name: string; value: TypedExpr; span: Span }[] = [];
        const tyFields: { name: string; ty: Ty }[] = [];
        for (const f of e.fields) {
          if (seen.has(f.name)) {
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.duplicateRecordField,
                message: `duplicate record field '${f.name}'`,
                file: this.file,
                span: f.nameSpan,
                details: { field: f.name },
              }),
            );
            continue;
          }
          seen.add(f.name);
          const v = this.inferExpr(f.value);
          fields.push({ name: f.name, value: v, span: f.span });
          tyFields.push({ name: f.name, ty: v.ty });
        }
        return { kind: "ExprRecord", fields, ty: tyRecord(tyFields), span: e.span };
      }
      case "ExprRecordUpdate": {
        const record = this.inferExpr(e.record);
        const pruned = this.expand(this.input.store.prune(record.ty));
        if (pruned.kind !== "TyRecord") {
          if (pruned.kind !== "TyError") {
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.mismatch,
                message: `record update on non-record type ${this.rt(pruned)}`,
                file: this.file,
                span: e.record.span,
                details: { actual: this.rt(pruned) },
              }),
            );
          }
          const fields = e.fields.map((f) => ({
            name: f.name,
            value: this.inferExpr(f.value),
            span: f.span,
          }));
          return { kind: "ExprRecordUpdate", record, fields, ty: TyErrorSingleton, span: e.span };
        }
        const seenNames = new Set<string>();
        const fields: { name: string; value: TypedExpr; span: Span }[] = [];
        for (const f of e.fields) {
          if (seenNames.has(f.name)) {
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.duplicateRecordField,
                message: `duplicate record field '${f.name}' in update`,
                file: this.file,
                span: f.nameSpan,
                details: { field: f.name },
              }),
            );
            continue;
          }
          seenNames.add(f.name);
          const existing = pruned.fields.find((ff) => ff.name === f.name);
          if (!existing) {
            // Record update in preview-web-1 cannot add new fields (§36).
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.unknownField,
                message: `record update sets unknown field '${f.name}'`,
                file: this.file,
                span: f.nameSpan,
                details: { field: f.name, actual: this.rt(pruned) },
              }),
            );
            fields.push({ name: f.name, value: this.inferExpr(f.value), span: f.span });
            continue;
          }
          const v = this.checkExpr(f.value, existing.ty);
          fields.push({ name: f.name, value: v, span: f.span });
        }
        return { kind: "ExprRecordUpdate", record, fields, ty: pruned, span: e.span };
      }
      case "ExprList": {
        const elemTy = this.input.store.fresh();
        const elements: TypedExpr[] = [];
        for (const el of e.elements) {
          elements.push(this.checkExpr(el, elemTy));
        }
        return {
          kind: "ExprList",
          elements,
          ty: tyCon(this.input.prelude.types.list, [elemTy]),
          span: e.span,
        };
      }
      case "ExprLambda": {
        const paramMetas: Ty[] = e.params.map(() => this.input.store.fresh());
        const params: TypedPattern[] = e.params.map((p, i) => this.checkPattern(p, paramMetas[i]!));
        const body = this.inferExpr(e.body);
        // Build the arrow chain.
        let ty: Ty = body.ty;
        for (let i = e.params.length - 1; i >= 0; i--) {
          ty = tyFun(paramMetas[i]!, ty);
        }
        // Lambda pattern exhaustiveness (§27).
        if (e.params.length > 0) {
          const matrix: Matrix = { rows: [params], colTypes: paramMetas };
          if (!isExhaustive(matrix, this.input.env, this.input.store)) {
            this.diagnostics.push(
              typeDiag({
                code: typeCodes.nonExhaustiveFunction,
                message: `lambda pattern is not exhaustive`,
                file: this.file,
                span: e.span,
              }),
            );
          }
        }
        return { kind: "ExprLambda", params, body, ty, span: e.span };
      }
      case "ExprLet":
        return this.inferLet(e);
      case "ExprCase":
        return this.inferCase(e);
      case "ExprInfix":
        return this.inferInfix(e);
      case "ExprParen":
        return this.inferExpr(e.inner);
    }
  }

  private checkExpr(e: ResolvedExpr, expected: Ty): TypedExpr {
    // Special-case lambda when we know an arrow so parameter types propagate
    // (§26).
    if (e.kind === "ExprLambda") {
      const arrow = this.expand(this.input.store.prune(expected));
      if (arrow.kind === "TyFun") {
        const paramTys: Ty[] = [];
        let cur: Ty = arrow;
        for (let i = 0; i < e.params.length; i++) {
          const p = this.expand(this.input.store.prune(cur));
          if (p.kind !== "TyFun") break;
          paramTys.push(p.from);
          cur = p.to;
        }
        // If we don't have enough arrow arguments, fall through to normal
        // inference and unify against `expected` at the end.
        if (paramTys.length === e.params.length) {
          const params = e.params.map((p, i) => this.checkPattern(p, paramTys[i]!));
          const body = this.checkExpr(e.body, cur);
          let ty: Ty = body.ty;
          for (let i = e.params.length - 1; i >= 0; i--) {
            ty = tyFun(paramTys[i]!, ty);
          }
          if (e.params.length > 0) {
            const matrix: Matrix = { rows: [params], colTypes: paramTys };
            if (!isExhaustive(matrix, this.input.env, this.input.store)) {
              this.diagnostics.push(
                typeDiag({
                  code: typeCodes.nonExhaustiveFunction,
                  message: `lambda pattern is not exhaustive`,
                  file: this.file,
                  span: e.span,
                }),
              );
            }
          }
          return { kind: "ExprLambda", params, body, ty, span: e.span };
        }
      }
    }
    const inferred = this.inferExpr(e);
    const u = unify(inferred.ty, expected, this.input.store, this.input.env);
    if (!u.ok) {
      this.emitUnifyFailure(u.reason, e.span);
      // Replace with error type to prevent cascades.
      return { ...inferred, ty: TyErrorSingleton };
    }
    return inferred;
  }

  private inferLet(e: Extract<ResolvedExpr, { kind: "ExprLet" }>): TypedExpr {
    const bindings: TypedLetBinding[] = [];
    const saved: [number, Ty | undefined][] = [];
    // Capture the local environment before this let block. Free metas in
    // the enclosing scope must not be generalized (§20).
    const envMetasBefore = this.collectLocalMetas();

    for (const b of e.bindings) {
      // Infer the RHS in the current environment (sequential §19).
      // If the binding has parameters, treat as a local function.
      let ty: Ty;
      let params: TypedPattern[] = [];
      let body: TypedExpr;
      if (b.params.length > 0) {
        const paramMetas = b.params.map(() => this.input.store.fresh());
        params = b.params.map((p, i) => this.checkPattern(p, paramMetas[i]!));
        body = this.inferExpr(b.body);
        // Local-function exhaustiveness (§51).
        const matrix: Matrix = { rows: [params], colTypes: paramMetas };
        if (!isExhaustive(matrix, this.input.env, this.input.store)) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.nonExhaustiveFunction,
              message: `local function '${b.binder.name}' is not exhaustive`,
              file: this.file,
              span: b.span,
            }),
          );
        }
        ty = body.ty;
        for (let i = b.params.length - 1; i >= 0; i--) {
          ty = tyFun(paramMetas[i]!, ty);
        }
      } else {
        body = this.inferExpr(b.body);
        ty = body.ty;
      }
      // Generalize (§20). Free metas in `ty` not present in the enclosing
      // environment become rigid quantified variables.
      const zonked = this.input.store.zonk(ty);
      const scheme = this.generalize(zonked, envMetasBefore);
      // Register the binding in the local scope for subsequent siblings and
      // the `in` body.
      // We store the scheme's raw type in `locals` if it's monomorphic; for
      // polymorphic schemes we store a marker meta and rely on
      // instantiation via `instantiateLocal` (see below).
      this.polySchemes.set(b.binder.id.value, scheme);
      this.locals.set(b.binder.id.value, scheme.ty);
      saved.push([b.binder.id.value, this.locals.get(b.binder.id.value)]);
      bindings.push({ binder: b.binder, scheme, params, body, span: b.span });
    }

    const bodyExpr = this.inferExpr(e.body);
    // Clean up local scope entries introduced by this let block.
    for (const [id] of saved) {
      this.locals.delete(id);
      this.polySchemes.delete(id);
    }
    return { kind: "ExprLet", bindings, body: bodyExpr, ty: bodyExpr.ty, span: e.span };
  }

  private polySchemes = new Map<number, Scheme>();

  private inferCase(e: Extract<ResolvedExpr, { kind: "ExprCase" }>): TypedExpr {
    const scrutinee = this.inferExpr(e.scrutinee);
    const branchTy = this.input.store.fresh();
    const branches: TypedCaseBranch[] = [];
    for (const b of e.branches) {
      const pattern = this.checkPattern(b.pattern, scrutinee.ty);
      const body = this.checkExpr(b.body, branchTy);
      branches.push({ pattern, body, span: b.span });
    }
    // Exhaustiveness (§46 step 6).
    if (branches.length > 0) {
      const matrix: Matrix = {
        rows: branches.map((br) => [br.pattern]),
        colTypes: [scrutinee.ty],
      };
      if (!isExhaustive(matrix, this.input.env, this.input.store)) {
        const missing = missingListFromMatrix(matrix, this.input.env, this.input.store);
        this.diagnostics.push(
          typeDiag({
            code: typeCodes.nonExhaustiveCase,
            message: `non-exhaustive case expression`,
            file: this.file,
            span: e.span,
            details: { missing },
          }),
        );
      }
    }
    return { kind: "ExprCase", scrutinee, branches, ty: branchTy, span: e.span };
  }

  private inferInfix(e: Extract<ResolvedExpr, { kind: "ExprInfix" }>): TypedExpr {
    const left = this.inferExpr(e.left);
    const right = this.inferExpr(e.right);
    const lTy = this.expand(this.input.store.prune(left.ty));
    const rTy = this.expand(this.input.store.prune(right.ty));
    const p = this.input.prelude;
    const isInt = (t: Ty) => t.kind === "TyCon" && t.con.value === p.types.int.value;
    const isFloat = (t: Ty) => t.kind === "TyCon" && t.con.value === p.types.float.value;
    const isBool = (t: Ty) => t.kind === "TyCon" && t.con.value === p.types.bool.value;
    const isText = (t: Ty) => t.kind === "TyCon" && t.con.value === p.types.text.value;

    // Identity-driven operator dispatch (phase-04_2.md §7-12). Source
    // spelling is preserved on the emitted TypedExpr for provenance but
    // does NOT select semantics — we consult `e.opRef` (the resolver's
    // Prelude identity) and look up the typing rule by DefId.
    const opRef = e.opRef;
    const opDefId: DefId | null = isResolvedRef(opRef) ? opRef.id : null;
    const rule = opDefId === null
      ? null
      : p.operatorRuleByDefId.get(opDefId.value) ?? null;
    // Diagnostics/provenance use the rule's canonical spelling when known,
    // else fall back to the syntactic spelling.
    const op: InfixOp = rule ? rule.displayName : e.op;

    const emitBad = (msg: string, ty: Ty) => {
      this.diagnostics.push(
        typeDiag({
          code: typeCodes.mismatch,
          message: msg,
          file: this.file,
          span: e.opSpan,
          details: { op, ty: this.rt(ty) },
        }),
      );
    };

    const ok = (resultTy: Ty): TypedExpr => ({
      kind: "ExprInfix",
      op,
      left,
      right,
      ty: resultTy,
      span: e.span,
    });

    if (rule === null) {
      // The resolver already emits BLACK_NAME_UNKNOWN when an operator
      // spelling has no Prelude identity. On the typechecker side we swallow
      // the poison quietly — no further diagnostic, and downstream sees
      // TyError so nothing masquerades as well-typed.
      return ok(TyErrorSingleton);
    }

    switch (rule.kind) {
      case "arithmetic": {
        // Int/Int → Int OR Float/Float → Float (§43). No mixed Int/Float (§44).
        if (isInt(lTy) || isInt(rTy)) {
          this.expectSame(left, right, p.tyInt);
          return ok(p.tyInt);
        }
        if (isFloat(lTy) || isFloat(rTy)) {
          this.expectSame(left, right, p.tyFloat);
          return ok(p.tyFloat);
        }
        if (lTy.kind === "TyError" || rTy.kind === "TyError") return ok(TyErrorSingleton);
        this.unifyOrErr(left.ty, right.ty, e.opSpan);
        const shared = this.input.store.prune(left.ty);
        if (shared.kind === "TyMeta") {
          this.recordNumericMeta(shared.id, e.opSpan, op, "numeric");
        }
        return ok(shared);
      }
      case "divide": {
        // Float/Float → Float only (§43). No Int/Int in the preview.
        if (isInt(lTy) || isInt(rTy)) {
          emitBad(`operator '${op}' is not defined on Int in preview-web-1`, lTy);
          return ok(TyErrorSingleton);
        }
        this.expectSame(left, right, p.tyFloat);
        return ok(p.tyFloat);
      }
      case "compare": {
        if (isFloat(lTy) || isFloat(rTy)) {
          this.expectSame(left, right, p.tyFloat);
          return ok(p.tyBool);
        }
        if (isInt(lTy) || isInt(rTy)) {
          this.expectSame(left, right, p.tyInt);
          return ok(p.tyBool);
        }
        if (lTy.kind === "TyError" || rTy.kind === "TyError") return ok(p.tyBool);
        this.unifyOrErr(left.ty, right.ty, e.opSpan);
        const shared = this.input.store.prune(left.ty);
        if (shared.kind === "TyMeta") {
          this.recordNumericMeta(shared.id, e.opSpan, op, "numeric");
        }
        return ok(p.tyBool);
      }
      case "equal": {
        // Same-type equality on scalars only (§43).
        const chooseTy = (): Ty | null => {
          if (isInt(lTy) || isInt(rTy)) return p.tyInt;
          if (isFloat(lTy) || isFloat(rTy)) return p.tyFloat;
          if (isBool(lTy) || isBool(rTy)) return p.tyBool;
          if (isText(lTy) || isText(rTy)) return p.tyText;
          if (lTy.kind === "TyUnit" || rTy.kind === "TyUnit") return TyUnitSingleton;
          return null;
        };
        const t = chooseTy();
        if (t) {
          this.expectSame(left, right, t);
          return ok(p.tyBool);
        }
        if (lTy.kind === "TyError" || rTy.kind === "TyError") return ok(p.tyBool);
        this.unifyOrErr(left.ty, right.ty, e.opSpan);
        const shared = this.input.store.prune(left.ty);
        if (shared.kind === "TyMeta") {
          this.recordNumericMeta(shared.id, e.opSpan, op, "equatable");
        }
        return ok(p.tyBool);
      }
    }
  }

  private recordNumericMeta(
    id: number,
    span: Span,
    op: InfixOp,
    kind: "numeric" | "equatable",
  ): void {
    const prev = this.pendingNumericMetas.get(id);
    // Narrow to the stricter constraint if the same meta gets used by both
    // arithmetic/comparison and equality — arithmetic ("numeric") wins.
    if (prev && prev.kind === "numeric") return;
    this.pendingNumericMetas.set(id, { span, op, kind });
  }

  private expectSame(l: TypedExpr, r: TypedExpr, expected: Ty): void {
    const u1 = unify(l.ty, expected, this.input.store, this.input.env);
    if (!u1.ok) this.emitUnifyFailure(u1.reason, l.span);
    const u2 = unify(r.ty, expected, this.input.store, this.input.env);
    if (!u2.ok) this.emitUnifyFailure(u2.reason, r.span);
  }

  private instantiate(defId: DefId, _span: Span): Ty {
    // Local scheme?
    const local = this.polySchemes.get(defId.value);
    if (local) return instantiateScheme(local, this.input.store);
    // Local monomorphic?
    const mono = this.locals.get(defId.value);
    if (mono !== undefined) return mono;
    // Top-level / prelude?
    const scheme = this.input.schemes.byDefId.get(defId.value);
    if (scheme) return instantiateScheme(scheme, this.input.store);
    // Unknown identity — resolver already reported.
    return TyErrorSingleton;
  }

  private collectLocalMetas(): Set<number> {
    const out = new Set<number>();
    for (const ty of this.locals.values()) this.input.store.freeMetas(ty, out);
    for (const s of this.polySchemes.values()) this.input.store.freeMetas(s.ty, out);
    return out;
  }

  private generalize(ty: Ty, envMetas: Set<number>): Scheme {
    const free = this.input.store.freeMetas(ty);
    const toQuantify: number[] = [];
    for (const m of free) if (!envMetas.has(m)) toQuantify.push(m);
    if (toQuantify.length === 0) return monoScheme(ty);
    // Rigid variable identities for local schemes are synthetic. Use negative
    // ids to keep them distinguishable from resolver-allocated DefIds.
    const rigids: TyRigid[] = [];
    for (let i = 0; i < toQuantify.length; i++) {
      const rigid = tyRigid({ value: -1_000_000 - i - this.rigidCounter++ }, `t${i}`);
      rigids.push(rigid);
      this.input.store.bind(toQuantify[i]!, rigid);
    }
    const zonked = this.input.store.zonk(ty);
    // Unbind so that the store doesn't keep synthetic rigids permanently
    // attached to those meta ids. But since we've already zonked and every
    // downstream use of the scheme instantiates via `instantiateScheme`
    // (which walks the scheme's `ty` and freshens rigids), it's safe to
    // leave those meta bindings — they are unreachable from anywhere but
    // the scheme itself.
    return { rigids, ty: zonked };
  }

  private rigidCounter = 0;

  private expand(t: Ty): Ty {
    let cur = t;
    while (cur.kind === "TyCon" && cur.args.length === 0) {
      const info = lookupTyCon(this.input.env, cur.con);
      if (!info || info.kind !== "alias") return cur;
      cur = info.body;
    }
    return cur;
  }

  private rt(t: Ty): string {
    return renderTy(this.input.store.zonk(t), this.input.env);
  }

  private emitUnifyFailure(reason: import("./unify.js").UnifyFailure, span: Span): void {
    if (reason.kind === "mismatch") {
      const expected = this.rt(reason.a);
      const actual = this.rt(reason.b);
      this.diagnostics.push(
        typeDiag({
          code: typeCodes.mismatch,
          message: `type mismatch: expected ${expected}, got ${actual}`,
          file: this.file,
          span,
          details: { expected, actual },
        }),
      );
    } else if (reason.kind === "occurs") {
      this.diagnostics.push(
        typeDiag({
          code: typeCodes.occursCheck,
          message: `occurs check failed — infinite type`,
          file: this.file,
          span,
          details: { meta: reason.metaId, ty: this.rt(reason.ty) },
        }),
      );
    } else {
      // `reason.a` is the caller-side "actual" record; `reason.b` is the
      // "expected" side. `missing` are field names present on `a` but not
      // `b` (surplus / unknown-to-expected). `extra` are names present on
      // `b` but not `a` (required by expected but absent on actual — i.e.
      // missing from the literal). Diagnose the missing-required case
      // first so a partial literal for a closed record produces
      // BLACK_MISSING_FIELD (§39).
      const missingFromLiteral = reason.extra;
      const unknownOnExpected = reason.missing;
      const parts: string[] = [];
      if (missingFromLiteral.length > 0) parts.push(`missing ${missingFromLiteral.join(", ")}`);
      if (unknownOnExpected.length > 0) parts.push(`unknown ${unknownOnExpected.join(", ")}`);
      this.diagnostics.push(
        typeDiag({
          code: missingFromLiteral.length > 0 ? typeCodes.missingField : typeCodes.unknownField,
          message: `record type mismatch: ${parts.join("; ")}`,
          file: this.file,
          span,
          details: {
            expected: this.rt(reason.b),
            actual: this.rt(reason.a),
            missing: missingFromLiteral,
            extra: unknownOnExpected,
          },
        }),
      );
    }
  }

  // ---- Patterns ----

  private checkPattern(p: ResolvedPattern, expected: Ty): TypedPattern {
    switch (p.kind) {
      case "PatternWildcard":
        return { kind: "PatternWildcard", ty: expected, span: p.span };
      case "PatternVar":
        this.locals.set(p.binder.id.value, expected);
        return { kind: "PatternVar", binder: p.binder, ty: expected, span: p.span };
      case "PatternInt":
        this.unifyOrErr(expected, this.input.prelude.tyInt, p.span);
        return { kind: "PatternInt", value: p.value, ty: this.input.prelude.tyInt, span: p.span };
      case "PatternFloat":
        this.unifyOrErr(expected, this.input.prelude.tyFloat, p.span);
        return { kind: "PatternFloat", value: p.value, ty: this.input.prelude.tyFloat, span: p.span };
      case "PatternString":
        this.unifyOrErr(expected, this.input.prelude.tyText, p.span);
        return { kind: "PatternString", value: p.value, ty: this.input.prelude.tyText, span: p.span };
      case "PatternBool":
        this.unifyOrErr(expected, this.input.prelude.tyBool, p.span);
        return { kind: "PatternBool", value: p.value, ty: this.input.prelude.tyBool, span: p.span };
      case "PatternCon": {
        const ref = p.ref;
        if ("kind" in ref && ref.kind === "unresolved") {
          return {
            kind: "PatternCon",
            ref: { value: -1 },
            name: ref.name,
            args: p.args.map((a) => this.checkPattern(a, this.input.store.fresh())),
            ty: TyErrorSingleton,
            span: p.span,
          };
        }
        const rref = ref as { id: DefId; name: string };
        // Look up the constructor.
        const scheme = this.input.schemes.byDefId.get(rref.id.value);
        if (!scheme) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.badConstructorPayload,
              message: `'${rref.name}' is not a constructor`,
              file: this.file,
              span: p.span,
              details: { name: rref.name },
            }),
          );
          return {
            kind: "PatternCon",
            ref: rref.id,
            name: rref.name,
            args: [],
            ty: TyErrorSingleton,
            span: p.span,
          };
        }
        const instantiated = instantiateScheme(scheme, this.input.store);
        // Constructor pattern accepts 0 patterns for nullary alternatives or
        // 1 pattern for payload alternatives (§40).
        const parts = decomposeArrow(instantiated, this.input.env);
        if (parts.params.length !== p.args.length) {
          this.diagnostics.push(
            typeDiag({
              code: typeCodes.badConstructorPayload,
              message: `constructor '${rref.name}' pattern expects ${parts.params.length} argument(s), got ${p.args.length}`,
              file: this.file,
              span: p.span,
              details: { name: rref.name, expected: parts.params.length, actual: p.args.length },
            }),
          );
          return {
            kind: "PatternCon",
            ref: rref.id,
            name: rref.name,
            args: [],
            ty: TyErrorSingleton,
            span: p.span,
          };
        }
        this.unifyOrErr(expected, parts.result, p.span);
        const args = p.args.map((a, i) => this.checkPattern(a, parts.params[i]!));
        return {
          kind: "PatternCon",
          ref: rref.id,
          name: rref.name,
          args,
          ty: parts.result,
          span: p.span,
        };
      }
      case "PatternRecord": {
        const pruned = this.expand(this.input.store.prune(expected));
        if (pruned.kind === "TyRecord") {
          const seen = new Set<string>();
          const fields: { name: string; pattern: TypedPattern; span: Span }[] = [];
          for (const f of p.fields) {
            if (seen.has(f.name)) {
              this.diagnostics.push(
                typeDiag({
                  code: typeCodes.duplicateRecordField,
                  message: `duplicate record field '${f.name}' in pattern`,
                  file: this.file,
                  span: f.nameSpan,
                  details: { field: f.name },
                }),
              );
              continue;
            }
            seen.add(f.name);
            const existing = pruned.fields.find((ff) => ff.name === f.name);
            if (!existing) {
              this.diagnostics.push(
                typeDiag({
                  code: typeCodes.unknownField,
                  message: `unknown record field '${f.name}' in pattern`,
                  file: this.file,
                  span: f.nameSpan,
                  details: { field: f.name, actual: this.rt(pruned) },
                }),
              );
              fields.push({
                name: f.name,
                pattern: this.checkPattern(f.pattern, this.input.store.fresh()),
                span: f.span,
              });
              continue;
            }
            fields.push({
              name: f.name,
              pattern: this.checkPattern(f.pattern, existing.ty),
              span: f.span,
            });
          }
          return {
            kind: "PatternRecord",
            constructor: null,
            fields,
            ty: pruned,
            span: p.span,
          };
        }
        if (pruned.kind === "TyError") {
          return {
            kind: "PatternRecord",
            constructor: null,
            fields: [],
            ty: TyErrorSingleton,
            span: p.span,
          };
        }
        this.diagnostics.push(
          typeDiag({
            code: typeCodes.mismatch,
            message: `record pattern used against non-record type ${this.rt(pruned)}`,
            file: this.file,
            span: p.span,
            details: { actual: this.rt(pruned) },
          }),
        );
        return {
          kind: "PatternRecord",
          constructor: null,
          fields: [],
          ty: TyErrorSingleton,
          span: p.span,
        };
      }
    }
  }

  // If the given resolved expression is (or unwraps to) a reference to a
  // variant constructor, return its source name; otherwise return null.
  // Used by ExprApp payload checking (§26).
  private constructorName(e: ResolvedExpr): string | null {
    let cur: ResolvedExpr = e;
    while (cur.kind === "ExprParen") cur = cur.inner;
    if (cur.kind !== "ExprConRef" && cur.kind !== "ExprQualified") return null;
    const ref = cur.ref;
    if ("kind" in ref && ref.kind === "unresolved") return null;
    const rref = ref as { id: DefId; name: string };
    const def = this.input.program.definitions.get(rref.id.value);
    if (!def || def.namespace !== "term" || def.category !== "constructor") return null;
    return rref.name;
  }

  private unifyOrErr(a: Ty, b: Ty, span: Span): void {
    const r = unify(a, b, this.input.store, this.input.env);
    if (!r.ok) this.emitUnifyFailure(r.reason, span);
  }
}

// ---- Helpers ----

export function instantiateScheme(scheme: Scheme, store: MetaStore): Ty {
  if (scheme.rigids.length === 0) return scheme.ty;
  const mapping = new Map<number, Ty>();
  for (const r of scheme.rigids) mapping.set(r.id.value, store.fresh());
  return substituteRigids(scheme.ty, mapping);
}

function substituteRigids(t: Ty, mapping: Map<number, Ty>): Ty {
  switch (t.kind) {
    case "TyUnit":
    case "TyError":
    case "TyMeta":
      return t;
    case "TyRigid": {
      const rep = mapping.get(t.id.value);
      return rep ?? t;
    }
    case "TyFun":
      return { kind: "TyFun", from: substituteRigids(t.from, mapping), to: substituteRigids(t.to, mapping) };
    case "TyCon":
      return { kind: "TyCon", con: t.con, args: t.args.map((a) => substituteRigids(a, mapping)) };
    case "TyRecord":
      return { kind: "TyRecord", fields: t.fields.map((f) => ({ name: f.name, ty: substituteRigids(f.ty, mapping) })) };
  }
}

function decomposeArrow(ty: Ty, env: TypeConEnv): { params: Ty[]; result: Ty } {
  const params: Ty[] = [];
  let cur = ty;
  while (true) {
    let expanded = cur;
    while (expanded.kind === "TyCon" && expanded.args.length === 0) {
      const info = lookupTyCon(env, expanded.con);
      if (!info || info.kind !== "alias") break;
      expanded = info.body;
    }
    if (expanded.kind !== "TyFun") {
      return { params, result: expanded };
    }
    params.push(expanded.from);
    cur = expanded.to;
  }
}

function missingListFromMatrix(m: Matrix, env: TypeConEnv, store: MetaStore): string[] {
  const r = missingConstructors(m, env, store);
  if (r.kind === "variant") return r.names;
  if (r.kind === "openScalar") return ["<catch-all>"];
  return [];
}

function checkGuardCoverage(
  g: DefinitionGroup,
  equations: TypedEquation[],
  diagnostics: Diagnostic[],
  prelude: BuiltPrelude,
  file: string,
): void {
  // Only equations with guards affect this. A guarded equation contributes
  // unconditional coverage only when one of its guards is statically true
  // (§31): either the boolean literal `True` or the exact Prelude `otherwise`
  // identity.
  for (const eq of equations) {
    if (eq.guards === null) continue;
    const anyUnconditional = eq.guards.some((gr) => guardIsUnconditional(gr, prelude));
    if (!anyUnconditional) {
      // §31 — if no guard is statically unconditional, the equation is
      // non-exhaustive on its own. We emit a diagnostic only when every
      // guarded row of the group lacks an unconditional case, since with
      // multiple equations later ones may provide coverage. The function-
      // exhaustiveness check above already covers the pattern side; here we
      // add a guard-specific error only when this equation has zero
      // parameters (a pure guarded value with no fall-through).
      if (eq.params.length === 0) {
        diagnostics.push(
          typeDiag({
            code: typeCodes.nonExhaustiveFunction,
            message: `guarded '${g.name}' has no unconditional case`,
            file,
            span: eq.span,
            details: { name: g.name },
          }),
        );
      }
    }
  }
}

function guardIsUnconditional(gr: TypedGuardedRhs, prelude: BuiltPrelude): boolean {
  const c = gr.condition;
  if (c.kind === "ExprBool" && c.value === true) return true;
  if (
    c.kind === "ExprVarRef" &&
    prelude.otherwiseId !== null &&
    c.ref.value === prelude.otherwiseId.value
  ) {
    return true;
  }
  return false;
}

// An equation contributes unconditional pattern-side coverage iff its RHS is
// unguarded, or at least one of its guards is statically unconditional (§13).
// A shadowed `otherwise` binding does not count — `guardIsUnconditional`
// checks the exact Prelude DefId.
function equationCoversUnconditionally(
  eq: TypedEquation,
  prelude: BuiltPrelude,
): boolean {
  if (eq.body !== null) return true;
  if (eq.guards === null) return true;
  return eq.guards.some((gr) => guardIsUnconditional(gr, prelude));
}
