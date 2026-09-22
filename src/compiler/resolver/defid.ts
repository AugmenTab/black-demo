import type { DefId } from "./types.js";

// Simple monotonic DefId allocator, unique within one compiler invocation.
// See phase-03.md §15 / §67 — durable identity is out of scope.
export class DefIdAllocator {
  private next = 1;

  fresh(): DefId {
    return { value: this.next++ };
  }
}
