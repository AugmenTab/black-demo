# Black Demo Vertical Slice
## Phase 5 — Real JavaScript Code Generation

### Status

Phases 0–4 are closed.

Current authoritative baseline:

```text
613 tests
613 passing
0 failing
0 skipped
```

Phase 5 replaces the synthetic Phase-1 build artifact with real executable JavaScript generated from typed Black source.

Do not begin Phase 6.

---

# 1. Objective

Implement a genuine JavaScript backend for the pure `preview-web-1` subset.

Pipeline becomes:

```text
.blk source
→ parse
→ resolve
→ typecheck
→ TypedProgram
→ JavaScript emission
→ ES modules
→ Node execution
```

`white build` must now emit JavaScript corresponding to the actual Black program.

`white run` must execute that emitted program.

The Phase-1 fixed marker program must be removed from successful builds.

---

# 2. Architectural boundary

Phase 5 consumes:

```text
TypedProgram
```

It must not:

- parse source again;
- resolve textual names again;
- infer types again;
- reconstruct constructor identity from spelling;
- inspect source text heuristically.

Semantic choices already settled by earlier compiler phases must be consumed from the Typed AST / compiler environments.

---

# 3. Direct backend is intentional

For this disposable vertical slice:

```text
TypedProgram
→ JS
```

is acceptable.

Do not introduce:

```text
Black Core
Lower IR
optimizer
SSA
CPS
native backend
Wasm backend
```

The eventual compiler will have those layers.

The demo compiler does not need them.

The language semantics must remain authentic even though the implementation architecture is temporary.

---

# 4. Output format

Emit JavaScript as ES modules.

Each Black module should lower to an emitted JavaScript module or an equivalent deterministic ES-module layout.

Preserve the Black module dependency graph.

Do not concatenate source modules using textual tricks.

---

# 5. Module semantics

Black:

```black
module Game.Model (Shape (..), area)
```

must result in JavaScript whose externally available bindings correspond only to Black declarations that the resolved program exposes as needed by downstream generated modules.

Do not reimplement Black export visibility in JavaScript source-text analysis.

Use resolver/typechecker semantic information.

---

# 6. Semantic-name lowering

Generated JavaScript identifiers do not need to preserve user spelling exactly.

They must preserve semantic identity.

Two distinct Black declarations with the same source spelling in different modules must not accidentally collide in generated code.

A reasonable scheme may incorporate:

```text
module identity
DefId
sanitized source name
```

Exact naming is implementation-defined.

---

# 7. Do not rely on JavaScript lexical coincidences

This is wrong architecture:

```text
Black `foo`
→ always JS `foo`
```

if correctness depends on spelling uniqueness.

The backend has semantic DefIds available.

Use them.

---

# 8. Primitive values

Lower:

```text
Int
Float
Bool
Text
()
```

to practical JavaScript representations.

For the preview:

```text
Int / Float → JS number
Bool        → JS boolean
Text        → JS string
()          → one canonical unit representation
```

The exact internal representation of `()` is implementation-defined.

Do not claim this establishes Black's future native numeric ABI.

---

# 9. Integer caveat

Using JavaScript `number` for preview `Int` is a backend shortcut.

Do not advertise JavaScript number behavior as Black's final integer semantics.

The primitive numeric/ABI semantic gate remains deferred.

---

# 10. Functions

Black functions are curried.

Example:

```black
add :: Int -> Int -> Int
add x y =
  x + y
```

must behave as:

```text
add 1 2
```

under Black application semantics.

A straightforward JavaScript lowering is nested unary functions.

For example conceptually:

```js
const add = x => y => x + y;
```

Exact formatting is flexible.

---

# 11. Function application

Black application:

```black
f x y
```

means:

```text
(f x) y
```

Generated JavaScript must preserve that behavior.

Do not convert arbitrary Black functions into JavaScript n-ary calling convention unless you can prove semantic equivalence across partial application.

For this phase, prefer canonical unary currying.

---

# 12. Lambdas

Lower:

```black
\x -> body
```

to ordinary JavaScript closures.

Multi-parameter Black lambdas remain nested unary functions.

Captured bindings must correspond to the resolved lexical binding identity.

---

# 13. Sequential `let`

Preserve the frozen semantics:

```black
let
  a = first
  b = use a
in
  result b
```

RHS evaluation is sequential, source ordered, and non-recursive.

Generated JavaScript must evaluate:

```text
a before b
```

and `b` may use `a`.

Do not emit mutually recursive declarations.

---

# 14. Strict evaluation

Black is strict by default.

Observable expression evaluation order is left-to-right.

The JavaScript backend must not accidentally reorder:

- function expression evaluation;
- argument evaluation;
- record field value evaluation;
- list element evaluation;
- sequential let RHSes;
- operator operands.

Even though the current pure subset exposes little observable effect, preserve the semantic rule now.

---

# 15. Records

Lower structural records to ordinary JavaScript objects or another simple fixed representation.

Required operations:

```text
construction
field access
record update
record patterns
nested records
```

JavaScript property order must not become Black type identity.

---

# 16. Record construction evaluation order

Black record field type order is irrelevant.

Source expression evaluation order is not.

For:

```black
{ b = f ()
, a = g ()
}
```

the backend must preserve the source evaluation order represented by the Typed AST.

Do not alphabetically reorder field expressions merely because type fields are canonicalized.

---

# 17. Record access

Black:

```black
player.lives
```

must lower to the corresponding structural field read.

At this point the typechecker has already established that the field exists.

The backend should not add runtime “unknown field” recovery.

---

# 18. Record update

Black:

```black
player { lives = player.lives - 1 }
```

produces a new record value with the specified field replaced.

For the preview, ordinary JavaScript object-copy/update semantics are acceptable.

Do not mutate the original record as an optimization in Phase 5.

Future ownership-aware optimization is not part of this backend.

---

# 19. Lists

Lower Black lists to JavaScript arrays for the preview.

Required:

```text
[]
[e1, e2, e3]
```

Preserve element evaluation order.

No general List runtime API is required yet beyond syntax actually used by the preview.

---

# 20. Closed variants

Implement a deterministic runtime representation for closed variants.

It must preserve semantic constructor identity.

Do not rely solely on constructor spelling.

A representation may conceptually resemble:

```js
{
  $ctor: <generated semantic constructor tag>,
  $value: payload
}
```

for payload constructors, and:

```js
{
  $ctor: <generated semantic constructor tag>
}
```

for nullary constructors.

Exact property names are implementation details.

---

# 21. Constructor runtime identity

Two independently declared:

```text
A.Ready
B.Ready
```

must have different runtime constructor tags.

This must follow semantic constructor identity.

Do not use:

```js
$ctor: "Ready"
```

alone as runtime identity.

A generated DefId/module-qualified tag is acceptable for the disposable compiler.

---

# 22. Variant payloads

Black alternatives carry:

```text
zero payloads
or
one arbitrary payload
```

The backend must preserve that model.

Do not introduce general JavaScript-style variadic constructors.

Record payloads remain one record value.

---

# 23. `Maybe`

Lower:

```black
Some x
None
```

using the same variant representation as ordinary closed variants.

Do not create a completely unrelated special runtime encoding unless there is a compelling implementation reason.

Semantically it remains a closed variant.

---

# 24. Case expressions

Compile typed `case` expressions into ordinary JavaScript branching.

At runtime, dispatch may inspect:

```text
variant constructor tag
literal value
record structure as needed
```

The compile-time exhaustiveness checker has already established totality.

No runtime “non-exhaustive case” fallback should be reachable from well-typed generated Black.

---

# 25. Variant pattern matching

For:

```black
case shape of
  Circle radius -> ...
  Square side -> ...
```

generated dispatch must use semantic constructor runtime identity.

Payload extraction then binds the branch-local variable.

---

# 26. Literal patterns

Support the preview's typed literal patterns:

```text
Bool
Int
Float
Text
```

using appropriate JavaScript comparison semantics for their chosen runtime representation.

---

# 27. Wildcard and variable patterns

Wildcard:

```black
_
```

performs no binding.

Variable:

```black
x
```

binds the matched value.

The generated name must correspond to that local binder's semantic identity, not merely textual spelling where collision is possible.

---

# 28. Record patterns

Selective record patterns must lower correctly.

Example:

```black
{ x }
```

against:

```text
{ x, y, z }
```

binds only `x`.

Do not synthesize runtime checks/bindings for omitted fields merely because the exhaustiveness engine normalized them internally.

Use the source-faithful TypedPattern.

---

# 29. Nested patterns

Nested combinations supported by the preview must execute correctly, including:

```text
variant payload containing record
record field containing variant
nested record patterns
```

---

# 30. Function equations

Multiple Black function equations must lower into one callable JavaScript function value implementing pattern dispatch.

Example:

```black
not :: Bool -> Bool
not True = False
not False = True
```

must execute correctly.

The backend may reuse pattern-compilation helpers internally.

Do not assume only one equation per function.

---

# 31. Guards

Guarded definitions must preserve source order.

Example:

```black
classify :: Int -> Text
classify x
  | x < 0 = "negative"
  | x == 0 = "zero"
  | otherwise = "positive"
```

must test guards left-to-right.

The typechecker already guarantees guard expressions are `Bool` and coverage is valid.

---

# 32. Operators

Compile the fixed preview operators:

```text
+
-
*
/
==
<
<=
>
>=
```

according to the operator semantic identity established before Phase 5.

Do not choose codegen behavior purely from source spelling if Typed AST/resolved identity is available.

---

# 33. Operator semantics

Preview backend lowering:

```text
+ - * /
< <= > >=
```

may use corresponding JavaScript numeric operators where their already-typechecked operand types permit it.

`==` must implement the Phase-4 preview equality semantics, not arbitrary JavaScript coercive equality.

Never emit JavaScript `==`.

Use strict/value-appropriate equality.

---

# 34. Modules and imports

Generated modules should import generated dependencies using deterministic paths.

Black import aliases and canonical module qualification are compile-time concepts.

Do not needlessly reproduce Black import syntax at runtime.

After resolution, uses already identify the target declaration.

---

# 35. Exported constructors

Constructor visibility was enforced by the resolver.

The backend should emit what reachable generated modules require without accidentally making hidden Black constructors semantically accessible through White/Black source.

JavaScript implementation details are not themselves Black visibility.

Do not re-open name resolution.

---

# 36. Top-level recursion

Explicit top-level signatures and the global semantic environment allow ordinary top-level recursive references.

Generated JS must support recursive top-level functions used by the preview.

Take ES module initialization/temporal-dead-zone behavior into account.

A safe transformation may emit function declarations or otherwise arrange initialization to support recursion.

---

# 37. Forward top-level references

A function may call a declaration appearing later in the Black source/module.

Generated code must not depend on declaration source ordering in a way that breaks this.

---

# 38. Cross-module calls

A function in module A calling a function exported/imported from B must execute through the generated module relationship.

Add end-to-end coverage.

---

# 39. `white build`

Replace placeholder emission.

Before Phase 5:

```text
successful build
→ fixed Phase-1 "Black preview pipeline alive." program
```

After Phase 5:

```text
successful build
→ actual generated JavaScript for the Black project
```

No fixed marker program.

---

# 40. Build artifacts

Emit under the existing project build/output directory.

Exact layout may evolve, but make it deterministic.

Include enough artifact metadata for `white run` to locate the generated entry module without guessing.

---

# 41. `white run`

`white run` must:

1. rebuild/current-source-check using the normal pipeline;
2. execute the generated entry module;
3. propagate process success/failure correctly.

It must never run an old artifact after parse/resolve/typecheck/codegen failure.

Preserve all existing stale-artifact protections.

---

# 42. Program entrypoint

Use the existing preview entrypoint convention.

Do not invent a new language-level `main` model unless required by the current demo profile.

The emitted entry wrapper may invoke/export the current `main` appropriately for Node execution.

---

# 43. Unit-valued `main`

Existing examples use:

```black
main :: ()
```

A unit-valued pure `main` should execute successfully.

Do not require it to print anything.

Integration tests should verify execution using observable return/fixture behavior rather than preserving the old marker.

---

# 44. Executable test fixtures

Create Black fixtures whose correctness can be observed from Node.

A practical generated JS harness may expose or print a value for integration tests, but do not alter Black semantics merely to make assertions easier.

Prefer testing emitted module exports directly where practical.

---

# 45. Required execution coverage

At minimum execute real generated programs covering:

```text
primitive literals
arithmetic
comparison/equality
function calls
currying/partial application
lambdas
sequential let
local polymorphic helper after erasure
records
field access
record update
lists
variants
constructor payloads
Maybe
case expressions
wildcards
variable patterns
record patterns
multiple function equations
guards
top-level recursion
forward references
cross-module references
qualified constructor source
```

---

# 46. Typed polymorphism and JS

Rank-1 polymorphism requires no runtime type representation in this preview.

Generated JS may erase type abstraction/instantiation entirely.

The same emitted function value can serve:

```text
identity 1
identity "hello"
```

because JavaScript is dynamically represented.

This is backend erasure after successful static checking, not runtime dynamic typing replacing Black's type system.

---

# 47. Type erasure

Most Phase-4 `Ty` information may disappear in emitted JavaScript.

Do retain semantic information needed for:

```text
constructor runtime tags
correct primitive/operator lowering
pattern compilation
module/declaration identity
```

No runtime typechecker is required.

---

# 48. Error discipline

If codegen encounters a Typed AST node that Phase 5 does not support, do not emit malformed JavaScript.

Emit a compiler diagnostic such as:

```text
BLACK_CODEGEN_UNSUPPORTED
```

or equivalent.

Distinguish:

```text
well-typed preview feature not yet implemented by backend
```

from:

```text
invalid Black
```

The latter should already have failed before codegen.

---

# 49. No hidden Pong behavior

The backend must remain project-generic.

Do not add:

```text
Pong-specific code
special Game module handling
special Player handling
special Canvas behavior
private evaluator hooks
```

Phase 5 compiles Black.

It does not know what application Black is being used to build.

---

# 50. AI-facing honesty

Any structured codegen/build diagnostics exposed through White must come from genuine backend state.

Do not add AI-specific hints based on the expected demo solution.

This continues the rule:

> disposable implementation, authentic interaction model.

---

# 51. Source maps / provenance

Full JavaScript source maps are not required.

However, codegen errors must retain the Black source span from the Typed AST.

Do not lose provenance before diagnostics are complete.

---

# 52. Generated-code readability

Generated JS does not need to be pretty.

It should be deterministic and reasonably inspectable for debugging.

Do not spend Phase 5 building a formatter/minifier.

---

# 53. Capabilities

After Phase 5:

```json
{
  "source_parsing": true,
  "name_resolution": true,
  "typechecking": true,
  "source_codegen": true
}
```

Update implementation stage to something truthful such as:

```text
phase-5-js-codegen
```

Do not claim:

```text
Black Core
native compilation
Wasm
effects
ownership
browser platform runtime
```

---

# 54. Help/version/docs

Update:

```text
white --help
white --version
white capabilities
README
```

to state that real preview JavaScript code generation is implemented.

Remove any text that still describes build output as a placeholder.

---

# 55. Preserve earlier failures

Programs that fail:

```text
parse
resolution
typechecking
```

must still produce no runnable fresh artifact.

Add codegen failure to the same invariant.

---

# 56. Codegen test organization

Suggested:

```text
test/compiler/codegen/
  primitives.test.ts
  functions.test.ts
  records.test.ts
  variants.test.ts
  patterns.test.ts
  operators.test.ts
  modules.test.ts
  recursion.test.ts
  mutation-coverage.test.ts
```

Plus integration tests under the existing CLI/integration suites.

Exact filenames are flexible.

---

# 57. Prefer semantic golden behavior over JS-string goldens

Avoid tests that mainly assert generated JS formatting.

Prefer:

```text
compile Black
execute generated JS
assert result
```

Use JS-text assertions only for architectural invariants that cannot be observed behaviorally.

---

# 58. Mutation campaign

Add physical mutations targeting codegen semantics.

At minimum:

### M65 — application becomes uncurried

Generate:

```js
f(x, y)
```

instead of nested application.

Partial-application test must fail.

### M66 — sequential let order reversed

Later/earlier binding execution order mutation must fail.

### M67 — record construction field expressions reordered

Source-order execution test must fail.

### M68 — record update mutates original

Aliasing/old-value test must fail.

### M69 — constructor runtime tag uses spelling only

Same-spelling constructors from different variants become indistinguishable.

Must fail.

### M70 — variant payload not preserved

Payload match/extraction test must fail.

### M71 — case chooses wrong constructor branch

Must fail.

### M72 — wildcard/variable pattern binding broken

Must fail.

### M73 — guard order reversed

Must fail.

### M74 — local let becomes recursive/predeclared in emitted JS

Sequential-let behavior must fail.

### M75 — top-level forward reference breaks

Must fail.

### M76 — top-level recursion breaks

Must fail.

### M77 — cross-module DefId mapped to wrong export/import

Must fail.

### M78 — codegen runs despite typecheck failure

Existing build/run gating must catch.

### M79 — stale generated artifact runs after codegen failure

Must fail.

---

# 59. Constructor-identity adversarial case

Carry forward the Phase-4 identity discipline.

Two variants:

```text
A.Ready
B.Ready
```

must remain different at runtime.

A spelling-only `$ctor: "Ready"` mutation must be caught.

This is especially important because JavaScript has no static constructor namespace to save us.

---

# 60. Evaluation-order tests

Although the Phase-5 subset is pure, build internal/testing fixtures capable of observing evaluation order without changing Black semantics.

If the current pure language lacks an observable mechanism, a test-only backend hook or inspection harness may be used at the generated-JS level.

Do not add an observable language feature solely for testing.

---

# 61. Docker authority

All validation remains inside the Phase-0.5 dev container.

Required final:

```bash
./scripts/test
```

Do not count host-only execution.

---

# 62. Phase-5 acceptance criteria

Phase 5 closes only when:

- backend consumes `TypedProgram`;
- real JS replaces the placeholder emitter;
- ES-module output is deterministic;
- semantic DefIds drive declaration/codegen identity;
- primitive expressions execute;
- curried functions execute;
- partial application works;
- lambdas execute;
- sequential let executes correctly;
- records construct/access/update correctly;
- lists execute correctly;
- closed variants preserve semantic constructor identity;
- zero/single payload constructors execute;
- Maybe executes;
- case expressions execute;
- record/variant/literal/wildcard/variable patterns execute;
- multiple equations execute;
- guards execute in order;
- operators execute according to Phase-4 semantics;
- polymorphic functions work after type erasure;
- top-level recursion works;
- forward top-level references work;
- cross-module references work;
- `white build` emits real source-derived JS;
- `white run` executes it;
- stale artifact protection survives;
- codegen failures are structured;
- `source_codegen: true`;
- M65–M79 are physically caught;
- all 613 Phase-4 tests remain green;
- no Phase-6/browser-platform work begins.

---

# 63. Required retrospective

Return:

1. files added/modified;
2. backend architecture;
3. generated module layout;
4. semantic JS naming strategy;
5. primitive representations;
6. unit representation;
7. function/currying representation;
8. application lowering;
9. let lowering and evaluation order;
10. record representation;
11. record-update behavior;
12. list representation;
13. variant runtime representation;
14. constructor semantic-tag strategy;
15. Maybe representation;
16. pattern-compilation strategy;
17. case lowering;
18. multiple-equation lowering;
19. guard lowering;
20. operator lowering;
21. polymorphism/type-erasure behavior;
22. recursion/forward-reference strategy;
23. cross-module import/export strategy;
24. codegen diagnostics;
25. `white build` behavior;
26. `white run` behavior;
27. removal of placeholder emission;
28. capabilities/help/version/README changes;
29. positive execution matrix;
30. negative build/run matrix;
31. final Docker test count;
32. M65–M79 failure counts and exact catching tests;
33. tests changed/deleted/skipped/weakened;
34. contradictions found;
35. unsupported features encountered;
36. remaining blockers for Phase 6;
37. explicit confirmation no Black Core, Lower IR, optimizer, effects, ownership, native/Wasm backend, or browser-platform phase was implemented.

---

# 64. Stop condition

Do not begin Phase 6.

Stop once real typed Black programs in the supported pure preview subset compile to JavaScript, execute correctly under Node, survive the adversarial mutation campaign, and are returned for review.
