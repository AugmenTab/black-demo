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

The finished application must be publicly deployed to Railway under:

```text
black-demo
```

The task is complete when the application is implemented, verified, deployed, and a public playable HTTPS URL has been produced.

---

## 2. Experiment Rules

Assume no prior knowledge of Black.

Learn Black and its available platform/tooling beginning with:

```text
white --help
```

The PRD tells you **what to build**.

White tells you **how Black works**.

For Black-specific information, use:

```text
docs/prd.md
White and the documentation/tooling reachable through White
the Black source you create during this task
```

Do not search externally for:

- Black syntax;
- White documentation;
- Black platform APIs;
- previous Black applications;
- previous Polygon Pong implementations;
- reference implementations;
- earlier runs or transcripts;
- solution code for this task.

General web research is allowed for ordinary non-Black technologies and concepts, including:

- browser APIs;
- WebSockets;
- Canvas;
- Clipboard behavior;
- Railway;
- HTTP/HTTPS;
- geometry;
- collision mathematics;
- responsive web behavior.

When general web information and Black-specific behavior overlap, White is authoritative about what Black provides.

Application and game logic must be implemented in Black.

Any non-Black exception must be explicitly permitted by `docs/prd.md`.

---

## 3. Prepared Environment

The experiment environment has already been prepared and verified.

The following are available:

```text
white
real browser automation
Chromium
Railway CLI
Railway authentication for black-demo
the existing public Railway service/domain
ordinary public internet access
```

Do not spend time installing, locating, authenticating, or reconfiguring these capabilities.

Use the provided browser tools rather than searching the filesystem for a browser.

Use the prepared Railway configuration rather than creating or relinking Railway projects.

If a required prepared capability is actually unavailable, report an **environment failure** and stop.

The execution capsule enforces its own filesystem, permission, shell, and agent policies.

If a command is rejected by experiment policy, adapt to the rejection—for example, split a compound shell command into separate simple commands.

Do not attempt to circumvent or weaken the capsule.

---

## 4. Autonomy

Work autonomously.

Do not request human guidance for ordinary:

- implementation decisions;
- file organization;
- compiler errors;
- type errors;
- syntax errors;
- browser bugs;
- failed acceptance criteria;
- deployment steps.

Resolve ordinary ambiguity in this order:

```text
1. docs/prd.md
2. White
3. permitted general technical research
4. the simplest implementation satisfying the PRD
```

Stop and report a blocker only for something genuinely external or contradictory, such as:

- inconsistent mandatory requirements;
- unavailable prepared infrastructure;
- unavailable required White capability after exhausting White's discovery surfaces;
- external credential/service failure.

---

## 5. Read the Product Requirements

Before beginning Black discovery, read:

```text
docs/prd.md
```

Read it completely.

Treat it as the authoritative product specification.

Do not implement from only a partial understanding of the acceptance criteria.

---

## 6. Begin Black Discovery

After understanding the PRD, begin with:

```text
white --help
```

Use White's discovery surfaces to learn the language and available runtime/platform capabilities.

Discover what you need for:

- project configuration;
- Black syntax;
- modules;
- functions;
- records and variants;
- standard-library functionality;
- server behavior;
- browser behavior;
- networking;
- rendering;
- JSON;
- input;
- randomness;
- audio;
- clipboard/invite sharing;
- checking;
- building;
- running.

Do not guess API names or syntax when White can answer the question.

Use compiler feedback as part of the discovery process.

---

## 7. Establish a Minimal Running Black Project

Before implementing the full game, establish the smallest valid project that proves the discovered project structure works.

Reach a state where:

```text
white check
```

passes.

Then verify:

```text
white build
```

and:

```text
white run
```

using the actual command forms exposed by White.

Use the provided browser automation to confirm the running application can be opened.

Do not spend time polishing the initial scaffold.

---

## 8. Implementation Strategy

Build incrementally.

After meaningful changes, use White to check the program rather than accumulating a large batch of unchecked code.

Prefer:

- explicit state;
- ordinary Black data structures;
- ordinary functions;
- few modules;
- small protocol messages;
- straightforward state transitions.

Avoid:

- framework-building;
- generalized game engines;
- generalized physics systems;
- generalized multiplayer frameworks;
- unnecessary abstraction;
- unrequested infrastructure.

The goal is the product described by the PRD, not a reusable game platform.

---

## 9. Phase A — Rooms and Lobby

Implement the multiplayer foundation first.

Establish:

- room creation;
- unique room identity;
- host assignment;
- invite URL generation;
- joining through an invite;
- multiple simultaneous clients;
- isolation between different rooms;
- safe handling of invalid room IDs.

Then complete the lobby:

- display names;
- color palette;
- player roster;
- host display;
- dynamic polygon as players join/leave;
- ball spawn interval configuration;
- invite display;
- Copy Invite Link;
- QR-code joining.

Use real browser automation to verify multiple clients.

Do not proceed deeply into physics until room isolation and lobby synchronization work.

---

## 10. Phase B — Arena and Controls

Implement the authoritative regular polygon and player-edge assignments.

Use one shared authoritative world coordinate system.

Then implement local presentation so every active player sees their own edge at the bottom of their screen without changing authoritative geometry.

Implement all required control methods:

- mouse;
- A / D;
- Left / Right Arrow;
- Invert Controls;
- touch/tap;
- touch/drag.

Keyboard direction must follow visible screen direction.

Touch controls must not scroll the gameplay page while steering.

Verify that one connection cannot authoritatively control another player's paddle.

---

## 11. Phase C — Core Game Physics

Implement a complete single-ball game before adding multiple-ball behavior.

Required behavior includes:

- initial ball spawn;
- random launch direction;
- ball vs paddle collision;
- ball vs goal-post collision;
- crossing an undefended goal;
- life loss;
- replacement ball after scoring;
- elimination at zero lives;
- eliminated/disconnected edges becoming solid walls;
- wall reflection.

Keep all authoritative physics and scoring on the server.

Do not move authoritative gameplay decisions into the client for convenience.

---

## 12. Phase D — Match Lifecycle

Implement the required room phases:

```text
LOBBY
COUNTDOWN
PLAYING
GAME_OVER
```

Implement:

- host-only start;
- minimum-player requirement;
- frozen active roster;
- frozen match geometry;
- server-driven 3-2-1 countdown;
- countdown visual/audio behavior;
- countdown cancellation when a seated player disconnects;
- late-join behavior;
- winner detection;
- simulation stop;
- victory display;
- Return to Lobby;
- lobby reconstruction.

Verify these transitions with multiple browser clients.

---

## 13. Phase E — Multiple Balls

Add:

- periodic ball spawning;
- replacement spawning after scores;
- multiple simultaneous balls;
- equal-mass ball-to-ball collision;
- overlap correction if necessary;
- stable/bounded velocity.

Exercise scoring, elimination, disconnects, and victory with multiple balls active.

---

## 14. Phase F — Responsive and Mobile Completion

Mobile usability is required, not optional polish.

Using the provided browser tools, verify both portrait and landscape phone-sized viewports.

Confirm that:

- controls and arena do not overlap;
- text remains usable;
- name entry works without a physical keyboard;
- color selection works by touch;
- host controls work by touch;
- Start works for a phone host;
- touch steering works;
- the gameplay arena remains usable.

Implement the smallest responsive layout that satisfies the PRD.

---

## 15. Validation

Use White continuously.

The relevant White validation commands include:

```text
white check
white build
white run
```

There is currently no:

```text
white test
```

command.

Do not search for or attempt to invent one.

Use:

- `white check`;
- `white build`;
- `white run`;
- real browser automation;
- multiple browser clients;
- desktop and mobile viewports;
- the acceptance criteria in `docs/prd.md`.

Do not hand-edit generated backend output instead of fixing Black source.

Do not weaken requirements to make validation easier.

---

## 16. Acceptance Pass

Before deployment, walk through **every acceptance criterion** in:

```text
docs/prd.md
```

Do not rely on memory.

For every criterion, classify it as:

```text
verified
failed
not verified
```

Fix failed required criteria.

Pay particular attention to real-browser verification of:

- room creation;
- room isolation;
- QR/invite joining;
- multiple clients;
- countdown;
- player-relative views;
- input;
- mobile behavior;
- scoring/elimination;
- multiple balls;
- winner and Return to Lobby.

The goal is to deploy a product you have actually exercised, not merely one that compiles.

---

## 17. Scope Discipline

Do not add unrequested features such as:

- accounts;
- matchmaking;
- persistent storage;
- leaderboards;
- chat;
- AI players;
- power-ups;
- extra game modes;
- elaborate visual effects;
- analytics;
- generalized frameworks.

Once a requirement works reliably, move to the next unmet requirement.

Do not perform large late-stage refactors solely for elegance.

---

## 18. Railway Deployment

Deployment is part of the task.

The environment is already configured for the Railway project/service:

```text
black-demo
```

Deploy the completed application using the prepared Railway tooling.

The deployed service must run the Black application produced during this task.

Do not replace it with another implementation for deployment.

Deployment is not complete merely because Railway accepts the deploy.

Obtain the public HTTPS URL and verify the deployed application.

At minimum confirm publicly that:

- the page loads;
- a room can be created;
- the normal invite experience appears.

Where practical, open the public application in another browser context and verify joining.

---

## 19. Completion

The task is complete when:

1. the required application is implemented;
2. `white check` passes;
3. `white build` passes;
4. the application runs successfully;
5. the PRD acceptance pass has been completed;
6. the application is deployed to Railway;
7. the public deployment has been verified;
8. a playable public HTTPS URL is available.

The experiment harness records the authoritative elapsed time from the first `white --help` invocation through completion.

Do not pause, reset, or otherwise manipulate the experiment run.

---

## 20. Final Response

Report concisely:

```text
SUCCESS or PARTIAL

public Railway URL

white check result
white build result
local runtime/browser verification result
public deployment verification result

known unmet PRD criteria, if any
```

If all required criteria are satisfied, say so explicitly.

If something remains incomplete, report it accurately.

---

## 21. Governing Principle

The objective is:

> Given a product specification and an entry point into an unfamiliar programming language's own toolchain, independently learn enough of that language to build, verify, deploy, and publish a complete multiplayer application.

Stay focused on that objective.
