# Black Demo — Phase 5 Real JavaScript Code Generation

Project: black-demo

Implement genuine JavaScript ES-module code generation for the pure preview-web-1 Black subset, consuming the Phase-4 TypedProgram and preserving frozen Black semantics. Replace the Phase-1 placeholder artifact with source-derived executable JavaScript while retaining all 613 Phase-4 tests. Do not begin Phase 6.

## Phase 05: Real JavaScript Code Generation

Compile successfully typed Black programs directly from TypedProgram to deterministic JavaScript ES modules and make white build/run operate on the generated program. Preserve semantic identity, evaluation order, stale-artifact safety, structured diagnostics, and the Phase-5 handoff's complete acceptance contract.

Depends on: (none)

### Sub-phases

- 01: Backend boundary and semantic identity
  Establish the direct TypedProgram-to-JavaScript backend boundary, deterministic module/artifact layout, generated identifier strategy based on semantic DefIds/module identity, source-span provenance, and structured unsupported-codegen diagnostics. Do not reparse, reresolve, reinfer types, or introduce an intermediate compiler IR.
  Depends on: (none)

- 02: Primitive expressions and functional core
  Generate executable JavaScript for primitive literals, operators, curried functions, application, partial application, lambdas, strict left-to-right evaluation, sequential non-recursive let, and erased rank-1 polymorphism.
  Depends on: 01

- 03: Records and lists
  Generate executable JavaScript for structural records, field access, immutable record update, nested records, record construction source evaluation order, lists, and list element evaluation order.
  Depends on: 02

- 04: Variants and pattern execution
  Generate executable JavaScript for closed variants, zero/single-payload constructors, Maybe, semantic constructor runtime identity, case expressions, literal/wildcard/variable/record/nested patterns, multiple function equations, and ordered guards.
  Depends on: 03

- 05: Modules, recursion, and cross-module execution
  Preserve the resolved Black module graph in deterministic ES modules and support top-level recursion, forward references, cross-module calls, imported/exported semantic declaration identity, and same-spelled constructors from different modules without collisions.
  Depends on: 04

- 06: White build/run integration
  Replace the Phase-1 fixed marker emitter with real source-derived JavaScript in white build; make white run execute the current generated entry module; preserve parse/resolve/typecheck failure gates and stale-artifact protection; update capabilities/help/version/README truthfully for phase-5-js-codegen.
  Depends on: 05

- 07: Adversarial mutation campaign and Phase-5 closure
  Implement and physically verify mutation tests M65-M79, run the complete positive and negative execution matrices, preserve all 613 Phase-4 tests, run the authoritative ./scripts/test Docker gate, produce the required Phase-5 retrospective, and stop without beginning any Phase-6 browser-platform work.
  Depends on: 06
