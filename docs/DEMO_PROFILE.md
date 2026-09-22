# Black Demo Profile — `preview-web-1`

**Status:** Phase 0 authoritative contract.
**Supersedes:** any pre-Phase-0 informal notes.
**Bounded by:** `.local/plans/phase-00.md` (§1–§42) and the Black Language Specification — Canonical Semantic Freeze Edition.

---

## 1. What this document is

This profile defines what the disposable Black + White demonstration implementation accepts, rejects, and does. It is the single source of truth another engineer or coding agent needs to answer:

- What are we building?
- What Black constructs does this compiler support?
- What valid Black constructs does it intentionally omit?
- What counts as correct behavior?
- What platform facilities will be available?
- What White functionality must exist?
- What is this project specifically forbidden from turning into?

If those questions are ambiguous after reading this document, Phase 0 is not complete.

---

## 2. Project identity

- **Repository:** `black-demo`
- **Profile identity:** `preview-web-1`
- **Source file extension:** `.blk`
- **Backend:** JavaScript ES modules only
- **Execution environments:** Node.js and modern browsers only

`preview-web-1` is implementation metadata. It is **not** a new dialect of Black. It labels a specific compiler build that implements a specific subset of frozen Black semantics.

---

## 3. Project purpose and disposability

This project exists to support one experiment:

> A coding agent with no prior Black knowledge should be able to discover the language and tooling through White, implement the N-Player Polygon Pong PRD, run and verify it, and complete the task in approximately one hour.

The implementation is **disposable**. It will not evolve into the production Black compiler or the production White toolchain. Only the following survive conceptually:

- lessons about Black ergonomics;
- lessons about AI discoverability;
- useful test cases;
- useful diagnostic conventions;
- successful White interaction patterns;
- evidence gathered from blind-agent trials.

The production Black/White implementation is expected to begin from a fresh codebase.

Optimize for: minimal engineering effort, semantic honesty of the supported Black subset, rapid iteration, reliable execution of Polygon Pong, and excellent discoverability for an unfamiliar AI coding agent.

Do **not** optimize for future compiler reuse.

---

## 4. Authoritative language source

The **Black Language Specification — Canonical Semantic Freeze Edition** is authoritative. Where older design documents conflict with the Semantic Freeze edition, the Semantic Freeze edition wins.

The demo compiler implements only a subset of Black. But:

> Anything the demo compiler claims to implement must behave according to frozen Black semantics to the extent that the supported feature exposes those semantics.

The implementation may simplify its internals arbitrarily. It may **not** silently invent alternative Black syntax or semantics because they are easier to transpile.

---

## 5. Repository shape

One repository:

```text
black-demo/
  src/
    compiler/
    white/
    runtime/
  std/
  examples/
  reference/
  test/
  docs/
  scripts/
```

Internal directories under `src/` may evolve after Phase 0. The project remains one repository.

---

## 6. Feature classification

Every Black-related feature falls into exactly one of three categories. White must eventually expose this distinction.

| Category | Meaning | Example |
|---|---|---|
| **A. Supported Black** | Implemented in `preview-web-1`, must behave per frozen semantics. | closed variant declarations |
| **B. Valid Black, unavailable in this compiler** | Part of frozen Black; deliberately not implemented in `preview-web-1`. | algebraic effects |
| **C. Not valid Black** | Rejected because Black itself does not have it. | JavaScript-style function-call syntax `f(x, y)` |

Machine-readable form (illustrative):

```json
{
  "feature": "algebraic-effects",
  "language_status": "valid-black",
  "compiler_status": "not-implemented",
  "profile": "preview-web-1"
}
```

Category B omissions must never be documented in a way that implies Black itself lacks the feature.

---

## 7. Supported Black surface (Category A)

### 7.1 Source files and modules

- `.blk` files, one module per file.
- Module name corresponds to file path.
- Explicit module export lists are required.
- Explicit imports are required.
- Qualified imports use `as`.
- Prelude is implicit.

```black
module Game.Model
  ( Phase (..)
  , Player
  , update
  )

import Game.Geometry (Arena)
import Platform.Server as Server
```

**Import qualification.** A **selected import** introduces the selected
declarations unqualified and makes those same selected declarations available
through the imported module's canonical qualified name. A **qualified `as`
import** introduces only its module alias and permits that alias to access the
module's exported interface. An aliased import does *not* independently
introduce the canonical module path as an additional qualifier.

Given `module Foo.Bar (x, y, Shape (..))` and:

```black
import Foo.Bar (x, Shape (..))
import Foo.Bar as B
```

then:

```text
x, Shape, Circle           -- visible unqualified from the selected import
Foo.Bar.x                  -- visible through the canonical selected qualifier
Foo.Bar.Shape, Foo.Bar.Circle  -- ditto (Type (..) exposes constructors too)
B.x, B.Shape, B.Circle, B.y    -- visible through the alias
Foo.Bar.y                  -- NOT visible: y was not selected
y                          -- NOT visible: y was not selected
```

Unqualified use, canonical-qualified use, and alias-qualified use of the same
declaration all resolve to the same `DefId`. Import order does not affect
visibility.

**Module qualifier collisions.** A single-segment qualifier spelling can be
bound by either an alias (`import M as Q`) or by the leading segment of a
canonical selected import (`import Q (…)`, or `import Q.Sub (…)` where the
qualifier chain re-enters `Q`). The resolver collects every module identity
that a qualifier could denote and then collapses them by semantic module id:

- **Same module through multiple sources** — `import Foo (x)` combined with
  `import Foo as Foo` names one identity. The reference is not ambiguous, and
  member lookup unions the visibility surfaces (`Foo.x` from the selected
  scope, `Foo.y` from the alias's whole-interface view).
- **Different modules under the same qualifier** — `import Foo (x)` combined
  with `import Bar as Foo` names two identities. Any use of `Foo.` fails with
  `BLACK_MODULE_QUALIFIER_AMBIGUOUS`, regardless of import order and
  regardless of whether the referenced member happens to exist in only one of
  the candidates.

### 7.2 Function declarations

Top-level function signatures are **required**. Supported:

- named functions
- curried application
- recursion
- top-level signatures
- function parameters
- lambdas (see 7.4)

```black
movePaddle :: Float -> Player -> Player
movePaddle position player =
  player { paddlePosition = position }
```

### 7.3 Function application

Ordinary Black juxtaposition:

```black
f x
f x y
map update players
```

Parentheses group expressions. `f(x, y)` is **not** valid Black call syntax (Category C).

### 7.4 Lambdas

Named-parameter lambdas, including multi-parameter form:

```black
\x -> x + 1
\x y -> x + y
```

**Prototype decision:** multi-parameter lambdas are supported and desugar to nested single-parameter lambdas. Underscore lambdas (`_ + 1`) are **not** supported in `preview-web-1` and may only be added later if the reference Pong implementation demonstrates a material ergonomic need.

### 7.5 Local bindings

`let ... in`:

```black
let
  x = ...
  y = ...
in
  ...
```

Local `let` bindings are **sequential and non-recursive**. A binding's
right-hand side may reference bindings introduced earlier in the same `let`
block, but not itself or later sibling bindings. The `in` body sees all
bindings from the block.

Local-binding `where` is **not** supported in `preview-web-1`.

### 7.6 Records (closed, structural)

Type:

```black
type Player =
  { name           :: Text
  , lives          :: Int
  , paddlePosition :: Float
  }
```

Construction:

```black
player =
  { name = "Tyler"
  , lives = 5
  , paddlePosition = 0.5
  }
```

Access:

```black
player.lives
```

Update:

```black
player { lives = player.lives - 1 }
```

Record punning (`{ name, lives }`) is valid Black syntax but intentionally **unavailable** in `preview-web-1` (Category B). Rationale: not required by the Pong PRD; simplest choice for the profile. May be added later without reopening language semantics if reference-implementation ergonomics require it.

Not supported: open record rows, row-polymorphic record inference.

### 7.7 Variants (closed)

Canonical mandatory-leading-pipe syntax:

```black
type Phase =
  | Lobby
  | Playing
  | GameOver Text
```

The earlier angle-bracket syntax is superseded and must be rejected.

Supported:

- nullary alternatives
- one payload per alternative
- record payloads
- construction
- pattern matching

Example with a record payload:

```black
type Message =
  | Join Player
  | PaddleMoved
      { playerId :: Text
      , position :: Float
      }
```

Not supported: open variants, stable external alternative tags, indexed alternatives, branch refinements, GADT-style constraints.

### 7.8 Type aliases

Transparent aliases only:

```black
type PlayerId = Text
```

Nominal types (`nominal type PlayerId = Text`) are **not** supported.

### 7.9 Pattern matching

```black
case value of
  Constructor payload ->
    ...

  Other ->
    ...
```

Required pattern forms: variable, wildcard `_`, literals, variant alternatives, record patterns.

Guards are supported:

```black
clamp x
  | x < 0.0 = 0.0
  | x > 1.0 = 1.0
  | otherwise = x
```

Not initially required: multiple-scrutinee cases, as-patterns.

### 7.10 Exhaustiveness

Closed-variant pattern matches must be exhaustive. Given:

```black
type Phase =
  | Lobby
  | Playing
  | GameOver Text
```

this must fail:

```black
case phase of
  Lobby ->
    ...

  Playing ->
    ...
```

unless an appropriate catch-all pattern exists.

Refinement-aware exhaustiveness is out of scope because dependent/indexed variants are not implemented.

### 7.11 Primitive types

Supported:

```text
Int
Float
Bool
Text
()
List a
Maybe a
```

The unit type is spelled `()` in both type and expression position, matching canonical Black. `()` is both the unit type constructor and the unit value; there is no `Unit` alias.

The observable `Maybe` surface for `preview-web-1` is:

```black
type Maybe a =
  | Some a
  | None
```

`Maybe` may be implemented internally as ordinary bundled Black code or as a compiler/runtime intrinsic; the mechanism is not observable, but the observable constructors are `Some` and `None`. If the reference Pong implementation and its supporting examples never use `Maybe`, it may be removed from guaranteed Category A through the normal scope-change process; until then, `Some` / `None` are locked.

### 7.12 Literals

```black
42
3.14159
True
False
"hello"
[1, 2, 3]
```

Omitted from `preview-web-1` unless required: hexadecimal, octal, binary, numeric separators, character literals, string interpolation, contextual literal machinery. Full Black permits richer literal behavior; the preview compiler need only expose the subset required for the demonstration.

### 7.13 Operators

The Semantic Freeze fixes Black's **operator mechanism**:

- operators have named-function semantic identities
- fixity uses `infixl`, `infixr`, or `infix`
- precedence ranges from 0 through 9
- examples include operators such as `+`, `<>`, and `==`
- operator sections are not part of Black

The Semantic Freeze does **not** freeze a complete production Prelude operator catalog for this prototype. The particular builtin operator set shipped by `preview-web-1` is a **prototype Prelude/runtime choice** and is not a commitment to the future Black standard library.

Initial `preview-web-1` builtin operator table:

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

Inequality is intentionally omitted until the reference Pong implementation demonstrates it is needed; the same holds for Boolean conjunction (`&&`) and disjunction (`||`). If any of these become useful during implementation, they may be added later as ordinary prototype Prelude operators/functions without reopening language semantics.

Not supported: user-defined infix operators, user-defined precedence, user-defined associativity, operator declaration syntax. The compiler may hard-code its operator table.

### 7.14 Lists and collection operations

`List a` is internally a JavaScript `Array`. Observable operations remain semantically immutable.

Initial candidates (add only when demonstrated by the reference implementation):

```text
map
filter
filterMap
foldl
length
append
find
all
any
range
indexed
```

This is **not** a commitment to the future Black standard library.

---

## 8. Prototype numeric semantics

The final Black primitive numeric contract is **not** frozen. The Semantic Freeze explicitly leaves integer widths, overflow behavior, conversions, floating-point details, layout, and ABI behavior as an implementation gate.

For `preview-web-1`:

```text
Int
  represented using JavaScript Number
  expected to contain integer-valued numbers

Float
  represented using JavaScript Number
```

This behavior is **prototype-specific**, **backend-specific**, **not a promise about production Black**, and **not a stable ABI**. Phase 0 does not design final Black numeric semantics.

---

## 9. Typechecking scope

The demo compiler performs genuine static checking for the supported subset. At minimum:

- function signatures are checked
- function application is checked
- record fields are checked
- record construction is checked
- record updates are checked
- variant payloads are checked
- case branches are checked
- case result types agree
- list elements are checked
- operators receive appropriate operand types
- closed variant matches are exhaustive

A source program that violates supported Black semantics must fail **before** JavaScript execution.

---

## 10. Type inference scope

The demo compiler may exploit required top-level signatures aggressively.

Required:

- local expression inference sufficient to check ordinary function bodies
- local bindings
- lambda arguments where inferable from context
- builtin polymorphic operations as needed

Initially optional:

```text
general user-defined polymorphic inference
class constraint inference
row inference
higher-rank polymorphism
polymorphic recursion
```

If user-defined polymorphism becomes necessary for sensible Pong code, implement only the smallest rank-1 mechanism sufficient.

---

## 11. Features intentionally unavailable in `preview-web-1` (Category B)

Valid Black; **not** implemented in this compiler. Their omission must **never** be documented as meaning Black lacks the feature.

```text
algebraic effects
effect rows
handlers
Fail
do
ado

classes
instances
associated/dependent class members

open record rows
open variant rows
record punning

dependent types
refinements
proof terms
Fin
finite-type machinery
indexed/GADT variants

Unique
Shared
Borrow
BorrowMut
move
share
drop
ownership analysis

FnMut
FnOnce
closure ownership semantics

structured concurrency
Task
scope
spawn
cancel
join
Sendable

unsafe implementation regions
FFI declaration syntax

nominal types

deriving

user-defined operators/fixity

hot replacement

persistent semantic index

incremental compilation

production package management

native code generation
LLVM
WebAssembly

optimization passes
representation lowering
Black Core
Lower IR

stable native ABI
```

---

## 12. Backend

The only backend is **JavaScript ES modules**, targeting **Node.js** and **modern browsers**. No WebAssembly. No native code. No generalized backend abstraction. The compiler may emit JavaScript directly from its checked AST; generated JavaScript need not be pretty.

### 12.1 Prototype runtime representation

```text
Black Text                -> JavaScript string
Black Bool                -> JavaScript boolean
Black Int / Float         -> JavaScript number
Black record              -> JavaScript object
Black List                -> JavaScript Array
Black function            -> JavaScript function / closure
Black closed variant      -> tagged JavaScript object
```

Variant encoding:

```js
{ $tag: "Lobby" }
{ $tag: "GameOver", value: winner }
```

Record update may compile to:

```js
{ ...player, lives: player.lives - 1 }
```

Performance is not a Phase-0 concern.

---

## 13. Platform runtime (prototype)

Browser and server environments are hidden behind bundled prototype modules:

```text
Platform.Server
Platform.Browser
Platform.Canvas
Platform.Json
Platform.Math
```

These are **prototype runtime APIs**. They are **not** frozen Black standard-library APIs. They may be implemented directly in TypeScript/JavaScript and recognized specially by the compiler if convenient. No production FFI mechanism is required.

> Exact `Platform.*` type, function, constructor, and field names — including illustrative names such as `Server.Event`, `Server.Step`, `Connected`, `Disconnected`, `Message`, `Tick`, `Send`, and `Broadcast` used in the models below — are prototype API design choices and may be finalized during runtime implementation. They are not part of frozen Black language semantics or the future standard-library contract.

### 13.1 Server programming model

Simple event/reducer architecture. Conceptually:

```black
update
  :: Server.Event
  -> ServerState
  -> Server.Step ServerState
```

Server events may include: `Connected`, `Disconnected`, `Message`, `Tick`.
Commands may include: `Send`, `Broadcast`.

The TypeScript runtime owns:

```text
HTTP server
static file serving
WebSocket lifecycle
connection IDs
timers
socket mutation
```

Black owns:

```text
room state
player state
game state
physics
scoring
winner determination
message interpretation
```

### 13.2 Browser programming model

Same reducer philosophy.

Runtime owns:

```text
DOM event listeners
WebSocket object
requestAnimationFrame
Canvas context
browser lifecycle
```

Black owns:

```text
client model
input interpretation
network-message interpretation
render description
UI decisions
```

No VDOM framework. Static HTML and CSS files are allowed.

### 13.3 Canvas programming model

Data-driven drawing commands:

```black
type Draw =
  | Clear Text
  | Line LineSpec
  | Circle CircleSpec
  | Text TextSpec
```

Black produces `List Draw`; the JavaScript runtime executes those commands against a Canvas 2D context.

### 13.4 JSON

Opaque or builtin prototype `Json` representation. Provide enough explicit operations to construct and inspect the small Pong protocol. Not required: generic deriving, schema generation, typeclass codecs, production serialization architecture.

### 13.5 Randomness

Do **not** expose JavaScript's mutable global RNG as apparently pure Black. Prefer a tiny pure seeded API:

```black
nextFloat
  :: Seed
  -> { value :: Float
     , seed  :: Seed
     }
```

The runtime may provide the initial seed. RNG quality is irrelevant as long as Pong launches balls in sufficiently varied directions.

---

## 14. White prototype scope

The prototype White CLI surface includes at least:

```text
white --help
white capabilities
white check
white build
white run
white test
white docs
white query
```

Exact argument syntax is implementation detail. All commands that return semantic or compiler information support machine-readable output, at minimum via:

```text
--json
```

### 14.1 Discoverability contract

A coding agent must be able to discover, without external Black knowledge:

1. which compiler profile is installed
2. which language features it implements
3. which language features are valid Black but unavailable
4. how to create/build/check/run/test a project
5. supported Black syntax
6. available Prelude operations
7. available Platform modules
8. types of project and runtime symbols
9. the meaning of compiler diagnostics

No agent-specific hidden prompt may be required to provide this information.

### 14.2 Structured diagnostics

Diagnostics must eventually distinguish at least:

```text
parse_error
unknown_name
unknown_module
ambiguous_name
duplicate_declaration
module_path_mismatch

type_mismatch
bad_argument
unknown_field
missing_field
bad_constructor_payload
non_exhaustive_case

unsupported_feature
```

Each diagnostic reports:

```text
stable-ish diagnostic code
kind
severity
file
source span
human-readable explanation
```

Type errors additionally report, when relevant:

```text
expected type
actual type
originating expression/declaration
```

This schema serves the prototype only. It is not a universal future diagnostic protocol.

---

## 15. Example applications and reference isolation

`examples/` will contain teaching material accessible to a blind agent. At minimum:

```text
examples/hello
examples/multiplayer-cursors
```

The multiplayer cursor example must demonstrate: Black server, Black browser client, WebSocket messages, shared server state, mouse input, Canvas rendering, multiple clients.

It must **not** contain any Pong-specific machinery: polygon geometry, balls, paddles, collisions, lives, scoring, or elimination logic.

`reference/polygon-pong` exists to validate that the selected Black subset can implement the full Pong PRD. It follows the PRD's minimal architecture: few files, explicit state, straightforward control flow, simple JSON, one authoritative server, one Canvas renderer, no generalized multiplayer or physics framework.

**The reference Pong implementation must not be exposed to the blind agent during evaluation.**

---

## 16. Blind-agent evaluation contract

A valid blind trial begins with:

```text
fresh agent context
fresh project workspace
Polygon Pong PRD
installed `white`
```

The agent does **not** receive:

```text
the reference Pong implementation
special Black syntax instructions
private compiler notes
handwritten agent cheat sheets outside White
previous trial transcripts
```

The agent may freely use:

```text
white --help
white capabilities
white docs
white query
white check
white build
white test
white run
```

Target outcome:

```text
complete working Polygon Pong
within approximately 60 minutes
without human Black instruction
```

---

## 17. Scope-creep decision procedure

When implementation encounters a missing capability during any later phase, apply this procedure in order:

1. **Can existing supported Black express the requirement cleanly?** — Use existing Black.
2. **Can a tiny Prelude or Platform helper solve it without distorting application code?** — Add the helper.
3. **Is the missing language feature necessary to prevent the Pong implementation from becoming substantially awkward or misleading?** — Add the smallest semantically honest implementation of that Black feature.
4. **Otherwise** — Do not implement it.

No feature is added because "it would be nice," "the real compiler will need it," "the implementation already looks close," "it makes the prototype architecture cleaner," or "it may improve reuse later." Future reuse is not a project objective.

### 17.1 Phase 0 reconciliations

The syntax and semantic questions raised during the initial Phase 0 draft were reconciled against the canonical source material before Phase 1 began. No language-syntax reconciliation remains outstanding for `preview-web-1`.

---

## 18. Implementation quality rule

Internal prototype code may be ugly. Acceptable shortcuts:

```text
special-cased Platform modules
hard-coded builtin operator tables
plain integer definition IDs
one combined resolved/typed AST
direct checked-AST-to-JavaScript emission
static documentation JSON
in-memory symbol tables
compiler-known runtime primitives
JavaScript arrays for List
JavaScript objects for records
```

Do not deliberately write broken or untestable code. Do not refactor solely to create architecture suitable for the future production compiler.

Guiding rule:

> **Fake the compiler engineering, not the language.**

---

## 19. Explicit anti-goals

**This project is not the production Black compiler.**

It will not attempt to build:

```text
Black Core
Lower IR
representation lowering
optimization infrastructure
LLVM
WebAssembly
native machine code

production ownership checking
effect elaboration
dependent typing
structured concurrency

production package management
package registry
dependency solving

persistent semantic indexing
incremental compilation
compiler daemon
hot replacement

production FFI
stable ABI

complete standard library
production documentation system
production language server
```

If a task belongs primarily to one of those areas, assume it is out of scope unless a later phase proves it essential to the demo.

---

## 20. Phase 0 self-consistency checks

Every feature named as **Supported** (§7) is absent from **Unavailable** (§11). Verified during Phase 0.

Every Black example in this document:

- uses `.blk`-compatible syntax
- declares closed variants with mandatory leading pipes
- contains no angle-bracket variant declarations
- gives modules explicit export lists
- uses juxtaposition for function application (no `f(x, y)`)
- uses `let ... in` for local bindings (no local-binding `where`)

No wording in this document implies that a prototype limitation is a limitation of Black itself. Category B omissions are explicitly labeled as such.
