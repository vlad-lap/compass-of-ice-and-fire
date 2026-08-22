# `src/app/utils/min-heap.ts`

Two binary min-heaps with identical sift logic and different storage. Both are plain
array-backed heaps: parent of `i` is `⌊(i−1)/2⌋`, children are `2i+1` and `2i+2`.

| Class | Storage | Used by |
|-------|---------|---------|
| `NumericMinHeap` | Two parallel typed arrays | `findPath` and `computeGridCosts` in `routing.ts` |
| `MinHeap<T>` | One array of `{ priority, value }` objects | `runNetworkSearch` in `road-network.ts` |

## Why there are two

The grid search sees **hundreds of thousands of pushes per route** — one per relaxed edge over a grid
of up to 180 000 cells with 8 neighbours each. With one object allocated per entry, that allocation and
the resulting garbage collection dominated the search, so the grid heap stores priorities in a
`Float64Array` and payloads in an `Int32Array` and allocates nothing per push.

The road search sees ~3600 nodes and ~3600 edges, where the difference is immeasurable, so it keeps the
generic object-based heap.

`Float64Array` for the priorities specifically, not `Float32Array`: rounding priorities to 32 bits
changes which of two equal-cost paths A* pops first (`0.7` becomes `0.699999988`), and that silently
changes the drawn line — a route went from 548 to 545 points with no other change.

## Contract both share

- **Min-heap on `priority`**, ties broken arbitrarily by heap layout.
- **No decrease-key.** Callers push a node again with its improved priority and skip stale pops with a
  `visited` flag. This is the standard lazy-deletion Dijkstra/A*: the heap may hold several entries per
  node, so its size is bounded by edges relaxed rather than by nodes.
- **`pop()` does not check for emptiness.** On an empty heap it reads a stale slot and drives the size
  negative. Every call site is inside a `while (open.size > 0)` loop, which is the intended usage.
- **`pop()` returns the payload only**, not the priority. Callers that need the cost read it from their
  own `gScore`/`distances` array, which is authoritative anyway — the priority in the heap may be
  stale.

## `NumericMinHeap`

### `constructor(capacity = 1024)`

Allocates both arrays at `capacity`. The default is small on purpose: the heap grows geometrically, and
most searches never approach the cell count.

### `get size()`

Number of live entries — the logical length, not the array capacity.

### `push(priority, value)`

Grows if full, writes both arrays at the end, then sifts up from the new index.

### `pop()`

Takes the root's payload, moves the last entry into the root, shrinks, and sifts down. Skips the sift
when the heap becomes empty.

### `grow()`

Doubles both arrays and copies via `set`. Amortised `O(1)` per push; peak memory is at most twice the
live size.

### `swap(a, b)`

Exchanges the entries at two indices in both arrays, by hand rather than by destructuring — this is the
inner loop of the sift, and it must not allocate.

### `bubbleUp(index)`

Walks toward the root while the parent's priority is greater, swapping. Stops at the first parent that
is not.

### `bubbleDown(index)`

Repeatedly swaps with the smaller of the two children while one of them is smaller than the current
node. Written as `for (;;)` with an explicit break, so the loop exits exactly when the node is in
position.

## `MinHeap<T>`

Same algorithm over `{ priority, value }[]`, with the swaps written as array-destructuring assignments
for readability.

### `pop(): T | undefined`

Reads the root, pops the last element, and — when the heap is not empty and the popped element is
defined — moves it to the root and sifts down. Returns `top?.value`, so an empty heap yields
`undefined` rather than throwing. That is the one behavioural difference from `NumericMinHeap`, whose
payload type has no room for a "missing" value.
