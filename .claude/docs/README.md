# Routing internals

Reference documentation for the four modules that compute travel routes on the map:

| Module | Document | Role |
|--------|----------|------|
| `src/app/utils/raster.ts` | [raster.md](raster.md) | Turns geodata into a queryable index and into numeric grids of terrain coefficients, on land and at sea |
| `src/app/utils/routing.ts` | [routing.md](routing.md) | The planners: grid search, road/grid variant selection, the sea route, the combined route, post-processing, cost accounting |
| `src/app/utils/road-network.ts` | [road-network.md](road-network.md) | Shortest paths over the pre-built road graph |
| `src/app/utils/min-heap.ts` | [min-heap.md](min-heap.md) | The two priority queues both searches run on |

These four files carry no comments: everything that was explained inline lives here instead. When
you change the code, change the matching section here — the reasoning, the measured numbers and the
rejected alternatives are the part that cannot be recovered from reading the code again.

The rules these modules implement — road priority and its guard, barriers and their crossings, map
bounds, landmasses, and for a ship what counts as water, how far off the coast it sails and where it
may start — are stated as requirements in two specifications, both kept outside the repository. Where a rule is quoted here, the quote is the authority available to you; the numbering
("rule 1", "rule 3") is the specification's.

The executable half of that specification is `scripts/routing/check-routing.mjs` (`npm run
check-routing`). Every invariant named in these documents is enforced there against real geodata,
alongside the spec requirements and a snapshot baseline in `scripts/routing/baseline.json`. It runs in
CI and fails the build.

## Vocabulary

**Coordinate units.** All geometry is in map coordinate units (the geodata's own `[lng, lat]`-shaped
space, not real degrees). `KM_PER_COORD_UNIT = 85.371` converts one unit to kilometres. Every distance
inside these modules — grid cell size, thresholds, path lengths, road edge lengths — is in coordinate
units, and kilometres appear only in the final `RouteResult`.

**Terrain coefficient `k`.** A speed multiplier in `(0, 1]`: `1` is open ground, `0.9` forest,
`0.7` desert, `0.3` swamp, `0.5 / 0.35 / 0.2` mountains by height. `0` is not a coefficient but the
sentinel `IMPASSABLE`. At sea it is `1` everywhere but the Smoking Sea, which is `0.1` — plus a steep
penalty within 10 km of a coast, which exists to shape the route rather than to price it, and is kept
out of the reported cost (see `rasterizeSeaGrid`).

**Cost.** Generalised travel time, expressed as *the distance an unobstructed traveller would cover in
the same time*: a stretch of length `d` over terrain `k` costs `d / k`. Cost is therefore in coordinate
units, is directly comparable with straight-line distance, and can never be **below** the geometric
length of the line it prices — that ceiling (`k ≤ 1`) is what makes several optimisations sound and is
enforced as an invariant (`checkEffectiveSpeed`).

**Time.** `timeHours = cost × KM_PER_COORD_UNIT / speedKmH`, with `SpeedKmH.foot = 4`,
`horse = 8`, `ship = 10`, `dragon = 100`. Foot and horse share one ground route and one cost and differ
only by the divisor; the ship has a route of its own. A **combined** route has no single speed - it is
walked and sailed - so its time is the sum of its legs', each priced at the speed of its own kind.

**Leg.** One contiguous stretch of a route with a single mode: `kind: 'road' | 'grid' | 'sea'`, with a
distance and a time of its own. The legs of a finished route **partition** it — concatenating their
paths in order reproduces the drawn path point for point, and their distances and times sum to the
route's (`checkLegPartition`) — so anything that styles, prices or diagnoses a leg is working with the
same line the user sees. Every route carries its own legs, since a plan may hold five different ones.

## How one request flows

```
RoutingGeodata ──buildRoutingIndex──► RoutingIndex            (once, at worker init, ~90 ms)
                                          │
from, to ─────────────────────────────────┼──► planRoutesWithIndex
                                          │        │
                                          │        ├─ planGroundRoute
                                          │        │     ├─ isOnOneLandmass ..... exact reject, 0 ms
                                          │        │     ├─ findNetworkAnchor ... which road, how far
                                          │        │     ├─ plan{Same,Cross}GroupRoute
                                          │        │     │     ├─ findCostedCandidates ── rasterizeGrid + computeGridCosts
                                          │        │     │     └─ pickCheapestVariant ── findNetworkPath + buildGridRoute
                                          │        │     ├─ getRoadTimeTolerance  road vs open ground
                                          │        │     └─ anchorRoute ......... tie to real endpoints, charge stubs
                                          │        ├─ planSeaRoute
                                          │        │     ├─ isSeaEndpoint ....... port or water, else 0 ms
                                          │        │     ├─ getSeaRaster ........ whole map, once, ~180 ms
                                          │        │     ├─ placeSeaPoint ....... snap to water, stub must be navigable
                                          │        │     ├─ findPath + pullTautPath
                                          │        │     └─ anchorRoute
                                          │        └─ planCombinedRoutes ....... A → port → port → B
                                          │              ├─ findEmbarkations .... which ports, priced by one Dijkstra
                                          │              │     └─ markPreferred .. rule 5: type wins inside the band
                                          │              ├─ pickCombinedRoute ... per traveller, on coarse sea estimates
                                          │              └─ buildCombinedRoute .. the winner, for real
                                          ▼
                    RoutePlan { foot, horse, footShip, horseShip, ship, dragon }
```

`buildGridRoute` is the inner workhorse of a ground route and always runs the same four steps:
rasterise a grid → A* over it → simplify and pull the path taut → re-measure its cost along the drawn
line. The sea route runs the same steps against a raster it does not have to build, and skips the
simplify.

## Design decisions that shape all four modules

**The raster is the single source of truth for passability during search.** `rasterizeGrid` is
required to be bit-for-bit identical to calling `classifyCell` on every cell center; that equivalence
is what makes it safe to invert the loop (paint features into the grid instead of testing every cell
against every feature) and is asserted cell by cell by `checkRasterFaithfulness`. Classification used
to be 78 % of a request's time; it no longer appears in the profile.

**Anything the raster cannot represent is decided on the geometry instead.** A cell coarser than a
strait bridges it, so resolution-dependent answers are wrong answers for questions like "is this
island reachable". Those questions are answered from the polygons (`indexLandmasses`,
`isOnOneLandmass`), before any grid exists. The same reasoning puts the sea route's clearance rule on
the geometry (`keepsSeaClearance`, exact against the coastline) rather than on samples of a chord.

**A choice is ranked on an estimate, verified where the estimate is biased, and only then built.**
Pricing every candidate properly is what makes a search unaffordable: a real crossing costs 250 ms
against 20 ms for one on a grid nine times coarser, and a real walk 50-400 ms against one shared
Dijkstra for all of them. So candidates are ranked on cheap estimates - and then the few that could win
have the *biased* half of the estimate redone for real. The bias is known and one-sided: grid prices
have no roads on them, so anything reached by road looks worse than it is. The crossing needs no such
correction, being the same grid and the same model for every pair, so it stays an estimate until the
winner is drawn.

**Where a rule cannot be expressed as a wall, it is expressed as a price.** A ship must keep 10 km off
land *and* be able to thread a strait half that wide and enter a harbour on the shore. Blocking the
coastal band satisfies the first and makes the other two impossible, so the band is priced at ~10⁴
instead — dear enough that no detour on the map is dearer, which makes "only where there is no
alternative" a consequence of the cost function rather than a special case in the planner.

**Cost is measured on the line that gets drawn.** A* minimises the cost of its own staircase of cell
centers, because that is what it can search, but the number reported to the user is re-measured along
the simplified, taut polyline (`measurePathCost`), including the stubs at the ends and the joints
between legs (`anchorRoute`). Otherwise distance and time describe different geometry.

**Typed arrays, one allocation per search.** `Float64Array` for costs, `Int32Array` for parents and
labels, `Uint8Array` for flags, and a heap over parallel typed arrays. `Float64Array` specifically, not
`Float32Array`: the narrower type perturbs A* tie-breaking (`0.7` becomes `0.699999988`) and silently
changes which of two equal-cost paths is drawn.

## Measured behaviour

Current numbers, from the harness over 27 route cases against real geodata (17 ground, 7 sea,
3 combined), each planned for every mode:

- total ~18 s for 27 cases, worst case ~1.7 s; every request plans a ground route, a sea route and two
  combined ones - unless a straight-line bound shows a combined route cannot beat the ground one, which
  settles five of the 27 for nothing
- of that, a combined route is 300-600 ms: three or four real routes plus up to nine coarse sea
  estimates. It was 4.3 s per request before the estimates and the shared pricing pass
- a sea route alone is 0-250 ms, worst case `King's Landing → Lannisport` at 5 164 km around Dorne
- `buildRoutingIndex` ~90 ms, most of it `indexLandmasses` and `indexCoastline`; once per worker
- `getSeaRaster` ~180 ms for the fine grid and ~30 ms for the coarse one, once each per worker
- before the ground refactor these 17 cases took 15 301 ms total with a 6 486 ms worst case
