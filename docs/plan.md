# black-demo — Implementation Plan

## 1. Objective

Implement **N-Player Polygon Pong** in a brand-new programming language called **Black**.

Black's compiler and developer toolchain is:

```text
white
```

The authoritative product requirements are:

```text
docs/prd.md
```

The finished application must be publicly deployed to **Railway** under:

```text
black-demo
```

The task is complete only when the application is implemented, verified, deployed, and a public playable HTTPS URL has been produced.

---

## 2. Important Context

Assume no prior knowledge of Black.

Do not infer Black syntax, APIs, project structure, or behavior from other programming languages.

Do not search for:

- an existing Polygon Pong implementation;
- a reference implementation;
- an earlier version of this project;
- old Black demos;
- previous transcripts;
- another Black application to copy.

Learn Black and its available platform/tooling beginning with:

```text
white --help
```

The PRD tells you **what to build**.

White tells you **how Black works**.

---

## 3. Authoritative Sources and Web Research

For Black-specific information, use:

```text
docs/prd.md
white and the documentation/tooling reachable through white
the Black source you create in this repository
```

Do not search the web for Black or White documentation.

Do not search GitHub, package indexes, web search engines, local neighboring repositories, or other external sources for:

- Black syntax;
- White commands beyond what White itself exposes;
- Black Platform APIs;
- prior Polygon Pong implementations;
- previous versions of this project;
- solution code for this task.

### General web research is allowed

Ordinary web research is permitted for **non-Black-specific technical information**, including subjects such as:

```text
WebSocket behavior
browser APIs
Clipboard API behavior and permissions
Canvas behavior
pointer/touch events
QR-code libraries
Railway documentation
HTTP/HTTPS behavior
geometry
collision mathematics
responsive browser behavior
```

Use general research to understand external technologies, not to locate a solution to this project.

When Black-specific and general-platform concerns overlap, White remains authoritative about what Black exposes.

---

## 4. External QR Library Permission

Black does not need to implement QR encoding itself.

If required to satisfy the PRD, one small external JavaScript QR-code library may be used for:

```text
QR encoding
QR rendering
```

only.

This exception does **not** permit writing application logic in JavaScript.

The following must remain implemented in Black:

```text
rooms
player state
protocol interpretation
match phases
countdown logic
arena geometry
paddle control logic
physics
collisions
scoring
lives
elimination
winner detection
render-state decisions
```

Keep the QR dependency narrow and ordinary.

Do not use it as a bridge for unrelated JavaScript application code.

---

## 5. Environment Assumptions

The environment has been prepared before this task begins.

Assume:

```text
white is installed and available on PATH
the required Black runtime/toolchain dependencies are installed
a modern browser/runtime required by White is available
the Railway CLI is installed
Railway authentication is already configured
this repository is already associated with the intended Railway project/service
the Railway target is named black-demo
Railway deployment can complete non-interactively
```

Do not perform account setup, authentication, project linking, or interactive Railway configuration.

If one of these assumptions is false and prevents progress, treat that as an **environment failure**.

Report the exact failure and stop rather than constructing a workaround that changes the experiment.

---

## 6. Timing

This run must be timed.

Before the **first invocation** of:

```text
white --help
```

record the current time using a simple direct command such as:

```text
date -u
```

The timed interval begins immediately before the first `white --help`.

The timed interval ends only when:

1. the completed application has been deployed to Railway;
2. the public deployment has been verified to respond;
3. the final response posts the public playable URL.

Record the ending time with the same time basis.

Report:

```text
start time
end time
total elapsed time
```

Do not pause or manipulate the timer because of implementation mistakes, compiler errors, debugging, or deployment work.

A genuine external environment failure may invalidate the run.

---

## 7. Autonomy Rule

Work autonomously.

Do not request human approval for ordinary implementation decisions.

Resolve normal ambiguity using, in order:

```text
1. docs/prd.md
2. facts discoverable through White
3. ordinary general technical research where permitted
4. the simplest implementation satisfying the PRD
```

Do not ask the user:

```text
which file structure to use
which names to choose
which implementation technique to use
whether to continue
whether to run ordinary checks
whether to fix ordinary compiler errors
whether to deploy once complete
```

Human intervention is appropriate only for a genuine blocker such as:

```text
contradictory mandatory criteria
missing required external infrastructure
broken prepared tooling
an external permission or credential failure
a genuinely absent required capability
```

If that happens, explain the blocker precisely and stop.

---

## 8. Shell and Approval-Safety Rules

The implementation must be able to run unattended in auto mode.

Use **one simple command per shell invocation**.

Do not use:

```text
shell pipelines
||
&&
command chaining
command substitution
subshell tricks
eval
clever shell one-liners
temporary shell programs
ad-hoc Python programs
ad-hoc Bash programs
generated helper scripts used only to orchestrate the task
scripts that store environment variables or credentials
```

Do not use Python or shell scripting as a shortcut for ordinary implementation or orchestration.

Prefer direct commands such as:

```text
white --help
white check
white build
white run
git status
railway up
```

---

## 9. Repository and Claude Code State Boundary

All deliberate task work must stay inside this repository.

Do not deliberately read from or write to arbitrary filesystem locations outside the repository.

Do not use:

```text
another checkout
another project
home-directory scratch files
/tmp scratch files
neighboring repositories
Claude Code scratchpad directories outside this repository
Claude Code memory files
```

### Claude Code memory is forbidden

Do **not** create, update, append to, or rely on Claude Code persistent memory for this task.

Do not save task knowledge into user-level, project-external, or global memory files.

### Scratch work

If temporary notes or scratch artifacts are needed, use only:

```text
.local/
```

inside this repository.

Keep `.local/` untracked.

Use it instead of any Claude Code external scratchpad.

Delete disposable `.local/` contents before final completion unless a specific artifact is useful as run evidence.

Never place credentials, secrets, or authentication tokens there.

---

## 10. Sub-Agent Rules

The primary Implementer owns the implementation.

Do not create multiple agents that concurrently modify the codebase.

If sub-agents are used at all, prefer read-only tasks such as:

```text
reviewing a requirement
checking acceptance coverage
reviewing an implementation failure
researching a general non-Black technical question
```

The primary Implementer remains the sole code writer.

Every sub-agent inherits **all** restrictions in this plan, including:

```text
repository boundary
no Claude Code memory writes
.local/ instead of external scratchpads
no outside Black sources
no reference implementation searches
no approval-triggering shell tricks
no code-writing swarm
```

A sub-agent must not be used to bypass a restriction placed on the primary Implementer.

---

## 11. Read the Product Requirements First

Before starting the timer, read:

```text
docs/prd.md
```

Understand the complete required product.

Pay particular attention to:

```text
room creation and invite joining
QR-code joining
desktop and mobile usability
responsive layout
player-relative arena orientation
server authority
countdown behavior
collision rules
lives and elimination
disconnect behavior
multiple balls
winning
Railway deployment
acceptance criteria
```

Do not begin implementation from only a partial reading.

Once the requirements are understood, begin the timed portion.

---

## 12. Begin Black Discovery

Record the start time.

Then run:

```text
white --help
```

Use White's discovery mechanisms to learn what is available for:

```text
project creation/configuration
Black syntax
modules
types
records and variants
standard functionality
server/browser capabilities
drawing/rendering
networking
JSON
input
randomness
audio
clipboard
mobile-friendly interaction
checking
building
running
```

This list describes application needs, not specific API names.

Do not invent interfaces.

Discover what White actually provides.

---

## 13. Establish a Minimal Running Project

Before implementing the complete game, establish the smallest valid project proving the toolchain is understood.

Reach a state where:

```text
white check
```

succeeds.

Then prove that the application can:

```text
white build
white run
```

using the actual command forms exposed by White.

Do not spend time polishing this scaffold.

---

## 14. Implementation Strategy

Build incrementally in dependency order.

Do not write the entire application before compiling it.

After each meaningful milestone, run the appropriate White checks.

Prefer:

```text
explicit state
ordinary Black data structures
ordinary functions
few modules
small protocol messages
straightforward state transitions
```

Avoid:

```text
framework-building
general game engines
general physics frameworks
general networking frameworks
premature abstraction
unrequested infrastructure
```

---

## 15. Phase A — Rooms and Connectivity

Implement enough to prove:

```text
a room can be created
the room has a unique identity
the creator becomes host
an invite URL exists
another browser can join the intended room
multiple clients see the same room
different rooms remain isolated
invalid invites fail safely
```

The server owns authoritative room membership.

---

## 16. Phase B — Lobby and Join Experience

Implement:

```text
display names
fixed color palette
host identity
player roster
dynamic polygon
spawn-interval control
invite URL display
Copy Invite Link
QR code
```

Use the permitted external QR library if necessary.

Ensure joining works from phone-sized and desktop viewports.

---

## 17. Phase C — Arena Geometry and Player Views

Implement the authoritative regular polygon and per-player edge assignment.

Keep one shared world-coordinate system.

Each active client locally rotates its view so its own edge appears at the bottom.

Input must map correctly through that local transformation.

---

## 18. Phase D — Paddle Input

Support:

```text
mouse
A / D
Left Arrow / Right Arrow
Invert Controls
touch/tap
touch/drag
```

Keyboard direction is screen-relative.

Touch gameplay must not scroll/zoom the page while steering.

One player must not control another player's paddle.

---

## 19. Phase E — Core Physics

Implement the complete single-ball game first.

Required behavior:

```text
ball vs paddle
ball vs post
ball crossing goal
ball vs eliminated/disconnected wall
five starting lives
scoring
replacement ball
elimination
solid-wall conversion
```

Physics stays server-authoritative.

---

## 20. Phase F — Match State and Countdown

Implement:

```text
LOBBY
COUNTDOWN
PLAYING
GAME_OVER
```

and the authoritative:

```text
3
2
1
GO!
```

countdown.

Verify the PRD's:

```text
host-only start
minimum player count
frozen roster
frozen geometry
configuration freeze
late-join rules
seated-disconnect cancellation
audio behavior
```

---

## 21. Phase G — Multiple Balls and Completion

Add:

```text
periodic spawning
random launch directions
ball-to-ball collision
bounded/stable velocity
multiple simultaneous balls
winner determination
simulation stop
victory presentation
return to lobby
lobby reconstruction
```

---

## 22. Phase H — Responsive and Mobile Completion

Mobile usability is required.

Verify portrait and landscape phone-sized viewports.

Required:

```text
controls and arena do not overlap
text remains usable
name entry works without physical keyboard
color selection works by touch
host controls work by touch
paddle steering works by touch
arena remains usable
```

Implement the smallest responsive layout satisfying the PRD.

---

## 23. Phase I — Robustness

Verify relevant edge cases including:

```text
lobby disconnect
countdown disconnect
playing disconnect
host departure
invalid invite
multiple rooms
late joining
malformed messages
unknown connections
multiple-ball edge cases
resize
orientation changes
audio not unlocked
clipboard unavailable
```

Malformed client input must not crash the authoritative server or corrupt another room.

---

## 24. Validation Discipline

Use White continuously.

Do not accumulate large unchecked edits.

The available core validation commands are:

```text
white check
white build
white run
```

There is currently **no `white test` command**.

Do not waste time searching for or attempting to invent one.

Use:

- `white check`;
- `white build`;
- `white run`;
- real browser interaction;
- acceptance-criterion verification;
- any ordinary repository tests that actually exist and are relevant.

Do not weaken product requirements merely to make validation pass.

Do not hand-edit generated backend output as a substitute for fixing Black source.

---

## 25. Black-Only Application Logic

Application/game behavior must be implemented in Black.

Do not implement Polygon Pong logic in:

```text
handwritten JavaScript
Python
shell
deployment configuration
generated files
```

The explicit exception is the permitted generic external JavaScript QR library described earlier.

Ordinary build/deployment configuration is allowed.

---

## 26. Acceptance Pass

Before deployment, walk through **every acceptance criterion** in:

```text
docs/prd.md
```

For each criterion, determine whether it is:

```text
verified
not verified
failed
```

Fix failed required criteria before deployment.

Use real browser interaction where practical, especially for:

```text
multiple clients
room isolation
QR joining
responsive layout
touch behavior
countdown
player-relative views
winner/return flow
```

---

## 27. Scope Discipline

Do not spend time on unrequested features.

Do not add:

```text
accounts
matchmaking
persistent storage
leaderboards
chat
AI players
power-ups
extra game modes
complex visual effects
general-purpose frameworks
analytics
unrequested infrastructure
```

Once a requirement works reliably, move to the next unmet requirement.

---

## 28. Railway Deployment

Deployment is a required part of this timed run.

The Railway environment is assumed prepared for non-interactive deployment under:

```text
black-demo
```

Use the simplest direct Railway workflow available.

Do not:

```text
log in interactively
create/relink accounts
change unrelated Railway settings
write credentials into files
construct helper scripts around Railway
```

General Railway documentation may be consulted on the web if necessary.

If Railway unexpectedly requires human authentication or approval despite the environment contract, report an environment failure rather than improvising around it.

The deployed service must run the Black application produced during this task.

---

## 29. Deployment Verification

Deployment is not complete merely because Railway accepts a command.

Obtain the public HTTPS URL.

Verify:

```text
the public page loads
a room can be created
the invite experience appears
```

If practical, verify another browser can join the deployed room.

---

## 30. End the Timer

After:

```text
implementation complete
acceptance pass complete
Railway deployment complete
public URL obtained
public URL verified
```

record the ending time.

Compute total elapsed time.

The timer ends immediately before the final response containing the playable URL.

---

## 31. Final Response

Report concisely:

```text
SUCCESS or PARTIAL
public Railway URL
start timestamp
end timestamp
elapsed time
white check result
white build result
white run / runtime verification result
deployment verification result
known unmet PRD criteria, if any
```

If all criteria are met, say so explicitly.

Do not claim unsupported success.

---

## 32. Stop Conditions

Stop and request human intervention only for a genuine blocker such as:

```text
docs/prd.md contains contradictory mandatory requirements
white is unavailable despite the environment contract
prepared Railway access is unavailable
Railway unexpectedly requires human authentication
a required capability is genuinely absent after exhausting White
an external service failure prevents completion
```

Do not stop for:

```text
compiler errors
type errors
syntax errors
ordinary browser bugs
acceptance failures
design choices
implementation uncertainty
bugs in your own code
```

Those are part of the task.

---

## 33. Governing Principle

The objective is not to demonstrate clever agent orchestration.

The objective is:

> Given only a product specification and an entry point into an unfamiliar programming language's own toolchain, independently learn enough of that language to build, verify, deploy, and publish a complete multiplayer application.

Stay focused on that objective.
