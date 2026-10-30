# N-PLAYER POLYGON PONG
## Product Requirements Document

**MVP • Browser Multiplayer • Desktop + Mobile**

A deliberately small real-time multiplayer Pong variant in which each player owns one face of an N-sided polygon.

The product should be simple enough to understand almost immediately, quick enough to join that a group can enter the same room from their own devices with minimal friction, and robust enough to support a complete real-time multiplayer match in ordinary modern browsers.

| | |
|---|---|
| **Status** | MVP Product Specification |
| **Primary Goal** | Stable real-time multiplayer with the smallest practical implementation |
| **Implementation Target** | Browser client + authoritative room server |
| **Client Target** | Modern desktop and mobile browsers |
| **Deployment Target** | Public HTTPS deployment on Railway under `black-demo` |

---

# 1. Product Summary

N-Player Polygon Pong is a real-time multiplayer Pong variant played inside a regular polygon.

Each active player owns one edge of the polygon. That edge is their goal and contains their paddle. As players join or leave the pre-game lobby, the arena changes shape in real time so there is always one polygon edge per seated player.

Large circular dots at the polygon vertices act as goal posts separating adjacent players' scoring areas. Balls bounce normally from these posts.

Instead of accumulating points, each player begins with a fixed number of lives. When a ball passes through that player's scoring edge without hitting their paddle or either adjacent post, they lose one life.

When a player reaches zero lives, they are eliminated. Their paddle disappears and their entire edge becomes a solid wall. Balls bounce from that wall normally.

Additional balls enter play periodically so games do not stagnate as player count increases.

Whenever a player is scored upon, the scoring ball is removed and an immediate replacement ball is launched from the center.

The last active player remaining wins.

The visual presentation is intentionally simple:

- black background;
- white balls;
- white goal posts;
- white eliminated-player walls;
- player-colored paddles;
- readable names and life counts.

Each active player sees the same authoritative arena through a locally rotated view in which **their own edge appears at the bottom of their screen**.

This rotation is presentation-only. Authoritative physics, scoring, edge assignment, and world coordinates remain identical for every player.

The lobby exposes a shareable invite URL, a Copy action, and a scannable QR code so other players can join quickly from their own devices.

The game must be usable from both desktop browsers and typical modern phones.

---

# 2. Product Goals

1. Support stable real-time multiplayer play in a web browser.
2. Allow one player to create a room and invite others with a unique link.
3. Allow invite links to be shared through both a Copy action and a QR code.
4. Support desktop and mobile players together in the same room.
5. Dynamically construct an N-sided regular polygon with one scoring edge per seated player while in the lobby.
6. Freeze arena geometry once a match begins.
7. Give every active player a locally rotated view with their own edge at the bottom.
8. Implement Pong-style paddle, wall, post, and ball collisions.
9. Support multiple simultaneous balls, including ball-to-ball collisions.
10. Eliminate players using a lives system.
11. Correctly handle players disconnecting before, during, and immediately prior to a match.
12. Run a synchronized server-authoritative 3-2-1 countdown before gameplay.
13. Require essentially no onboarding or explanation to play.
14. Remain small enough to implement and understand without unnecessary framework or infrastructure complexity.
15. Deploy successfully as a publicly accessible HTTPS application.

The implementation should prioritize:

- simplicity;
- predictability;
- correctness;
- responsiveness;
- demonstrability;

over production-grade sophistication.

---

# 3. Explicit Non-Goals

The MVP does **not** require:

- user accounts or authentication;
- matchmaking or public room discovery;
- persistent statistics or leaderboards;
- spectator mode;
- teams or chat;
- music;
- elaborate sound design;
- audio beyond simple required countdown/start tones;
- power-ups;
- AI players;
- complex animation;
- particle systems;
- textures or sprite pipelines;
- asset pipelines;
- multiple game modes;
- persistent room configuration;
- database storage;
- reconnect/reclaim semantics during an active match;
- client-authoritative physics;
- sophisticated lag compensation;
- rollback networking;
- a special 2-player geometry mode;
- multi-region or horizontally scaled room infrastructure.

A room requires at least **3 active players** to start because the core game representation requires one actual polygon edge per active player.

The architecture should not unnecessarily prevent a future 2-player mode, but a special 2-player representation is outside this MVP.

Public cloud deployment **is required** and is not a non-goal.

The completed application must be deployable to the prepared Railway project/service named:

```text
black-demo
```

and reachable through a public HTTPS URL.

---

# 4. Target Scale

**Minimum active players:** 3

**Target tested range:** 3–8 players

**More than 8 players:** Permitted if naturally supported, but not required for MVP acceptance.

The geometry and protocol must not hard-code particular player counts within the required range.

The server may contain more than one room simultaneously.

Room state must be isolated:

- a player belongs to at most one room;
- game state from one room must not leak into another;
- network broadcasts must not accidentally become process-wide broadcasts.

The MVP may store all rooms in memory.

---

# 5. User Flow

## 5.1 Create Room

A user visits the application without an existing valid room invite and chooses to create a game.

The server creates a room with a unique ID and provides an invite URL.

A possible shape is:

```text
https://example.com/?room=ABCD
```

The exact URL structure is an implementation detail.

The creator becomes the room host.

The host must be able to:

- enter or change a display name;
- choose a paddle color;
- configure the ball spawn interval;
- start the match once enough players have joined.

No registration is required.

### Invite Sharing

The lobby displays:

1. the textual invite URL;
2. a **Copy invite link** control;
3. a scannable QR code encoding the same invite URL.

The QR code should be shown whenever the available viewport can accommodate it without making the rest of the interface unusable.

On a normal desktop or laptop display, the QR code is required.

On a constrained phone viewport, the QR code may be hidden if necessary to maintain a usable layout. The textual invite information and Copy action remain available.

A reasonable QR display size is approximately:

```text
180 px
```

but exact size is not a hard product requirement.

The Copy action should use the system clipboard where browser security rules permit it.

Clipboard writes commonly require:

- HTTPS or localhost;
- direct user interaction such as a click, tap, or key press.

After a successful copy, provide visible feedback such as:

```text
Link copied!
```

Clipboard failure must not make the room unusable. The invite URL should remain visible so it can still be shared manually.

### QR Library Permission

If Black or its browser platform does not provide QR-code generation directly, a small external JavaScript QR-code library may be used solely for:

- QR encoding;
- QR rendering.

This is an explicit exception to the otherwise Black-owned application logic.

The QR dependency must not implement:

- rooms;
- networking;
- player state;
- game state;
- physics;
- controls;
- scoring;
- lives;
- elimination;
- match phases;
- winner logic.

---

## 5.2 Join Room

Another user joins by opening the invite URL.

That may happen by:

- opening a copied URL;
- scanning the QR code;
- entering or following the URL directly.

The joining player enters a display name and selects a paddle color.

Name entry must work on a phone without a physical keyboard.

Color selection should use a fixed palette of approximately **8 visually distinct colors**.

The palette should be usable by:

- mouse;
- touch;
- keyboard where appropriate.

Every connected lobby player can see:

- all current lobby players;
- player names;
- player colors;
- which player is host;
- the current polygonal arena;
- each player's paddle or edge;
- the room's invite information.

Every time someone joins or leaves before the match begins, the arena is recalculated as a regular N-sided polygon.

This change should happen immediately.

No elaborate polygon morph animation is required.

### Invalid Invites

If a client opens an invite URL for a room that does not exist:

- do not silently create a room with that ID;
- do not join an unrelated room;
- do not crash.

Show a clear state such as:

```text
Room not found
```

The user may then choose to create a new room.

---

## 5.3 Start Game

Only the host can start the match.

The Start action must be unavailable or ineffective until at least **3 seated players** are present.

When Start is activated:

1. Freeze the current seated-player roster.
2. Freeze the current polygon geometry.
3. Enter the `COUNTDOWN` phase.
4. Run a synchronized 3-2-1 countdown.
5. Give every active player the starting number of lives.
6. Spawn one ball at the center.
7. Launch that ball in a random direction.
8. Enter active gameplay.

Players joining after Start has frozen the match roster are not added to the active match.

They may receive a simple waiting state such as:

```text
Game in progress
```

They do not need to receive the complete live game state.

Spectator mode is not required.

---

## 5.4 Countdown

The countdown is server-authoritative.

The room phase becomes:

```text
COUNTDOWN
```

before it becomes:

```text
PLAYING
```

Display:

```text
3
2
1
```

for approximately **1.5 seconds per number**.

The countdown numbers should be:

- very large;
- centered over the play area;
- clearly visible over the arena.

Each new number plays a short tone.

A reasonable default countdown tone is:

```text
660 Hz
```

After the final number:

- transition into active gameplay;
- show a large `GO!` overlay;
- keep `GO!` visible for approximately 0.8 seconds;
- play a higher or longer start tone.

A reasonable start tone is:

```text
990 Hz
```

Exact synthesis details are not important.

The requirement is a simple audible cue, not an audio engine.

### Browser Audio Restrictions

Browsers may prohibit audio until the user interacts with the page.

The application may display an instruction such as:

```text
Tap or press a key once to turn on sound.
```

A client that never unlocks audio:

- must still receive the countdown;
- must still display the countdown visually;
- must not block the match.

### Frozen Countdown State

During `COUNTDOWN`:

- names are frozen;
- colors are frozen;
- spawn interval is frozen;
- paddle state is frozen;
- active roster is frozen;
- polygon geometry is frozen;
- an additional Start request does nothing.

A player joining during the countdown is a waiting player and is not added to the frozen active roster.

### Countdown Cancellation

If a **seated active player disconnects during the countdown**:

1. cancel the countdown;
2. return the room to `LOBBY`;
3. remove the disconnected player;
4. recalculate the lobby arena;
5. repair host ownership if necessary;
6. require the host to start again.

If an unseated/waiting player disconnects during the countdown, the countdown continues.

---

## 5.5 Return to Lobby

When a completed game returns to the lobby:

- retain currently connected players;
- remove disconnected players;
- clear lives and elimination state;
- clear frozen match geometry;
- clear active balls;
- clear winner state;
- reset the room to `LOBBY`;
- seat eligible connected players;
- recalculate the regular polygon;
- allow new players to join normally.

The room ID and invite URL may remain the same.

---

# 6. Match Configuration

The lobby should expose only configuration that materially improves play.

## Required Setting

**Ball spawn interval**

Suggested default:

```text
10 seconds
```

Suggested range:

```text
3–30 seconds
```

Only the host may authoritatively change the spawn interval.

The control must work from:

- desktop;
- mobile/touch.

Fixed starting lives:

```text
5
```

Other physical parameters should remain code constants rather than user-facing settings.

Do not build a general settings system.

---

# 7. Arena Geometry

The authoritative arena is a regular polygon centered within the logical game world.

For `N` active players:

- the polygon has `N` edges;
- the polygon has `N` vertices;
- each active player owns exactly one edge;
- adjacent player areas meet at a shared vertex;
- every vertex contains a large circular goal post.

Conceptually:

```text
                Player 1
                o-------o
            /               \
    Player 6                 Player 2
       o                         o
       |                         |
    Player 5                 Player 3
            \               /
                o-------o
                Player 4
```

Goal posts are solid collision objects.

They should be:

- noticeably larger than the ball;
- visually obvious;
- centered on the polygon vertices.

The server assigns each active player an edge when the match roster is frozen.

That edge assignment remains unchanged for the duration of the match.

The authoritative polygon itself does not rotate independently for each player.

---

## 7.1 Local Player View

Each active client rotates its **rendered view** so the local player's assigned edge appears horizontally at the bottom of their screen.

For player edge `k` in an N-sided polygon, one possible implementation is a view rotation equivalent to:

```text
-k * 2π / N
```

relative to the canonical world orientation.

The exact formula or coordinate representation is an implementation detail.

The important rules are:

- every active player sees their own edge at the bottom;
- all players still share the same authoritative world;
- scoring boundaries do not move in world space;
- authoritative physics does not rotate per client;
- protocol coordinates remain world coordinates.

Input from the locally rotated view must be transformed appropriately before being interpreted against the authoritative edge.

A waiting or unseated client may:

- see the canonical unrotated arena;
- or see a simple waiting state.

---

# 8. Player Goal Areas

While a player is alive, most of their polygon edge is **not** a physical wall.

Instead, that edge represents an open scoring boundary.

The player's paddle occupies part of the edge and acts as a collision surface.

The basic rules are:

```text
Ball hits paddle
→ ball bounces

Ball hits either adjacent goal post
→ ball bounces

Ball crosses the player's edge between the posts
without striking the paddle
→ that player is scored upon
```

The scoring ball is then removed from play.

The goal boundary should be evaluated against the authoritative world geometry, not against client screen coordinates.

---

# 9. Paddles

Each active player has one paddle constrained to move along their assigned polygon edge.

A paddle cannot pass through either adjacent goal post.

Paddle movement is one-dimensional.

It can be represented internally as a normalized value:

```text
0.0 <= paddlePosition <= 1.0
```

The server clamps the authoritative position so the physical paddle remains entirely between the posts.

Paddles should occupy a substantial but minority portion of the edge.

Approximately:

```text
25–35% of edge length
```

is a reasonable default.

The server owns the authoritative paddle position.

Clients send paddle intent or requested position.

---

# 10. Controls

## 10.1 Mouse

On desktop, the player's paddle follows the mouse's projected position along the player's visible edge.

The mouse does not directly control arbitrary world X/Y position.

Conceptually:

1. Read the mouse position.
2. Convert from screen coordinates into the logical arena coordinate system.
3. Undo or account for the client's local view rotation.
4. Project the resulting point onto the player's authoritative edge.
5. Convert the projection into the edge's normalized `0–1` paddle coordinate.
6. Clamp to the legal movement range.
7. Send the resulting paddle intent to the server.

The exact division of client/server projection work is an implementation choice as long as the server remains authoritative over the final valid paddle position.

---

## 10.2 Keyboard

Supported keys:

```text
A / D
Left Arrow / Right Arrow
```

Keyboard controls are defined in terms of **visible screen direction**.

Normal controls:

```text
Left / A
→ paddle moves left on the player's screen

Right / D
→ paddle moves right on the player's screen
```

Do not define user-facing direction in terms of increasing or decreasing the internal normalized coordinate, because local view rotation may reverse that relationship.

Each player also has an **Invert Controls** option.

When inverted:

```text
Left / A
→ moves right on screen

Right / D
→ moves left on screen
```

The inversion setting is local to the player and may remain client-side.

---

## 10.3 Touch

Mobile/touch control is required.

A player should be able to steer by:

- tapping within the arena;
- dragging within the arena.

Touch behaves analogously to mouse positioning.

Conceptually:

1. Read the visible touch/pointer position.
2. Convert it into logical arena coordinates.
3. account for the local player view rotation;
4. project onto the player's edge;
5. convert to normalized paddle position;
6. clamp;
7. send the intent to the server.

Dragging inside the gameplay arena must not cause the browser page itself to scroll or zoom.

Touch interaction outside the gameplay area may behave normally.

---

# 11. Lives

Each player begins a match with:

```text
5 lives
```

Remaining lives are displayed inside the arena near or immediately behind the player's paddle.

At minimum, display the numeric value.

Prefer a readable label such as:

```text
PlayerName — 4
```

or equivalent.

Text should be oriented for normal screen readability.

Do not rotate each life label to match its polygon edge.

Because each active client sees a locally rotated arena, labels must remain readable after the view transform.

An eliminated player may display:

```text
0
```

or:

```text
OUT
```

or both.

---

# 12. Scoring

A player is scored upon when a ball crosses their active scoring edge without colliding with:

- their paddle;
- either adjacent goal post.

When scoring occurs:

1. Remove the scoring ball from play.
2. Subtract one life from the scored player.
3. If lives remain, keep that player's goal and paddle active.
4. If lives reach zero, eliminate the player.
5. Immediately spawn a replacement ball at the center.
6. Launch the replacement ball in a random direction.

Scoring therefore does **not** reduce the total number of balls currently meant to be in circulation.

The replacement spawn is independent of the periodic spawn timer.

---

# 13. Elimination

When a player's lives reach zero:

- their paddle disappears;
- their entire scoring edge becomes a solid wall connecting its two goal posts;
- their lives display may show `0`, `OUT`, or both;
- they can no longer be scored upon;
- balls bounce from their former scoring edge using normal wall reflection;
- they no longer count as active for determining the winner.

The polygon itself does not change.

The eliminated edge remains part of the frozen match geometry.

The eliminated player remains represented in the match state.

---

# 14. Player Disconnects

## 14.1 Lobby Disconnect

If a player disconnects while the room is in `LOBBY`:

- remove them from the lobby roster;
- recalculate the polygon;
- update all remaining clients;
- transfer host ownership if necessary.

---

## 14.2 Countdown Disconnect

If a seated player disconnects during `COUNTDOWN`:

- cancel the countdown;
- remove that player;
- return the room to `LOBBY`;
- recalculate the polygon;
- repair host ownership if necessary.

The host must start again.

If an unseated waiting player disconnects during the countdown, the countdown may continue.

---

## 14.3 Gameplay Disconnect

If a player disconnects after the match has entered `PLAYING`:

- treat them as immediately eliminated for collision purposes;
- remove their paddle;
- convert their edge into a solid wall;
- leave the polygon geometry unchanged;
- disregard their remaining lives when determining the winner.

A reconnect system is not required for the MVP.

If that user returns while the same match is still running, they may receive:

```text
Game in progress
```

rather than reclaiming their old paddle.

They do not need to receive live arena snapshots while waiting.

When the room returns to the lobby, currently connected waiting players may become ordinary lobby participants.

---

# 15. Ball Behavior

## 15.1 Initial Ball

At the beginning of active gameplay:

- spawn one ball at the center;
- choose a random direction;
- give it the standard game speed.

The random angle should avoid pathological values if necessary, such as exact geometric symmetries that cause obviously repetitive motion.

A simple random angle with a small perturbation is sufficient.

---

## 15.2 Periodic Ball Spawn

Every configured spawn interval:

- add another ball at the center;
- launch it in a random direction.

The periodic timer continues for the duration of `PLAYING`.

No maximum ball count is required unless testing reveals a practical performance problem.

---

## 15.3 Score Spawn

Whenever a ball scores:

- remove that ball;
- immediately launch a replacement from the center.

This is independent of the periodic spawn timer.

---

# 16. Collision Rules

## Ball vs Paddle

Use Pong-style reflection.

At minimum, reflect the ball away from the paddle.

Preferably, the contact position along the paddle changes the outgoing angle slightly so players can intentionally aim shots.

No spin system is required.

---

## Ball vs Goal Post

Goal posts are circles.

Reflect the ball according to the collision normal between:

- the center of the post;
- the center of the ball.

Post collisions should not allow the ball to become permanently embedded.

---

## Ball vs Eliminated or Disconnected Wall

Reflect the ball across the wall's normal using ordinary line-segment wall reflection.

The solid wall spans the former scoring edge between its two goal posts.

---

## Ball vs Ball

Balls are equal-size circles with equal mass.

On collision, perform a standard equal-mass elastic collision.

Approximate physics are acceptable provided balls:

- visibly bounce from one another;
- do not routinely overlap permanently;
- do not stick together;
- do not gain unbounded velocity.

A small positional correction may be used to separate overlapping balls after collision.

---

# 17. Ball Speed

Ball speed should remain roughly constant.

Paddle and wall collisions should not continuously accelerate the ball.

Ball-to-ball collisions should conserve velocity approximately.

A hard maximum velocity may be used as a safety measure.

The game should remain visually understandable with several balls active.

The precise physical model is less important than:

- stable play;
- visible bouncing;
- predictable scoring;
- bounded velocity.

---

# 18. Winning

After every elimination or active-player disconnect, determine the number of remaining active players.

When exactly **one active player remains**:

1. Stop authoritative simulation.
2. Stop periodic ball spawning.
3. Declare that player the winner.
4. Display a clear victory message.
5. Provide a **Return to Lobby** or equivalent action.

When returning to the lobby:

- currently connected eligible players become the new lobby roster;
- lives and elimination state reset;
- the polygon is recalculated;
- new players may participate;
- previous eliminated/disconnected edges no longer matter.

If the final players are eliminated effectively simultaneously, the MVP may resolve the winner according to authoritative server event ordering.

A separate draw system is not required.

---

# 19. Rendering

Use one HTML `<canvas>` for gameplay.

The presentation is intentionally minimal.

| Element | MVP Appearance |
|---|---|
| Background | Black |
| Balls | White |
| Goal posts | White |
| Eliminated/disconnected walls | White |
| Paddles | Player-selected palette color |
| Primary text | White |
| Names | White or player color |
| Countdown | Very large, centered, highly visible |
| GO! | Large and clearly distinguished from countdown |

No textures, sprites, animation system, particle system, or asset pipeline are required.

---

## 19.1 Responsive Layout

The application must be usable from:

- desktop/laptop browsers;
- typical modern phones in portrait orientation;
- typical modern phones in landscape orientation.

The interface should separate:

- controls/lobby information;
- gameplay arena.

These must not overlap.

A reasonable design is:

```text
Wide / landscape
----------------
[ control panel ][ square arena ]

Narrow / portrait
-----------------
[ control panel ]
[ square arena   ]
```

Exact breakpoints are implementation details.

The arena should remain square.

It should scale to the usable viewport without changing authoritative game physics.

Text should remain readable on a phone held upright.

The control panel should avoid excessively long lines that overflow narrow screens.

---

## 19.2 Mobile Interaction

A player using only a phone must be able to:

- open an invite;
- join a room;
- enter or change their display name;
- choose a color;
- copy/share the invite where applicable;
- change the spawn interval if they are host;
- press Start if they are host;
- steer their paddle;
- return to the lobby when applicable.

Name entry must work without a physical keyboard.

A browser-provided text-entry dialog is acceptable.

Color selection should use the fixed palette.

Palette swatches should be tappable/clickable.

---

## 19.3 Invite QR Code

The lobby should display a QR code encoding the exact invite URL.

The code should be large enough to scan reliably from another device held at ordinary viewing distance.

A reasonable desktop size is approximately:

```text
180 px
```

The QR code may be omitted from a constrained phone layout if displaying it would make the rest of the interface substantially worse.

The textual invite URL and Copy action remain available.

The external QR-library exception described in §5.1 applies.

---

# 20. Coordinate System

Use a fixed logical world coordinate system independent of browser resolution.

A reasonable default is:

```text
1000 × 1000 logical units
```

All authoritative physics occur in logical world coordinates.

The rendered arena scales to fit the client's visible square play area.

Gameplay behavior must therefore remain stable when:

- the browser window changes size;
- a phone rotates;
- different clients have different viewport dimensions;
- clients render different local arena rotations.

Raw CSS pixels must not become the authoritative simulation coordinate system.

---

# 21. Multiplayer Architecture

The server is authoritative.

Clients must not independently simulate authoritative:

- scoring;
- lives;
- elimination;
- ball physics;
- ball spawning;
- collisions;
- match phase;
- countdown progression;
- winner state.

Conceptually:

```text
Browser
   |
   | WebSocket
   |
Game Server
   |
   +-- Room collection
       |
       +-- Room state
       +-- Player state
       +-- Match phase
       +-- Arena
       +-- Balls
       +-- Spawn timer
       +-- Countdown state
       +-- Fixed-step physics
       +-- Collision detection
       +-- Scoring
       +-- Win detection
```

One server process may contain multiple rooms.

A room's snapshots and commands must go only to connections that belong to that room.

No database is required.

All room and match state may live entirely in memory.

If the server restarts:

- rooms may disappear;
- active matches may disappear.

That is acceptable for this product.

The same server may also serve the static browser client.

---

# 22. Networking

Use WebSockets.

Browser clients send only player intent or state changes.

Possible client messages include:

```text
createRoom
joinRoom
setName
setColor
setSpawnInterval
setPaddlePosition
startGame
returnToLobby
```

The exact names are implementation details.

The server sends authoritative room/game information.

Possible server messages include:

```text
welcome
roomState
countdownState
gameState
gameOver
roomNotFound
gameInProgress
```

Again, exact message names are implementation details.

A conceptual game snapshot might resemble:

```json
{
  "type": "gameState",
  "phase": "playing",
  "balls": [
    {
      "x": 500,
      "y": 500,
      "vx": 180,
      "vy": -120
    }
  ],
  "players": [
    {
      "id": "abc",
      "paddlePosition": 0.42,
      "lives": 4,
      "alive": true
    }
  ]
}
```

A countdown snapshot should expose enough authoritative information for every client to display the same countdown value.

For example:

```json
{
  "type": "roomState",
  "phase": "countdown",
  "count": 3
}
```

The exact schema is an implementation detail.

## Message Safety

Malformed, incomplete, or unknown messages must not:

- crash the server;
- corrupt room state;
- grant control of another player's paddle;
- move a connection between rooms unexpectedly.

A connection already belonging to one room must not be able to corrupt another room merely by sending another room's ID.

---

# 23. Simulation

Recommended server physics:

```text
60 fixed ticks per second
```

Recommended network snapshots:

```text
20–30 per second
```

Clients may interpolate between snapshots if trivial to implement.

For the MVP, rendering the newest authoritative state directly is acceptable if motion appears sufficiently smooth under ordinary low-latency conditions.

Gameplay correctness is more important than sophisticated latency compensation.

The countdown should also be driven by authoritative server progression.

Clients must not run independent countdown timers that can disagree about when gameplay begins.

---

# 24. Room State

The normal room lifecycle is:

```text
LOBBY
  |
  v
COUNTDOWN
  |
  v
PLAYING
  |
  v
GAME_OVER
  |
  v
LOBBY
```

A countdown may also be cancelled:

```text
COUNTDOWN
  |
  | seated player disconnects
  v
LOBBY
```

---

## LOBBY

In `LOBBY`:

- players may join;
- players may leave;
- arena geometry changes with the seated player count;
- names may change;
- colors may change;
- the host may configure ball spawn interval;
- the host may start when at least three seated players exist.

---

## COUNTDOWN

In `COUNTDOWN`:

- active player roster is frozen;
- arena geometry is frozen;
- names are frozen;
- colors are frozen;
- spawn interval is frozen;
- paddles are frozen;
- the countdown is server-authoritative;
- new joiners do not become active players;
- a seated disconnect cancels the countdown.

---

## PLAYING

In `PLAYING`:

- active roster remains frozen;
- arena geometry remains frozen;
- balls move;
- paddles move;
- physics runs;
- scoring occurs;
- periodic balls spawn;
- active disconnects create solid walls;
- late joins do not enter the active match.

---

## GAME_OVER

In `GAME_OVER`:

- physics is stopped;
- winner is displayed;
- connected players may return to the lobby;
- late/waiting players may participate after the lobby is reconstructed.

---

# 25. Host Behavior

The room creator is initially the host.

## Lobby Host Departure

If the host disconnects while in `LOBBY`:

- host ownership transfers to another connected seated player.

The exact selection rule is an implementation detail as long as exactly one appropriate host remains.

## Countdown Host Departure

The host is a seated player.

Therefore if the host disconnects during `COUNTDOWN`:

- cancel the countdown;
- return to the lobby;
- remove the old host;
- transfer host ownership;
- require the new host to start again.

## Gameplay Host Departure

If the host disconnects during `PLAYING`:

- their edge becomes a wall like any other disconnect;
- the match continues.

Host status is not required for active gameplay.

Host-only operations must be enforced authoritatively by the server.

A non-host client sending `startGame` or host configuration messages must not succeed merely because the client UI normally hides those actions.

---

# 26. Suggested Physical Constants

These are implementation defaults, not hard product requirements, for a logical world around `1000 × 1000`.

| Parameter | Suggested Value |
|---|---:|
| Arena radius | ~400 |
| Ball radius | ~12–16 |
| Goal post radius | ~22–28 |
| Paddle thickness | ~10–16 |
| Paddle length | ~30% of edge |
| Starting lives | 5 |
| Ball spawn interval | 10 seconds |
| Physics tick | 60 Hz |
| Network update | 20–30 Hz |
| Countdown step | 1.5 seconds |
| GO! overlay | ~0.8 seconds |
| Countdown tone | ~660 Hz |
| Start tone | ~990 Hz |
| QR code | ~180 px when space permits |

Adjust values if playtesting exposes obvious problems.

Do not build a generalized configuration system for these values.

---

# 27. Failure and Edge Cases

The implementation should behave sensibly for at least the following situations.

### Lobby

- Player closes browser while in lobby.
- Host closes browser while in lobby.
- New host is assigned correctly.
- Player opens an invalid room invite.
- Two rooms exist simultaneously.
- One room starts a game while another stays in lobby.
- A connection already belonging to one room attempts to join another.

### Countdown

- Player closes browser during countdown.
- Host closes browser during countdown.
- Countdown is cancelled when a seated player leaves.
- Waiting player leaves during countdown.
- New user opens invite during countdown.
- Second Start request arrives during countdown.

### Gameplay

- Player closes browser during game.
- Host leaves during game.
- Disconnected edge becomes wall.
- Arena does not change shape after disconnect.
- Player reaches zero lives while several balls remain active.
- Multiple players are scored upon within a short period.
- Several balls remain when the game ends.

### Physics

- Two balls collide near a wall.
- Two balls collide near a goal post.
- Ball collides close to a post and scoring edge.
- Ball crosses an undefended goal.
- Ball hits paddle close to a post.
- Ball overlaps another ball after a collision.
- Velocity remains bounded after repeated collisions.

### Browser and Input

- Browser window changes size.
- Phone changes from portrait to landscape.
- Phone changes from landscape to portrait.
- Phone player enters a name without a physical keyboard.
- Touch player taps near an arena boundary.
- Touch player drags across the arena.
- Gameplay dragging does not scroll the page.
- Audio has not yet been unlocked.
- Clipboard access is unavailable.
- QR code has insufficient space on a phone viewport.

### Networking

- Malformed WebSocket message is received.
- Unknown message type is received.
- Missing message field is received.
- Client attempts to control another player.
- Client attempts host-only action while not host.
- Room identifier does not exist.

If two final active players are eliminated effectively simultaneously, the MVP may resolve the winner according to authoritative server event ordering.

A draw system is not required.

---

# 28. Acceptance Criteria

A complete implementation satisfies all of the following.

## Room Creation and Joining

1. One user can create a uniquely identified room.
2. The creator becomes that room's host.
3. The lobby displays the room's invite URL.
4. The lobby provides a Copy Invite Link action.
5. Copy writes the invite URL to the clipboard where browser security rules allow it.
6. Copy failure does not make the invite inaccessible.
7. A desktop-sized lobby displays a scannable QR code containing the exact invite URL.
8. At least two additional browser clients can join through that invite.
9. Opening an invalid room invite fails safely.
10. An invalid room invite does not silently create or enter an unrelated room.
11. Two independently created rooms on the same server remain isolated.
12. Activity in one room does not send game snapshots to another.

## Lobby

13. Each player can enter or change a display name.
14. Name entry works on a phone without a physical keyboard.
15. Each player can select a color from the fixed palette.
16. Color selection works with touch.
17. Every lobby client sees the same player roster.
18. Every lobby client sees which player is host.
19. Every lobby client sees the same polygon geometry.
20. Adding a lobby player changes the polygon everywhere.
21. Removing a lobby player changes the polygon everywhere.
22. Host ownership transfers after the lobby host disconnects.
23. The host can configure the ball spawn interval.
24. A non-host cannot authoritatively change host-only settings.

## Start and Countdown

25. Only the host can start the match.
26. A room with fewer than three seated players cannot begin.
27. Starting freezes the current active roster.
28. Starting freezes the current arena geometry.
29. Starting enters a server-driven `COUNTDOWN` phase.
30. Clients display a synchronized 3-2-1 countdown.
31. Countdown numbers are very large and centered over the play area.
32. Clients with unlocked audio hear a countdown tone for each number.
33. Gameplay begins with a distinguishable start tone.
34. A visual `GO!` cue appears when gameplay begins.
35. Clients without unlocked audio still see the full countdown correctly.
36. Names cannot change during countdown.
37. Colors cannot change during countdown.
38. Spawn interval cannot change during countdown.
39. A seated player disconnecting during countdown cancels it.
40. Countdown cancellation returns the room to a recalculated lobby.
41. A late join during countdown does not enter the frozen active roster.

## Arena and Player Views

42. The authoritative arena is a regular N-sided polygon.
43. Every active player owns exactly one edge.
44. Goal posts appear at polygon vertices.
45. Active players see their own assigned edge at the bottom of their screen.
46. Different local view rotations do not change authoritative world geometry.
47. Different local view rotations do not change scoring or physics.
48. Arena geometry remains fixed throughout the match.

## Paddle Controls

49. Each player can move their own paddle.
50. One player cannot authoritatively control another player's paddle.
51. Mouse steering works.
52. `A` and `D` steering work.
53. Left and Right Arrow steering work.
54. Left/A moves left on the player's screen.
55. Right/D moves right on the player's screen.
56. Invert Controls reverses that mapping.
57. Touch/tap steering works.
58. Touch/drag steering works.
59. Touch steering does not scroll the page during gameplay.
60. Paddles remain clamped between adjacent posts.

## Core Gameplay

61. Every active player begins with 5 lives.
62. The initial ball spawns at the arena center.
63. The initial ball launches in a random direction.
64. Balls bounce from paddles.
65. Balls bounce from goal posts.
66. A ball can cross an undefended active goal.
67. A scored player loses one life.
68. Scoring removes the scoring ball.
69. Scoring immediately launches a replacement ball.
70. Additional balls spawn periodically according to the configured interval.
71. Multiple balls may exist simultaneously.
72. Balls visibly collide with one another.
73. Ball-to-ball collisions do not routinely leave balls permanently overlapping.
74. Ball speed remains approximately stable and bounded.

## Elimination and Disconnects

75. At zero lives, a player is eliminated.
76. An eliminated player's paddle disappears.
77. An eliminated player's entire edge becomes a solid wall.
78. Balls bounce from an eliminated player's wall.
79. An eliminated player can no longer be scored upon.
80. A gameplay disconnect also converts that player's edge into a solid wall.
81. Arena geometry remains unchanged after a gameplay disconnect.
82. A gameplay disconnect no longer counts toward active-player victory conditions.

## Winning

83. The last active player is declared the winner.
84. Physics stops after the winner is declared.
85. Periodic spawning stops after the winner is declared.
86. A clear victory message is displayed.
87. The room provides a Return to Lobby or equivalent action.
88. Returning to lobby rebuilds the roster from currently connected eligible players.
89. Returning to lobby recalculates the polygon.
90. Waiting players may participate after returning to lobby.

## Multiplayer Consistency

91. Ordinary low-latency clients do not disagree about lives.
92. Ordinary low-latency clients do not disagree about elimination.
93. Ordinary low-latency clients do not disagree about score events.
94. Ordinary low-latency clients do not disagree about the winner.
95. Authoritative ball/game state remains consistent enough across clients that gameplay outcomes do not diverge.

## Mobile and Responsive Usability

96. The interface is usable on a typical phone in portrait orientation.
97. The interface is usable on a typical phone in landscape orientation.
98. Controls do not overlap the gameplay arena.
99. The gameplay arena remains usable and approximately square.
100. Text remains readable on a narrow mobile viewport.
101. A phone player can enter or change their name.
102. A phone player can select a color.
103. A phone host can operate required lobby controls.
104. A phone host can start the match.
105. A phone player can steer by touch.

## Deployment

106. The application can be deployed to Railway under `black-demo`.
107. The deployed application is available at a public HTTPS URL.
108. The public deployment loads successfully.
109. A room can be created on the public deployment.
110. The public deployment exposes the normal invite experience.
111. The deployed application runs the same Black application implemented for local development rather than a separate replacement implementation.

---

# 29. Implementation Priorities

A sensible implementation order is:

| Priority | Outcome |
|---|---|
| 1. Room + WebSocket connectivity | Players can create and join isolated rooms. |
| 2. Lobby state | Host, names, colors, roster, and room state work. |
| 3. Polygon generation | One regular polygon edge per seated player. |
| 4. Invite sharing | URL, Copy action, and QR joining work. |
| 5. Paddle input | Mouse, keyboard, and touch update authoritative paddle positions. |
| 6. Single-ball server physics | Ball, paddles, posts, goals, and lives work. |
| 7. Match state | Host start and frozen active roster work. |
| 8. Countdown | Synchronized 3-2-1/GO transition works. |
| 9. Elimination | Dead/disconnected edges become walls. |
| 10. Win condition | Last active player wins. |
| 11. Multiple balls | Timed spawning and score replacement work. |
| 12. Ball-to-ball collision | Equal-mass collision behavior works. |
| 13. Player-relative rendering | Each active player sees their own edge at the bottom. |
| 14. Responsive/mobile usability | Full lobby/game flow works from phones. |
| 15. Deployment | Public Railway HTTPS application is available. |

Functional correctness is more important than decorative polish.

Do not spend disproportionate effort on visual refinement before multiplayer gameplay works.

---

# 30. Engineering Constraints

Implementation choices should favor:

- few source files;
- few external dependencies;
- explicit state;
- straightforward control flow;
- small data structures;
- simple JSON protocol;
- one authoritative server;
- one primary Canvas renderer;
- no database;
- no framework unless clearly beneficial;
- no unnecessary abstraction layers;
- no premature ECS architecture;
- no generalized physics engine;
- no generalized multiplayer framework.

A good implementation is one another developer can understand almost immediately.

The product should remain small enough that the interesting complexity is:

- rooms;
- networking;
- geometry;
- authoritative simulation;
- input;
- multiplayer state;

rather than infrastructure machinery.

### External Dependency Rule

Avoid unnecessary dependencies.

The specifically permitted QR-code JavaScript dependency described earlier is acceptable because implementing QR encoding is not part of the product's core purpose.

Do not use that exception to migrate application logic out of Black.

---

# 31. Suggested MVP Architecture

The exact implementation structure is not prescribed.

A compact implementation may conceptually resemble:

```text
ServerState
├── rooms
└── nextRoomId

Room
├── id
├── invite
├── phase
├── host
├── players
├── arena
├── balls
├── spawnInterval
├── spawnTimer
├── countdown
└── randomState

Player
├── id
├── connection
├── name
├── color
├── edgeIndex
├── paddlePosition
├── lives
├── connected
├── alive
└── seated

Ball
├── id
├── position
└── velocity
```

The browser client may conceptually contain:

```text
ClientState
├── connection state
├── local player identity
├── room/invite state
├── authoritative snapshot
├── local view rotation
├── invert-controls setting
├── viewport/layout information
└── audio/input state
```

The protocol should remain small.

The game does not need:

- ECS;
- entity/component abstraction;
- generic scene graph;
- generalized RPC framework;
- generalized room framework;
- generalized physics package.

Use ordinary records, variants, functions, and explicit state transitions where practical.

This architecture is illustrative rather than mandatory.

A different small architecture is acceptable if it satisfies the product requirements.

---

# 32. Completion Criteria

The MVP is complete when:

1. The application builds successfully from a clean project state.
2. The application runs successfully locally.
3. A user can create a room.
4. Other users can join through the room's invite URL.
5. Other users can join by scanning the QR code.
6. At least three players can participate in a real multiplayer match.
7. Room isolation works.
8. The server remains authoritative.
9. The synchronized countdown works.
10. Player-relative views work.
11. Desktop mouse and keyboard input work.
12. Mobile touch input works.
13. Required physics works.
14. Lives and scoring work.
15. Elimination works.
16. Disconnect behavior works.
17. Multiple balls work.
18. Ball-to-ball collision works.
19. Winning and Return to Lobby work.
20. The interface is usable on desktop and phone-sized viewports.
21. The acceptance criteria in §28 are satisfied.
22. The completed application is deployed to Railway under `black-demo`.
23. A public HTTPS URL is available.
24. The deployed application successfully loads.
25. The deployed application can create a real room and expose its invite flow.

The completed application should remain small enough that its complexity comes primarily from the required game rather than unnecessary supporting infrastructure.

---

# 33. Railway Deployment

The final product must be deployed publicly using Railway.

The prepared Railway project/service is:

```text
black-demo
```

The deployment must:

- build the application;
- launch the required server;
- honor Railway's assigned `PORT` or equivalent runtime configuration;
- expose the browser application publicly;
- support WebSocket connections over the public deployment;
- provide HTTPS through Railway's public endpoint.

The application may maintain all rooms in memory.

The deployment is expected to run as a single application instance for this MVP.

Persistent room state across deploys or restarts is not required.

Horizontal scaling is not required.

The public deployment should be verified after deployment by confirming at minimum:

1. the public page loads;
2. a room can be created;
3. the invite URL/QR experience appears correctly.

The implementation delivered to Railway must be the same Black application developed and verified locally.

Do not replace it with a separate implementation solely for deployment.
