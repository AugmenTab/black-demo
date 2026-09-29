// Contract: on successful typing, no `TyMeta` may appear anywhere in the
// public TypedProgram surface (§33). Genuinely unresolved inference
// variables must instead surface as BLACK_TYPE_AMBIGUOUS (§34).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";
import type { Ty } from "../../../../src/compiler/typecheck/types.js";
import type {
  TypedDecl,
  TypedExpr,
  TypedPattern,
} from "../../../../src/compiler/typecheck/typed-ast.js";

function findMetaInTy(t: Ty): boolean {
  switch (t.kind) {
    case "TyMeta":
      return true;
    case "TyRigid":
    case "TyUnit":
    case "TyError":
      return false;
    case "TyCon":
      return t.args.some(findMetaInTy);
    case "TyFun":
      return findMetaInTy(t.from) || findMetaInTy(t.to);
    case "TyRecord":
      return t.fields.some((f) => findMetaInTy(f.ty));
  }
}

function findMetaInPattern(p: TypedPattern): boolean {
  if (findMetaInTy(p.ty)) return true;
  if (p.kind === "PatternCon") return p.args.some(findMetaInPattern);
  if (p.kind === "PatternRecord") return p.fields.some((f) => findMetaInPattern(f.pattern));
  return false;
}

function findMetaInExpr(e: TypedExpr): boolean {
  if (findMetaInTy(e.ty)) return true;
  switch (e.kind) {
    case "ExprApp":
      return findMetaInExpr(e.fn) || findMetaInExpr(e.arg);
    case "ExprField":
      return findMetaInExpr(e.record);
    case "ExprRecord":
      return e.fields.some((f) => findMetaInExpr(f.value));
    case "ExprRecordUpdate":
      return findMetaInExpr(e.record) || e.fields.some((f) => findMetaInExpr(f.value));
    case "ExprList":
      return e.elements.some(findMetaInExpr);
    case "ExprLambda":
      return e.params.some(findMetaInPattern) || findMetaInExpr(e.body);
    case "ExprLet":
      for (const b of e.bindings) {
        if (findMetaInTy(b.scheme.ty)) return true;
        if (b.params.some(findMetaInPattern)) return true;
        if (findMetaInExpr(b.body)) return true;
      }
      return findMetaInExpr(e.body);
    case "ExprCase":
      if (findMetaInExpr(e.scrutinee)) return true;
      return e.branches.some(
        (br) => findMetaInPattern(br.pattern) || findMetaInExpr(br.body),
      );
    case "ExprInfix":
      return findMetaInExpr(e.left) || findMetaInExpr(e.right);
    default:
      return false;
  }
}

function findMetaInDecl(d: TypedDecl): boolean {
  if (d.kind !== "Definition") return false;
  if (findMetaInTy(d.scheme.ty)) return true;
  for (const eq of d.equations) {
    if (eq.params.some(findMetaInPattern)) return true;
    if (eq.body && findMetaInExpr(eq.body)) return true;
    if (eq.guards) {
      for (const gr of eq.guards) {
        if (findMetaInExpr(gr.condition)) return true;
        if (findMetaInExpr(gr.body)) return true;
      }
    }
  }
  return false;
}

test("successful TypedProgram contains no TyMeta anywhere", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice =",
      "  | A Int",
      "  | B Int",
      "",
      "score :: Choice -> Int",
      "score c =",
      "  case c of",
      "    A x -> x",
      "    B x -> x",
      "",
      "id :: Int -> Int",
      "id x = x",
      "",
      "main :: Int",
      "main =",
      "  let f x = x",
      "  in f 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
    assert.ok(o.program !== null);
    for (const mod of o.program!.modules.values()) {
      for (const d of mod.declarations) {
        assert.ok(
          !findMetaInDecl(d),
          `residual TyMeta in decl '${(d as { name?: string }).name ?? d.kind}'`,
        );
      }
    }
  } finally {
    await o.cleanup();
  }
});
