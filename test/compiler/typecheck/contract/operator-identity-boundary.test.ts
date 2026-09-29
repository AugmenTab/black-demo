// Contract: phase-04_2.md §7-12. The typechecker's operator dispatch is
// keyed by the resolved Prelude operator DefId, not by source spelling.
// Since normal source cannot produce a mismatch between spelling and
// `opRef` (the resolver always agrees), these tests directly mutate a
// resolved program at the boundary and assert the typechecker follows
// `opRef`'s identity, not the source spelling.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveProject } from "../../../../src/compiler/resolver/index.js";
import { typecheckProgram } from "../../../../src/compiler/typecheck/index.js";
import type {
  ResolvedProgram,
  ResolvedExpr,
  MaybeResolvedRef,
  InfixOp,
} from "../../../../src/compiler/resolver/types.js";
import type { Ty } from "../../../../src/compiler/typecheck/types.js";
import type { TypedExpr } from "../../../../src/compiler/typecheck/typed-ast.js";

async function scratchResolve(source: string): Promise<{
  resolved: ResolvedProgram;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-boundary-"));
  const sourceRoot = path.join(root, "src");
  await mkdir(sourceRoot, { recursive: true });
  const entryPath = path.join(sourceRoot, "Main.blk");
  await writeFile(entryPath, source, "utf8");
  const r = await resolveProject({ projectRoot: root, sourceRoot, entryPath });
  if (!r.ok || !r.program) {
    throw new Error(`resolve failed: ${r.diagnostics.map((d) => d.code).join(", ")}`);
  }
  return {
    resolved: r.program,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function findInfix(e: ResolvedExpr): Extract<ResolvedExpr, { kind: "ExprInfix" }> | null {
  if (e.kind === "ExprInfix") return e;
  switch (e.kind) {
    case "ExprApp": {
      return findInfix(e.fn) ?? findInfix(e.arg);
    }
    case "ExprLet": {
      for (const b of e.bindings) {
        const inB = findInfix(b.body);
        if (inB) return inB;
      }
      return findInfix(e.body);
    }
    case "ExprLambda":
      return findInfix(e.body);
    case "ExprCase": {
      const inS = findInfix(e.scrutinee);
      if (inS) return inS;
      for (const br of e.branches) {
        const inBr = findInfix(br.body);
        if (inBr) return inBr;
      }
      return null;
    }
    case "ExprParen":
      return findInfix(e.inner);
    case "ExprRecord":
      for (const f of e.fields) {
        const inF = findInfix(f.value);
        if (inF) return inF;
      }
      return null;
    case "ExprRecordUpdate": {
      const inR = findInfix(e.record);
      if (inR) return inR;
      for (const f of e.fields) {
        const inF = findInfix(f.value);
        if (inF) return inF;
      }
      return null;
    }
    case "ExprField":
      return findInfix(e.record);
    case "ExprList": {
      for (const el of e.elements) {
        const inEl = findInfix(el);
        if (inEl) return inEl;
      }
      return null;
    }
    default:
      return null;
  }
}

function findMainRhs(prog: ResolvedProgram): ResolvedExpr {
  const mod = prog.modules.get(prog.entryModule)!;
  for (const d of mod.declarations) {
    if (d.kind === "DeclDefinition" && d.name === "main") {
      return d.body!;
    }
  }
  throw new Error("main definition not found");
}

function typedRootExprOfMain(tp: {
  modules: Map<string, { declarations: unknown[] }>;
  entryModule: string;
}): TypedExpr {
  const mod = tp.modules.get(tp.entryModule)!;
  for (const d of mod.declarations as Array<{
    kind: string;
    name?: string;
    equations?: Array<{ body?: TypedExpr | null }>;
  }>) {
    if (d.kind === "Definition" && d.name === "main") {
      return d.equations![0]!.body!;
    }
  }
  throw new Error("main definition not found in typed program");
}

function findTypedInfix(e: TypedExpr): Extract<TypedExpr, { kind: "ExprInfix" }> | null {
  if (e.kind === "ExprInfix") return e;
  switch (e.kind) {
    case "ExprApp":
      return findTypedInfix(e.fn) ?? findTypedInfix(e.arg);
    case "ExprLet":
      for (const b of e.bindings) {
        const inB = findTypedInfix(b.body);
        if (inB) return inB;
      }
      return findTypedInfix(e.body);
    default:
      return null;
  }
}

function makeOpRef(id: { value: number }, name: InfixOp, span: unknown): MaybeResolvedRef {
  return {
    id: id as unknown as { value: number } & { readonly __defid: unique symbol },
    namespace: "term",
    name,
    span: span as never,
  } as MaybeResolvedRef;
}

test("[boundary §11] identity beats spelling: source '+' with opRef=< types as Bool", async () => {
  const { resolved, cleanup } = await scratchResolve(
    [
      "module Main (main)",
      "",
      "main :: Bool",
      "main = 1 < 2",
    ].join("\n") + "\n",
  );
  try {
    // Sanity: original resolves at Bool.
    const tc0 = typecheckProgram(resolved);
    assert.equal(tc0.ok, true, `baseline typecheck failed: ${tc0.diagnostics.map((d) => d.code).join(",")}`);
    const rhs = findMainRhs(resolved);
    const infix = findInfix(rhs);
    assert.ok(infix !== null, "expected an ExprInfix in main");
    // Swap the operator: keep the resolved identity (`<`), rewrite the
    // source spelling to `+`. The typechecker must follow the identity and
    // still yield Bool.
    (infix as { op: InfixOp }).op = "+";
    const tc = typecheckProgram(resolved);
    assert.equal(tc.ok, true, `mutated typecheck failed: ${tc.diagnostics.map((d) => d.code).join(",")}`);
    const tExpr = typedRootExprOfMain(tc.program as unknown as {
      modules: Map<string, { declarations: unknown[] }>;
      entryModule: string;
    });
    const tInfix = findTypedInfix(tExpr);
    assert.ok(tInfix !== null, "typed infix not found");
    // Result type must be Bool (from the resolved `<` identity), not Int.
    assert.equal(
      (tInfix!.ty as Ty & { kind: string; con?: { value: number } }).kind,
      "TyCon",
    );
    const boolId = resolved.prelude.types.get("Bool")!.value;
    assert.equal((tInfix!.ty as { con: { value: number } }).con.value, boolId);
  } finally {
    await cleanup();
  }
});

test("[boundary §11] identity beats spelling: source '<' with opRef=+ types as Int", async () => {
  const { resolved, cleanup } = await scratchResolve(
    [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 1 + 2",
    ].join("\n") + "\n",
  );
  try {
    const rhs = findMainRhs(resolved);
    const infix = findInfix(rhs);
    assert.ok(infix !== null);
    // Keep resolved identity (`+`), rewrite spelling to `<`.
    (infix as { op: InfixOp }).op = "<";
    const tc = typecheckProgram(resolved);
    assert.equal(tc.ok, true, `mutated typecheck failed: ${tc.diagnostics.map((d) => d.code).join(",")}`);
    const tExpr = typedRootExprOfMain(tc.program as unknown as {
      modules: Map<string, { declarations: unknown[] }>;
      entryModule: string;
    });
    const tInfix = findTypedInfix(tExpr);
    assert.ok(tInfix !== null);
    // Result must still be Int (from resolved `+` identity), not Bool.
    const intId = resolved.prelude.types.get("Int")!.value;
    assert.equal((tInfix!.ty as { con: { value: number } }).con.value, intId);
  } finally {
    await cleanup();
  }
});

test("[boundary §12] swapping spelling but not opRef keeps semantics unchanged", async () => {
  const { resolved, cleanup } = await scratchResolve(
    [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 3 * 4",
    ].join("\n") + "\n",
  );
  try {
    const rhs = findMainRhs(resolved);
    const infix = findInfix(rhs);
    assert.ok(infix !== null);
    // Set spelling to a completely different comparator — since opRef stays
    // on `*` this must remain Int.
    (infix as { op: InfixOp }).op = ">=";
    const tc = typecheckProgram(resolved);
    assert.equal(tc.ok, true, `mutated typecheck failed: ${tc.diagnostics.map((d) => d.code).join(",")}`);
    const tExpr = typedRootExprOfMain(tc.program as unknown as {
      modules: Map<string, { declarations: unknown[] }>;
      entryModule: string;
    });
    const tInfix = findTypedInfix(tExpr);
    assert.ok(tInfix !== null);
    const intId = resolved.prelude.types.get("Int")!.value;
    assert.equal((tInfix!.ty as { con: { value: number } }).con.value, intId);
  } finally {
    await cleanup();
  }
});

test("[boundary §11 opRef-swap] semantics follow opRef DefId, not the spelling", async () => {
  const { resolved, cleanup } = await scratchResolve(
    [
      "module Main (main)",
      "",
      "main :: Bool",
      "main = 1 + 2",
    ].join("\n") + "\n",
  );
  try {
    const rhs = findMainRhs(resolved);
    const infix = findInfix(rhs);
    assert.ok(infix !== null);
    // Baseline: `1 + 2 :: Bool` fails because `+` is arithmetic.
    const tc0 = typecheckProgram(resolved);
    assert.equal(tc0.ok, false, "baseline should have a signature mismatch");
    // Swap the opRef's DefId to `<` (keep spelling as `+`). Expected: the
    // operator subtree types as Bool and the signature now matches.
    const ltId = resolved.prelude.operators.get("<")!;
    (infix as { opRef: MaybeResolvedRef }).opRef = makeOpRef(ltId, "<", infix!.opSpan);
    const tc = typecheckProgram(resolved);
    assert.equal(
      tc.ok, true,
      `expected identity swap to satisfy annotation; got ${tc.diagnostics.map((d) => d.code).join(",")}`,
    );
    const tExpr = typedRootExprOfMain(tc.program as unknown as {
      modules: Map<string, { declarations: unknown[] }>;
      entryModule: string;
    });
    const tInfix = findTypedInfix(tExpr);
    assert.ok(tInfix !== null);
    const boolId = resolved.prelude.types.get("Bool")!.value;
    assert.equal((tInfix!.ty as { con: { value: number } }).con.value, boolId);
  } finally {
    await cleanup();
  }
});
