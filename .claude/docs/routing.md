# `src/app/utils/routing.ts`

The planner. Everything that decides *which* route to build and what it costs, on top of two
primitives: search over a rasterised grid, and shortest paths over the road graph.

The rule numbers used throughout ("rule 1", "rule 3") are the specification's; each is stated where it
first matters, so this document stands on its own.

---

## The shape of a route

Every road-assisted route has one of two shapes:

```
same road component:   [grid A..C] [road C..D] [grid D..B]    rules 1, 2, 4
two road components:   [road A..C] [grid C..D] [road D..B]    rule 3
```

There is no separate branch for rule 1 or rule 2. A grid leg is simply absent when that endpoint is
already on the network, which collapses the first shape into a pure road route (rule 1) or a road plus
one grid leg (rule 2). Rule 1 goes through the same guard as everything else, because a road that
winds twelve times the distance is not what "roads take priority" means.

The fourth possibility — no road involved at all — is the plain grid route.

---

## Constants

| Constant | Value | Why |
|----------|-------|-----|
| `SpeedKmH` | `foot 4`, `horse 8`, `dragon 100` | Foot and horse share one route, one path and one cost; only the divisor differs. The dragon flies the straight line. |
| `ON_NETWORK_EPS` | `0.2` (≈17 km) | A location this close to a network node counts as *on* the road. The threshold has to separate Riverrun (8 km off its nearest node, and the spec requires it to count as on the road) from Pennytree (27 km), Stone Hedge (36 km) and Volon Therys (65 km), which must not. Any value in (0.097, 0.319) works; 0.2 is the middle of that gap. |
| `ROAD_TIME_TOLERANCE` | `3` | Ceiling on how much longer a fully-road route may take than open ground. A constant is unavoidable here: the spec **requires** using the road at ×2.12 (`Qohor → Old Ghis`, 1919 h against 905 h straight), so "minimise time" is not the rule; and `Saath → Morosh` reaches ×15.9 without a guard, riding 3585 km of road around Sarnor to save 66 km of open ground. Any value in 2.2…15 separates those two, and there is no structural discriminator — the ratio of road cost to open-ground saving does not separate them either (3.5 against 54). |
| `CANDIDATE_COUNT` | `20` | Nearest network nodes considered per endpoint. |
| `CANDIDATE_SPACING` | `0.2` (≈17 km) | Minimum spacing between kept candidates. The road network is still a chain of raw geometry vertices, so the 20 nearest nodes to a point are typically 20 consecutive vertices of one road a few km apart: near-identical routes, each demanding its own grid leg, and bounds too close together to prune one another. Below this spacing it makes no difference which vertex the route leaves the road at. |
| `MARGIN_RETRY_STEPS` | 3 steps | The escalation ladder; see `findGroundPathWithRetry`. |
| `SIMPLIFY_EPSILON_FACTOR` | `0.5` | Douglas–Peucker tolerance, in cells. |
| `VISIBILITY_SAMPLE_FACTOR` | `0.5` | Sample spacing, in cells, when testing whether a taut segment is passable. |
| `MAX_PULL_DISTANCE_CELLS` | `10` | Cap on how far one taut segment may reach, so smoothing removes local zigzag instead of collapsing the route into a couple of continent-spanning chords. |
| `COST_SAMPLE_FACTOR` | `0.5` | Sample spacing, in cells, when pricing the drawn line. |
| `JOINT_EPSILON` | `1e-9` | Tolerance for "these two points are the same", used to drop duplicates at leg joints. |
| `NO_PARENT` | `-1` | Fill value for the `cameFrom` arrays. |

---

## Entry points

### `planRoutes(from, to, geodata, roadNetwork = null)`

Convenience wrapper that builds the index and delegates. Used by tests and the harness; the app never
takes this path, because building the index per request would pay ~40 ms every time.

### `planRoutesWithIndex(from, to, index, roadNetwork = null): RoutePlan`

What the worker calls. Plans the ground route once and derives everything from it:

- `foot` and `horse` — the same path and cost at two speeds, or `null` when there is no ground route,
- `dragon` — always present, always the straight line,
- `legs` — the ground route's legs, or `[]`.

Passing `roadNetwork = null` plans a pure grid route; the harness uses that to measure what the road
is being compared against.

### `calculateDragonRoute(from, to): RouteResult`

Straight line, `distanceKm = |to - from| × KM_PER_COORD_UNIT`, time at `SpeedKmH.dragon`. It ignores
terrain, barriers, water and map bounds by design — and it is what remains when no ground route
exists.

---

## Choosing the route

### `planGroundRoute(from, to, index, roadNetwork): GroundRoute | null`

The decision procedure, in order:

1. **`isOnOneLandmass`** — if the endpoints are not on the same landmass, there is no ground route.
   Exact, and free.
2. **No road network** → plain grid route.
3. **`findNetworkAnchor` for each end.** No anchor (an empty network) → plain grid route.
4. **Pick the shape** by whether the two anchors are in the same connectivity group:
   `planSameGroupRoute` or `planCrossGroupRoute`.
5. **The fast accept.** If a road route came back and its cost is within
   `getRoadTimeTolerance(roadShare) × straightLineDistance`, take it without building the grid
   alternative at all. This is sound because open ground can never beat the straight line between the
   ends — `k ≤ 1` means grid cost ≥ geometric distance — so a road route inside the tolerance of the
   straight line is inside the tolerance of whatever the grid would have produced. This is what keeps
   a plain road journey from paying for a full second search (pure-road cases run in 0–1 ms).
6. **Otherwise build the grid route and compare** at the same tolerance. Either side may be `null`;
   whatever exists wins.
7. **`anchorRoute`** the winner.

Comparing costs compares travel times, because cost is terrain-weighted generalised distance and both
sides are measured the same way.

### `isOnOneLandmass(from, to, index): boolean`

Both ends must stand on land, and on the same landmass.

Deciding this from the geometry rather than from the grid is what makes it exact. A cell coarser than a
strait bridges it: the widest fallback grid is 40 km per cell, Blackwater Bay disappeared on it, and a
foot route ran from Castle Black to Dragonstone. Resolution cannot be made fine enough to fix that in
general — the answer has to come from the polygons.

It is also the cheapest test available, so it runs first: impossible pairs (`King's Landing → Pentos`,
any island) now answer in 0 ms, where they used to run the entire retry ladder and fail three times.

### `getRoadTimeTolerance(roadShare): number`

`1 + (ROAD_TIME_TOLERANCE - 1) × roadShare` — the allowance is *earned* in proportion to how much of
the route the road actually carries: ×3 at 100 % road, ×1.5 at 25 %.

A flat ×3 does not work, and this is measured rather than assumed. Every case the spec endorses at a
high ratio is road for 72–90 % of its cost (`Old Ghis → Morosh` ×2.14 at 88 %, `Qohor → Old Ghis`
×2.14 at 90 %), while the detours that have to be rejected pay the same ratio for a road carrying
12–26 %: `Sarhoy → Volon Therys` was ×2.86 at 26 %, crossing the Rhoyne and coming back although both
ends sit on the same bank, and `Volon Therys → The Sorrows` ×2.00 at 12 %.

### `getRoadShare(route): number`

Road legs' cost over total cost; `0` for a zero-cost route.

### `planSameGroupRoute(...)` — rules 1, 2, 4

Both ends reach the same road component. Each side contributes either a single zero-cost entry (the
end is already on the network) or a list of costed candidates, and `planRoadMiddleRoute` picks the
pair.

### `planCrossGroupRoute(...)` — rule 3

The ends sit on **different** road components, bridged by one grid leg:
`[road A..C] [grid C..D] [road D..B]`.

Only attempted when both ends are on a network: with an end off-network there is no "road between
them" to use, and the route falls back to open ground.

Candidates on each side are the anchor itself plus the nodes of that side's group nearest to the
*other* endpoint, thinned. For each pair the bound is `roadToExit + straightLineGap + roadFromEntry`,
where the gap is a genuine lower bound on the grid leg that will bridge it.

Pairs whose two nodes lie in different connected components of the grid are dropped before any search,
using component labels computed **once** for all candidates (`findNodeComponents`). Without that, an
impossible crossing such as Westeros to Essos made every one of the ~50 pairs rasterise its own grid
across the Narrow Sea.

Note that the road network only has four groups — Westeros 1314 nodes, Essos 2163, and two small ones
(115 and 5) inside them — and Westeros/Essos pairs have no ground route at all, so this branch is
narrow in practice. The spec explicitly declines to invest in it further.

### `planRoadMiddleRoute(from, to, context, entries, exits)` — the `[grid][road][grid]` shape

Chooses the entry node C and exit node D minimising the total cost, as branch and bound: variants are
ordered by `entry.distance + roadDistance + exit.distance` and the loop stops as soon as the next bound
is no better than the best route already built, so only the few pairs that can still win pay for a grid
search.

Pairs whose road distance is not finite (different components) or is exactly zero (entry and exit are
the same node, i.e. the road contributes nothing) are skipped.

**Accuracy of the bound.** `entry.distance` and `exit.distance` come from `findCostedCandidates` and
are *exact* grid costs on the shared candidate grid — not straight-line lower bounds. The final legs
are then rebuilt by `buildGridRoute` on their own grid and re-priced along the taut line, so the two
numbers are close but not identical, and the bound is not a strict lower bound. Pruning is therefore a
very tight heuristic rather than a proof; in the cross-group branch, where the gap really is a
straight line, it is a true lower bound.

### `pickCheapestVariant(variants, build)`

Sorts by `bound`, builds variants in order, stops when `bound >= best.cost`, returns the cheapest
route actually built (or `null`). `build` returning `null` — an unreachable leg, a missing road path —
just skips that variant.

There is deliberately **no cap** on how many variants may be costed. An earlier version capped it at 4
and that broke spec examples 3 and 4: the cap discarded the Astapor entry the spec requires. With exact
candidate costs the ordering is good enough that the bound does the cutting.

### `RoadCandidate` and the two meanings of its `distance`

`{ node, distance }`, and the unit of `distance` depends on where the candidate came from:

- from `findCostedCandidates` — an **exact grid cost** from the endpoint to that node;
- from `onNetworkEntry` — **zero**, the endpoint is already on the road;
- from `findNearestNodesInGroup` in `planCrossGroupRoute` — a **straight-line distance**.

Only the first two are ever read as costs: `planRoadMiddleRoute` sums them into its bound, while
`planCrossGroupRoute` builds its bound from road distances and the straight-line gap and never touches
`candidate.distance`. Worth knowing before reusing the type.

### `onNetworkEntry(anchor): RoadCandidate`

`{ node: anchor.node, distance: 0 }` — the endpoint is on the network, so reaching the road costs
nothing.

### `findCostedCandidates(context, point): RoadCandidate[]`

Candidate nodes near `point`, each priced by the **real grid cost** of reaching it from `point` rather
than by straight-line distance:

1. Anchor the point to its group; take the `CANDIDATE_COUNT` nearest nodes in that group; thin them.
2. Build one grid spanning the point and all candidates, rasterise it once.
3. `computeGridCosts` from the point — one Dijkstra prices every candidate at once.
4. Drop candidates that are unreachable (`Infinity`) or that cannot be placed on the grid.

This does two things at once: it removes candidates that are nearest on paper but sit across a river
with no crossing, and it makes the variant ordering in `planRoadMiddleRoute` essentially exact, so the
planner no longer has to build a dozen full routes to discover which entry point was best.

The shared grid is built lazily per endpoint (rather than once per request) because a grid wide enough
to hold every candidate of both ends is coarse enough to change reachability — a shared coarse grid
sealed off reachable candidates, since the blocked river band scales with cell size.

### `thinCandidates(roadNetwork, candidates): RoadCandidate[]`

Keeps the first candidate of each cluster and drops any later one within `CANDIDATE_SPACING` of a kept
one. Input order is nearest-first, so the kept representative is the nearest of its cluster.

Thinning runs **after** the reachability filter wherever both apply, so an unreachable node never
stands in for a reachable one.

### `findNodeComponents(context, candidates): Map<number, number>`

Connected-component label per candidate node, on a single grid spanning all of them. Nodes with
different labels have no grid path between them, so the pair can be dropped without searching.
Candidates that cannot be placed are simply absent from the map, and the caller treats `undefined` as
"no pair".

### `PlanContext` and `createPlanContext(index, roadNetwork)`

Carries the index, the network, and a **memoised** `gridRoute(from, to)`. The planner weighs candidate
pairs, and 20 candidates on each side make up to 400 pairs but only 40 distinct grid legs; memoising by
the endpoint coordinates means each leg is built once per request. The cache holds `null` results too,
so an unreachable leg is not retried.

---

## Grid primitives

### `findPath(grid, k, start, goal): PathResult | null`

A* over the 8-connected grid, on flat typed arrays.

- **Edge cost** `0.5 × distance × (1/kA + 1/kB)`: the two half-steps through the two cells, so a step
  between cells of different terrain is priced by their average slowness. Diagonal steps use their
  real length (`hypot(±1, ±1) × cellSize`).
- **Heuristic** Euclidean distance between cell centers. Admissible and consistent because `k ≤ 1`
  makes every edge cost at least its geometric length; without that ceiling the heuristic would
  overestimate and the search would return non-optimal paths.
- **Lazy deletion**: a cell can be pushed several times, and a `visited` flag skips the stale pops.
  The goal is returned when it is *popped*, not when it is reached.
- Returns `null` immediately if either endpoint cell is impassable, and after exhausting the open set
  if the goal is unreachable.

The path returned is the staircase of cell centers — `buildGridRoute` is what turns it into a drawn
line.

### `computeGridCosts(grid, k, start): Float64Array`

The same edge model with no heuristic and no goal: Dijkstra from `start` to every reachable cell, so
one run prices every candidate. Unreachable cells keep `Infinity`, which makes this a strictly stronger
test than comparing connected components — it distinguishes "reachable" from "reachable *and* how
expensive".

Returns an all-`Infinity` array if the start cell itself is impassable.

### `placePoint(point, grid, index, k): CellIndex | null`

The cell a route may start or end in, or `null` when the point cannot host one:

- outside the grid → `null` (no cell exists);
- the point classifies as passable → its own cell;
- the point is **not on land** → `null`. Open sea and unmapped void are where no ground route begins
  or ends;
- otherwise (water inside the land: a lake, a blocked river, impassable terrain) → the nearest
  passable cell.

The asymmetry to know about: placement judges the **point**, while everything downstream judges **cell
centers**. A point on a sliver of land whose cell center falls in water gets its own cell back, that
cell is `IMPASSABLE` in the raster, and the search fails on this grid and moves to the next retry step.

### `findNearestPassableCell(grid, k, origin): CellIndex | null`

Ring-by-ring breadth-first walk outward from `origin`, returning the first passable cell. Bounded by
the grid, so it terminates with `null` on an entirely impassable grid. The rings are built from
`NEIGHBOR_OFFSETS`, so "nearest" is in Chebyshev rings rather than Euclidean distance — close enough at
one-cell granularity.

### `heuristic(point, goal)`

Euclidean distance in coordinate units. Also used directly by `planGroundRoute` as the straight-line
lower bound on any ground route.

### `buildPathResult(grid, cameFrom, endFlat, cost): PathResult`

Walks `cameFrom` from the goal back to the start, collecting cell centers, and reverses. The start is
recognised by `NO_PARENT`.

### `getCellLabel(grid, labels, cell)`

Component label lookup, for readability at the two call sites.

---

## Building and pricing a grid route

### `buildGridRoute(gridFrom, gridTo, index): GroundRoute | null`

The full grid pipeline: `findGroundPathWithRetry` → `simplifyPath` → `pullTautPath` →
`measurePathCost`. Returns a single-leg `GroundRoute` of kind `grid`.

The cost is deliberately **not** the A* cost. It is re-measured along the line that will actually be
drawn, for two reasons: the staircase of cell centers is up to ~8 % longer than the drawn line (the
metric error of 8-connectivity), so distance and time would describe different geometry; and that error
*grows with cell size*, which made costs from different steps of the retry ladder incomparable — a
barrier could then appear to make a route faster.

### `findGroundPathWithRetry(from, to, index)`

Runs the search on progressively wider bounding boxes until one succeeds, returning the path together
with the grid and raster it was found on (the caller needs both to price and smooth it).

```
step 1   marginRatio 0.25   minMargin 0.25   budget 180 000
step 2   marginRatio 1      minMargin 2      budget 100 000
step 3   marginRatio 4      minMargin 8      budget  60 000
```

The point of widening is detours: a crossing may lie far outside the corridor between the two points.
The absolute `minMargin` matters as much as the ratio — two points on one meridian have zero span, so a
purely proportional margin would keep the box a sliver however wide the step asks for, and a detour to
a crossing a hundred km aside could never be found.

Escalation is decided by an **exact** test, not by a failed search: if the two endpoints land in
different connected components of this grid, no path exists on it at all, so there is nothing to search
and the next step is tried immediately.

Measured: every real case in the harness resolves at step 1 or 2. Step 3 (40 km per cell for a
continent-spanning pair) was reached by exactly one case — the false `Castle Black → Dragonstone` — and
is now unreachable for endpoints on different landmasses. A known residual: on cells that coarse, the
raster can still shortcut a **bay within one landmass**. Not measured, and no harness case reaches it.

### `measurePathCost(path, grid, k): number`

Integrates `distance / k` along the polyline, sampling the raster at midpoints of sub-steps no longer
than half a cell.

The `lastK` carry-over handles two real cases: a sample can miss the passable cells the taut segment
was checked against, and the anchored ends may sit on water the point was snapped away from. Over a
fraction of a cell, the last coefficient seen is the closest terrain on record. Without it those
samples would read `IMPASSABLE` and divide by zero.

### `simplifyPath(path, epsilon): Position[]`

Douglas–Peucker, recursive, with `epsilon = cellSize × SIMPLIFY_EPSILON_FACTOR`.

**It does not check passability.** A shortcut may deviate up to half a cell from the searched
staircase, and nothing re-validates it afterwards — `pullTautPath` never tests the segment from an
anchor to its immediate successor. Half a cell is small, but this is the one place where the drawn line
is not guaranteed to be a line the search approved, which is why `checkPathOnLand` samples the finished
route against the polygons every kilometre.

### `pullTautPath(path, index, cellSize): Position[]`

Greedy string-pulling: from each anchor, extend to the farthest later point still reachable by a
passable straight segment, keep that point, and continue from it. Turns the staircase into a handful of
straight runs.

### `isSegmentPassable(from, to, index, cellSize): boolean`

Rejects segments longer than `MAX_PULL_DISTANCE_CELLS × cellSize`, then samples the interior at
`cellSize × VISIBILITY_SAMPLE_FACTOR` spacing and requires `classifyCell` to be non-null everywhere.
Endpoints are not sampled — they are already known to be on the path.

Because the sampling step and the reach cap both scale with `cellSize`, smoothing is more aggressive on
coarser grids. That is the second residual resolution dependency, alongside terrain being read from the
raster of the grid the leg was searched on.

---

## Assembling and accounting

### `GroundRoute`

`{ path, cost, legs }`. The internal representation, before it becomes a `RoutePlan`.

### `combineRoutes(...pieces)`

Concatenates paths, legs and costs, skipping `null` and `false` pieces. The `false` is what lets a call
site write `leadIn.distance > 0 && roadSegmentRoute(leadIn)` and omit a zero-length lead-in inline.

### `roadSegmentRoute(roadPath): GroundRoute`

Wraps a road path as a one-leg route whose cost **is its length** — a road is traversed at `k = 1`.

### `anchorRoute(route, from, to): GroundRoute | null`

Ties the route to the real endpoints and makes the legs a true partition of it.

The stitching: a grid leg starts at the center of the cell containing its start, not at the point
itself, and a road leg starts at its first network node. Without anchoring, the drawn line has visible
stubs at both ends and the measured length omits them. The anchors are appended to the **outer** legs,
duplicate consecutive points (within `JOINT_EPSILON`) are dropped, and every kept point is recorded in
the leg it came from — so the finished path is exactly the legs' paths in order, which
`checkLegPartition` asserts point for point.

The accounting: two stretches of the drawn line carry no cost of their own and are charged here.

- the **stubs** the anchors add at the ends (`added`, clamped at zero because deduplication can also
  shorten a leg);
- the **joints** between one leg and the next — a grid leg ends at a cell center while the following
  road leg starts at a network node, and that jump is part of the drawn line.

Both are charged at the adjoining leg's own average coefficient, and the joint is charged to the leg it
leads *into*. This was a real defect: `Pennytree → Stone Hedge` had legs summing to 1.9924 against a
path length of 2.0891 — 8 km of line for free — and `Sarhoy → Volon Therys` reported an effective
4.016 km/h against a base of 4, which is impossible when `k ≤ 1`. `checkEffectiveSpeed` now guards it.

### `chargeLength(length, leg): number`

Prices a length at a leg's **average** coefficient, derived as `legLength / legCost`. Falls back to
`TerrainK.Default` for a degenerate leg (no length or no cost). Averaging is the honest option here: the
stub and the joint are shorter than a cell, so there is no better local estimate than the terrain the
leg as a whole crossed.

### `isSamePosition(a, b)` / `getPathLength(path)` / `getPathDistanceKm(path)`

Coordinate comparison within `JOINT_EPSILON`; polyline length in coordinate units; the same in
kilometres.

### `toRouteResult(route, speedKmh): RouteResult`

`distanceKm` from the drawn path's geometry, `timeHours` from the route's cost. Both describe the same
line — that is the invariant `checkEffectiveSpeed` enforces, and the reason `distanceKm` is not simply
derived from `cost`.

---

## Invariants this module must satisfy

All enforced by `scripts/routing/check-routing.mjs` against real geodata:

| Invariant | Check |
|-----------|-------|
| No route averages more than the base speed (`k ≤ 1`) | `checkEffectiveSpeed` |
| Legs concatenate back into the drawn path, point for point | `checkLegPartition` |
| Every kilometre of the drawn route stands on land and not in a lake | `checkPathOnLand` |
| No point of a route lies outside `MapBounds` | `checkMapBounds` |
| A barrier is only crossed within tolerance of a crossing declared **for it** | `checkBarrierCrossings` |
| A road-assisted route beats open ground by no more than its road share earns | `checkDetourGuard` |
| Every location is passable | `checkLocationsPassable` |
| `rasterizeGrid` equals `classifyCell` per cell | `checkRasterFaithfulness` |
| The worker still answers `init` + `plan` | `checkWorkerProtocol` |
| Route structure, distance, time and point count match the snapshot | `scripts/routing/baseline.json` |
