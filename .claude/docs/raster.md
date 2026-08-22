# `src/app/utils/raster.ts`

Two jobs, in this order:

1. **Index** the geodata once into a `RoutingIndex` — features grouped by what they mean for movement,
   each with a bounding box, plus land grouped into landmasses.
2. **Rasterise** a `Grid` into a `Float64Array` of terrain coefficients that the searches read.

Plus the point-level classifier the raster must agree with, connected-component labelling, and the
small geometry helpers all of it rests on.

Nothing here knows what a route is. Everything is either "what does the map say about this place" or
"paint what the map says into this array".

---

## The passability model

Four rules, applied in this order by `classifyCell`:

1. **Outside the mapped world is a wall.** `MapBounds` (North 48.7, South −39.3, East 127.4,
   West −7.1). The boundary itself is passable, anything past it is not.
2. **A barrier blocks unless a crossing is right there.** Barriers are lines: rivers of size 2 or 3,
   and the Wall.
3. **Land is what the map draws; water is the default.** A point not inside a continent or island
   polygon is impassable. Lakes are the exception that has to be tested explicitly, because they are
   drawn *inside* the land.
4. **Otherwise the terrain layers decide `k`**, first match wins, in the order mountains → swamps →
   deserts → forests, falling back to `1`.

Rule 3 is stated as *absence of land*, not as *presence of sea*, and that phrasing is the whole point.
Testing for sea polygons is what made 43 locations impassable — Pyke, Braavos, Lys, Dragonstone,
Lorath and others — because the sea polygons are drawn **without holes** and the islands are drawn on
top of them (114 of 125 islands have their center inside a sea polygon). "Inside a sea polygon" means
"water *or* an island". Meanwhile "not on land" already covers every stretch of real water, so the sea
layer is redundant for routing and is not indexed at all. It is still needed to draw the map.

The same phrasing also closes the other half of the defect: any region the geodata says nothing about
is water rather than open ground, so an unmapped gap can never become a free corridor.

---

## Constants

| Constant | Value | Why |
|----------|-------|-----|
| `MOUNTAIN_K_BY_HEIGHT` | `{1: 0.5, 2: 0.35, 3: 0.2}` | Mountain `k` by the polygon's `height` property; an unknown height falls back to `1`. |
| `TerrainK` | `Swamp 0.3`, `Desert 0.7`, `Forest 0.9`, `Default 1` | Terrain coefficients. `Default` doubles as the coefficient of land with no terrain layer on it, and as the stand-in coefficient wherever a real one is unavailable. |
| `IMPASSABLE` | `0` | Sentinel in the `k` array. Not a coefficient — nothing divides by it; every consumer tests for it explicitly. |
| `RIVER_BAND_FACTOR` | `√2 / 2 ≈ 0.707` | Half-width, in cells, of the band a barrier line blocks. Half a cell diagonal is the smallest value that guarantees a *continuous* band under 8-connectivity: any thinner and a diagonal step could slip between two unblocked cells straddling the line. |
| `CROSSING_GATE_RADIUS` | `0.02` (≈1.7 km) | How wide a hole a crossing opens in its barrier. Absolute rather than relative to cell size, because a purely relative radius makes reachability depend on grid resolution — which it did: on a shared coarse grid, candidates that were reachable at one resolution were sealed off at another. Crossings are snapped onto the river at build time, so the radius only has to punch through the blocked band, not also cover an offset from the bank. |
| `CROSSING_GATE_FACTOR` | `1.5` | Floor on the gate radius in cells. A gate must contain at least one cell center on each bank to be usable, and the blocked band is ~0.71 cells wide, so ~1.5 cells is the smallest radius that reliably punches through. Larger is actively harmful: at 2.5 cells a coarse grid let routes hop a river 5 km from the nearest crossing. |
| `BLOCKING_RIVER_SIZES` | `[2, 3]` | Rivers of size 1 do not affect movement at all and are not indexed as barriers. |
| `NO_COMPONENT` | `-1` | Fill value for `labelComponents`; also the label an impassable cell keeps. |
| `LANDMASS_BUCKET_SIZE` | `0.25` | Spatial hash cell for the landmass edge index. |
| `LANDMASS_BUCKET_ROW_STRIDE` | `100_000` | Packs a bucket's `(col, row)` into one integer key as `col * stride + row`. Safe because bucket rows stay far below the stride: the mapped world is ~350 buckets tall. |
| `LANDMASS_JOIN_DISTANCE` | `MIN_CELL_SIZE × √2` (≈2.4 km) | Two land polygons closer than this are one landmass. Chosen as exactly what two diagonally adjacent cells of the *finest* grid span, so the geometric rule is never **stricter** than the raster it guards: whatever the finest raster would join, the geometry joins too. On the current map the threshold is inert — at 0 km the data yields 599 landmasses out of 600 polygons, at 2 km 598, and merges only start appearing at 5 km. The map has no accidental hairline gaps. |

---

## Indexing

### `buildRoutingIndex(geodata: RoutingGeodata): RoutingIndex`

Called once per worker, ~40 ms, nearly all of it `indexLandmasses`. Groups features by their meaning
for movement and attaches a bounding box to each:

- `land` — continents and islands, **per polygon** (see `indexLandmasses`), `k = 1`.
- `mountains` — `k` from `MOUNTAIN_K_BY_HEIGHT[height]`.
- `swamps`, `forests` — one `k` each.
- `deserts` — desert polygons **plus lakes marked `variant: 'dry'`**: a dried lake bed walks like
  desert, so it is folded into that layer rather than being a case of its own downstream.
- `lakes` — the non-dry lakes only, with `k = null`, which `fillAreas` paints as `IMPASSABLE`.
- `barriers` — size 2/3 rivers and the Wall, each carrying **its own** crossings (see
  `indexBarrier`).

There is deliberately no `seas` layer; see the passability model above.

### `indexArea(feature, k): IndexedArea`

`{ bbox, geometry, k }`. `k = null` means "impassable area" and is how lakes are expressed.

### `indexBarrier(feature, barrierCrossings): IndexedBarrier`

`{ bbox, geometry, crossings }`, where `crossings` are only those declared for **this** barrier,
matched by the feature's `name` (or `id`, or `'unnamed'`) against `crossing.barrier`.

Keeping crossings attached per barrier is not tidiness, it is the fix for a reported defect: a shared
list of crossing points opens a hole in *whatever* barrier happens to pass within the gate radius, and
at a confluence a bridge over the Volaena punched a hole in the Rhoyne.

### `indexLandmasses(features): IndexedLandmass[]`

Groups land polygons into **landmasses**: sets of polygons you can walk between because they touch.
Returns one entry per polygon, each tagged with its landmass id.

Why this exists at all: walking from one land polygon to another is only possible where they meet, so
an island is unreachable on foot however the grid is resolved. The raster cannot decide this — a cell
wider than a strait bridges it, and on the 40 km fallback grid Blackwater Bay vanished entirely and a
foot route ran from Castle Black to Dragonstone. Grouping the polygons once, from the geometry, answers
the question exactly and independently of resolution.

Three properties worth keeping:

- **Per polygon, not per feature.** A `MultiPolygon` feature holds unrelated islands — the Iron
  Islands, the Thousand Islands — and grouping by feature would weld them into one landmass. This also
  gives every polygon a tight bounding box, which speeds up `fillAreas` and `findContaining`.
- **Touching counts, within `LANDMASS_JOIN_DISTANCE`** (`joinTouchingPolygons`).
- **Nesting counts** (`joinNestedPolygons`).

Implementation: a union-find over an `Int32Array` of parents (`findRoot`, `join`), first over touching
polygons, then over nested ones, then each polygon is emitted with `landmass = findRoot(...)`. Landmass
ids are therefore arbitrary polygon indices, meaningful only by equality.

On the current map: 600 polygons → 596 landmasses, 34 of which hold locations, and all 285 locations
sit on one.

### `findRoot(roots, index)` / `join(roots, a, b)`

Textbook union-find. `findRoot` halves the path as it walks (`roots[root] = roots[roots[root]]`).
`join` is union by arbitrary root — no rank or size heuristic, which at 600 elements costs nothing.

### `joinTouchingPolygons(polygons, roots)`

Unions polygons whose **outer rings** come within `LANDMASS_JOIN_DISTANCE`.

Brute force is out of reach: Westeros' outline alone is thousands of vertices and its bounding box
overlaps most islands, so ring-against-ring testing would run into hundreds of millions of segment
pairs. Instead every edge is bucketed into a `0.25°` spatial hash, expanded by the join distance
(`forEachBucketNearSegment`), and only edges sharing a bucket are compared. On the real data that is
~38 000 bucket entries and ~81 000 segment-pair tests, a few milliseconds.

Pairs already in the same set are skipped, so the work shrinks as sets merge.

**Limitation:** only `rings[0]` participates. Holes are ignored, so a polygon sitting inside another
one's hole would still be joined to it if their outer rings run close. No such case exists on the
current map.

### `joinNestedPolygons(polygons, roots)`

Unions a polygon with any polygon that fully contains it. A polygon drawn entirely inside another
shares no coastline with it yet stands on its land — the Isle of Faces is drawn *over* Westeros rather
than inside a hole in it.

`O(n²)` over 600 polygons with a bounding-box containment prefilter, and the expensive
`pointInPolygon` runs only for pairs that pass it and are not already joined. Containment is judged by
a single representative vertex (`rings[0][0]`), and the *outer* polygon's holes are respected.

### `forEachBucketNearSegment(from, to, visit)`

Visits every spatial-hash key a segment's bounding box touches after expansion by
`LANDMASS_JOIN_DISTANCE` — the expansion is what lets a *proximity* test work on a hash built for
*overlap*.

### `getLandmass(point, land): number | null`

The landmass a point stands on, or `null` when it stands on no land at all. Answers the reachability
precondition in `routing.ts`. Returns the first containing polygon in array order (continents before
islands), which matters only for overlapping polygons — and overlapping polygons are joined anyway.

---

## Point classification

### `isWithinMapBounds([lng, lat]): boolean`

Inclusive on all four bounds. Nothing exists past the edge of the mapped world, so the geodata has no
polygon there — and with the terrain default that emptiness read as open ground, which let routes walk
off the north of Westeros, around the outside of the map, and back in through eastern Essos.

### `classifyCell(point, index, cellSize): number | null`

The terrain coefficient at a point, or `null` for impassable. The one authority on passability; the
raster is required to reproduce it exactly.

`cellSize` enters because two thresholds scale with resolution: the blocked band around a barrier
(`cellSize × RIVER_BAND_FACTOR`) and the gate radius (`getCrossingGateRadius`). A barrier blocks the
point when the point is inside the barrier's bounding box expanded by the band, within the band of the
line itself, **and** not within the gate radius of a crossing declared for that same barrier.

Cost: roughly 32 µs per call — it is a linear scan over the layers with bounding-box prefilters. That
is why the search reads a pre-painted raster instead of calling this per cell, and why the harness
checks the equivalence on a few tens of thousands of cells rather than millions.

### `getCrossingGateRadius(cellSize)`

`max(CROSSING_GATE_RADIUS, cellSize × CROSSING_GATE_FACTOR)` — absolute, with a floor in cells so that
a coarse grid still finds a cell center inside the gate on each bank.

### `classifyLandscape(point, index): number | null`

Everything except bounds and barriers: land test, then lake test, then the terrain layers in priority
order (mountains → swamps → deserts → forests), then `TerrainK.Default`.

---

## Rasterisation

### `rasterizeGrid(grid, index): Float64Array`

The inverted loop: features are painted into the grid, rather than every cell being tested against
every feature. Cell for cell it must equal `classifyCell` on every cell center — that equivalence is
the only thing that makes the inversion safe, and `checkRasterFaithfulness` asserts it against real
geodata over every cell of several grids.

Order matters and is the mirror image of `classifyLandscape`:

1. Start from `TerrainK.Default` everywhere.
2. Paint terrain **lowest priority first** — forests, deserts, swamps, mountains — because a later
   paint overwrites an earlier one, whereas `classifyLandscape` returns on its *first* match. The
   mountains layer is painted **reversed** (`[...index.mountains].reverse()`), because `k` varies
   within that layer by height and only reversing keeps the first matching polygon in classify order
   winning the pixel.
3. Paint lakes as impassable.
4. Apply the land mask **as a constraint, not as a paint**: land is accumulated into a separate
   `Uint8Array`, and afterwards every cell not marked land is forced to `IMPASSABLE`. Painting land
   first would let a forest or mountain polygon whose edge spills past the coastline open a passable
   cell out in the water.
5. `blockOutsideMap`, then `blockBarriers`.

The `rowMask` scratch buffer (one byte per column) is allocated once here and reused by every
`fillPolygon` call.

### `blockOutsideMap(k, grid)`

Fills everything whose **cell center** falls outside `MapBounds` with `IMPASSABLE`, row by row: rows
entirely outside are filled in one go, rows partly inside get their left and right tails filled. The
column and row limits are derived so the result matches `isWithinMapBounds` on centers exactly —
`ceil(x - 0.5)` for the first center at or past a bound, `floor(x - 0.5)` for the last center at or
before it.

### `blockBarriers(k, grid, index, extent)`

For each barrier whose bounding box (expanded by the band) overlaps the grid, walks every segment of
its geometry and blocks the cells within `cellSize × RIVER_BAND_FACTOR` of that segment — except cells
within the gate radius of one of **that barrier's** crossings.

### `forEachCellNearSegment(grid, start, end, threshold, visit)`

Iterates the segment's bounding box, expanded by `threshold`, and calls `visit(flatIndex, center)` for
cells whose center is genuinely within `threshold` of the segment (`pointToSegmentDistance`). The
center is passed along because the caller needs it for the gate test.

### `fillAreas(grid, rowMask, areas, extent, write)`

Skips areas whose bounding box misses the grid, resolves `k ?? IMPASSABLE` once per area, and hands
each polygon of the geometry to `fillPolygon`. The `write` callback is what lets the same filler paint
into `k` for terrain and into the `land` mask for the land constraint.

### `fillPolygon(grid, rowMask, [outerRing, ...holes], value, write)`

Scanline fill of one polygon, one grid row at a time, over the row range the outer ring's latitude
span covers:

1. Get the outer ring's spans on this row's center latitude (`getRowSpans`) and skip the row if there
   are none.
2. Set `rowMask` to 1 across those spans, then clear it to 0 across every hole's spans on the same
   latitude. Holes therefore subtract exactly, including a hole that splits a span in two.
3. Walk the spans and `write` each column still marked, clearing the mask as it goes; a final
   `rowMask.fill(0, …)` per span clears whatever the holes had zeroed, leaving the buffer clean for
   the next row and the next polygon.

### `buildEdgeTable(ring): EdgeTable`

Precomputes the ring's edges as `{ currLng, currLat, prevLng, prevLat, minLat, maxLat }`, **drops
horizontal edges** (they can never be crossed by a horizontal scanline and would divide by zero), and
sorts by `minLat`.

The sort is what makes the scan cheap: `getRowSpans` can stop at the first edge whose `minLat` is
already past the row. Rings here run to thousands of vertices — the Westeros and Essos outlines are
~14 000 between them — so rescanning every edge for every row is what a continent-sized polygon costs
without this table.

### `getRowSpans(grid, edgeTable, centerLat): [number, number][]`

Ray casting on one latitude, returning **column ranges** rather than points.

Collects the longitudes where edges cross `centerLat` (skipping edges below the row, breaking out
above it, and requiring a genuine sign change so a vertex touched by exactly one edge is not counted
twice), sorts them, and pairs them up: crossing 0–1 is inside, 1–2 outside, and so on.

Each pair becomes a column range using the same convention as `pointInRing` in
`scripts/point-in-polygon.mjs` — a crossing counts only when the point is *strictly left* of the
intersection. So the range runs from the first center at or past the left crossing
(`ceil(x - 0.5)`) to the last center strictly before the right one (`ceil(x - 0.5) - 1`): a center
exactly on a span's left edge is inside, one on its right edge is not. Getting this off by one cell
is exactly what `checkRasterFaithfulness` catches.

An odd crossing count (a numerically degenerate ring) yields fewer pairs rather than an error; fewer
than two crossings yields nothing.

---

## Connectivity

### `labelComponents(grid, k): Int32Array`

Labels every passable cell with the id of its 8-connected component, by iterative flood fill over an
explicit stack (no recursion: components run to hundreds of thousands of cells).

Two cells share a label exactly when a grid path between them exists. That turns "is the goal
reachable at all" into an array lookup, instead of an exhaustive A* that has to expand the entire
component to prove a negative — which is what impossible routes used to pay, three times over, once
per retry step.

Impassable cells keep `NO_COMPONENT`, so a caller comparing two labels must also check that they are
not `NO_COMPONENT` if either cell might be impassable.

---

## Geometry helpers

| Function | Behaviour |
|----------|-----------|
| `getGridBBox(grid)` | The grid's outer rectangle, used as the `extent` prefilter for painting. |
| `getBBox(geometry)` / `getRingBBox(positions)` | Bounding box of any geometry / of a position list, in one pass. |
| `isInBBox(point, bbox)` | Inclusive containment. |
| `bboxesOverlap(a, b)` | Inclusive overlap. |
| `bboxContains(outer, inner)` | Full containment, inclusive. |
| `expandBBox(bbox, margin)` | Grows a box on all sides, so a *proximity* query can reuse an *overlap* prefilter. |
| `getPolygonRings(geometry)` | Normalises `Polygon`/`MultiPolygon` to a list of ring-lists. |
| `getLineParts(geometry)` | Normalises `LineString`/`MultiLineString` to a list of point-lists. |
| `findContaining(point, areas)` | First area whose bounding box holds the point and whose polygon contains it (holes respected, via `pointInPolygon`). Generic in the area type, so it returns the caller's own type — that is how `getLandmass` reads `landmass` off the result. |
| `isPointInAreas(point, areas)` | `findContaining(...) !== undefined`. |
| `isNearLineGeometry(point, geometry, threshold)` | Any part of the line within `threshold`. |
| `isNearLine(point, line, threshold)` | Any segment of one part within `threshold`. |
| `isNearAnyPoint(point, points, threshold)` | Used for the gate test against a barrier's crossings. |
| `pointToSegmentDistance(p, a, b)` | Distance to the **segment**, clamping the projection to `[0, 1]`, with the degenerate `a == b` case handled. Distance to the segment rather than to its vertices matters wherever a polyline is sampled sparsely: a segment can pass straight through a place while its nearest vertex sits tens of kilometres away — which is how a 24 km-away vertex once passed a 25 km threshold check. |

All of these are pure and allocation-light; `findContaining` is a linear scan, which is fine at the
current data volumes (600 land polygons, tens of terrain polygons per layer) but is the first thing to
index if the layers grow.
