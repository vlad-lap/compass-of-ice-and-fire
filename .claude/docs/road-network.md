# `src/app/utils/road-network.ts`

Shortest paths over the road graph. Thin, and deliberately generic: it is a graph of lines with no
notion of terrain, water or barriers.

## The graph

`RoadNetwork` is built at geodata build time (`geodata/road-network.json`) and holds:

- `nodes: Position[]` — raw road geometry vertices, 3622 of them,
- `edges: { from, to, distance }[]` — 3638 undirected edges; `distance` is geometric length in
  coordinate units,
- `nodeGroups: number[]` — a connectivity group id per node, precomputed at build time. Four groups:
  Westeros 1314 nodes, Essos 2163, and two small ones (115 and 5) inside them.

Two consequences of nodes being raw vertices rather than junctions:

- **Node density is high and uneven.** The 20 nearest nodes to a point are typically 20 consecutive
  vertices of the same road a few km apart, which is why the planner thins candidates by spacing
  (`CANDIDATE_SPACING`) before doing anything expensive with them - and why `findCostedCandidates`
  ranks by the cost of walking to a node rather than by how near it is.
- **Edge length is the only cost.** A road leg costs its own length, i.e. it is travelled at `k = 1` —
  the fastest terrain there is. That is the mechanical form "roads take priority" takes; the planner's
  tolerance guard is what stops it from being abused.

`nodeGroups` answers "could these two points be connected by road at all" without a search, which is
what lets the planner pick between the same-group and cross-group route shapes up front.

---

## Types

### `NetworkAnchor`

`{ node, group, distance }` — the network node nearest to a point, its connectivity group, and the
straight-line distance to it. The planner compares `distance` against `ON_NETWORK_EPS` to decide
whether the point counts as sitting on the road.

### `RoadNetworkPath`

`{ path, distance }` — a node-to-node path as positions, and its total length.

### `NetworkSearch` (internal)

`{ distances, cameFrom }` — one completed Dijkstra from one source, as typed arrays over all nodes.

---

## Nearest-node queries

### `findNetworkAnchor(point, network): NetworkAnchor | null`

Linear scan over all nodes for the nearest one. `null` only for an empty network.

`O(n)` with n = 3622, run twice per request — a few hundred microseconds, well below the cost of one
rasterisation, so there is no spatial index. If node counts grow by an order of magnitude, this and
`findNearestNodesInGroup` are the two places to index.

### `findNearestNodesInGroup(network, group, target, count)`

The `count` nodes of one group nearest to `target`, as `{ node, distance }`, nearest first.

Note the order of operations: distances are computed for **all** nodes, then filtered by group, then
sorted, then sliced. Filtering first would be cheaper, but at this size the sort dominates either way.

Restricting to one group is what makes the results usable: the planner asks for candidates on a
specific road component, and a node from another component would be a candidate that can never be
reached by road.

---

## Adjacency

### `getAdjacency(network): Adjacency`

Builds the undirected adjacency list — each edge appended to both endpoints — and memoises it in a
`WeakMap` keyed on the network object.

`WeakMap` rather than a module-level variable so that the cache is per network instance and dies with
it. In the worker there is exactly one network for the lifetime of the page, so this builds once.

---

## Dijkstra with per-source memoisation

### `getNetworkSearch(network, source): NetworkSearch`

Returns a completed search from `source`, from cache or freshly run.

The access pattern is what motivates caching: route planning asks for *distances* from a handful of
candidate nodes, then for the *paths* of the few it settles on, and often repeats a source across the
variants it weighs. Each source is therefore searched once and both queries read the same result.

Capped at `MAX_CACHED_SEARCHES = 64` because the network object outlives a single request and one
search costs ~8 bytes plus 4 bytes per node (~29 KB here). Eviction is a **full clear** rather than
LRU — at this size, simplicity beats a hit-rate optimisation, and requests are bursty enough that a
cold cache after 64 distinct sources is unremarkable.

### `runNetworkSearch(network, source): NetworkSearch`

Plain Dijkstra to **all** nodes, no early exit:

- `distances: Float64Array` filled with `Infinity`, `cameFrom: Int32Array` filled with `NO_PARENT`,
  `visited: Uint8Array`,
- a `MinHeap<number>` of node indices with lazy deletion: a node may be pushed several times and
  `visited` skips the stale pops.

Searching to completion is the point — the result is a reusable table, and an early exit at one target
would make it useless for the next query.

`MinHeap` rather than `NumericMinHeap` here: 3622 nodes and ~3638 edges make the object allocation
irrelevant, unlike the grid search where the heap sees hundreds of thousands of pushes.

### `getNetworkDistances(network, source): Float64Array`

The distance table from one source. Unreachable nodes hold `Infinity`, which is how the planner drops
pairs in another road component (`isFinite`).

### `findNetworkPath(network, source, target): RoadNetworkPath | null`

Reconstructs a path from the memoised search by walking `cameFrom` back from the target, unshifting
positions so the result runs source → target, and reports `distances[target]` as its length.

- `source === target` is special-cased to `{ path: [node], distance: 0 }`, because `cameFrom[source]`
  is `NO_PARENT` and the walk would not terminate on that input.
- Unreachable target → `null`.

A single-point path with distance 0 is a legitimate result and the planner interprets it as "the road
contributes nothing", skipping such variants.
