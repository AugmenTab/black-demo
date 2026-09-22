# std

Prototype Prelude and standard library will be bundled here.

No physical `.blk` sources are shipped yet. Phase 3 wires the Prelude into scope via the resolver so `+`, `-`, `map`, etc. resolve during name resolution, but a bundled on-disk stdlib belongs to a later phase (currently expected alongside the Phase 5 real backend). Until then, `white build` still emits a placeholder ES module without invoking any Black semantics at runtime.
