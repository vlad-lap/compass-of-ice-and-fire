# `scripts/build-mountain-ridges.mjs`

Turns each mountain range's ridge line (`qgis/got_mountains.geojson`, one `MultiLineString`
feature per range, with a `size` property) into a pair of shaded "ribbon" polygons — one lit,
one dark — that follow the ridge like a hachure. Called from `build-geodata.mjs`, which passes
in the already-loaded `mountains`, `continents`, and `islands` collections.

Two exports:

- `buildMountainRidges(mountains, continents, islands)` → `got_mountain_ridges.geojson`. Two
  features per mountain range: `shade: 'light'` and `shade: 'dark'`.
- `buildMountainUnion(mountainRidges)` → `got_mountain.geojson`. Takes the output of the above
  and merges light+dark back into one silhouette polygon per range (grouped by `properties.id`).

## How a ribbon is built

For each line segment (a `LineString` inside the range's `MultiLineString`):

1. **Width from size** (`getNormalLength`) — ribbon half-width is `BASE_NORMAL_LENGTH /
   sqrt(size)`. `size` is the range's height, not its footprint, so this reads as slope: lower
   mountains get proportionally wider (gentler-looking) ribbons, taller ones get narrower
   (steeper-looking) ribbons. `size` missing/null defaults to 1.
2. **Which side is "light"** (`getLightSign`) — decided once per line, from a fixed global
   `LIGHT_DIRECTION` (upper-left), not from the arbitrary direction the line happens to be
   digitized in. This keeps illumination consistent across every ridge on the map regardless of
   how each one was drawn.
3. **Per-point normals** — `getTangent` averages the direction to/from each point's neighbours;
   `perpendicular` rotates that 90°, `getLightSign` picks which rotation is "light".
4. **Taper at the ends** (`getTaperFactors`) — the offset distance ramps from 0 at both
   endpoints up to full width over `taperLength` (`normalLength * TAPER_LENGTH_RATIO`), so a
   ribbon comes to a point at a dangling end instead of stopping with a blunt flat cut.
5. **Offsetting + de-folding** (`buildRidgeSide`) — each point is pushed out along its normal by
   `length * taperFactor`. At a sharp concave bend the offset points from two consecutive
   vertices can cross each other, folding the ribbon boundary over itself.
   `segmentIntersection`/`trimFoldedOffsets` catch that: if the "spoke" from point `i` to its
   offset point crosses the spoke from point `i+1`, both offset points are replaced with the
   crossing point. This is a cheap, local fix — no general buffering/mitre-join math — and it's
   what keeps the rings simple (non-self-intersecting) without any global repair pass.
6. **Clip to land** (`findContainingLandmass` + `clipPolygonToLandmass`) — each segment's ribbon
   is clipped to whichever continent/island contains that line, so ribbons don't spill into the
   sea.
7. **Merge the segments** (`unionAll`) — all of a range's per-segment ribbon pieces (for one
   shade) are unioned into a single `MultiPolygon` feature.
8. **Keep light and dark from overlapping** (`subtractOverlap`) — even after de-folding, light
   and dark can still touch/slightly overlap right at the ridge line; the dark ribbon has the
   light ribbon subtracted from it so the two shades never paint over each other.

## Why `roundMultiPolygon` and the double `union` in `unionAll`

Both exist purely to work around `polygon-clipping` library robustness issues, not because the
input geometry is wrong:

- `roundMultiPolygon` snaps every coordinate to a fixed precision (1e9) between operations, to
  avoid floating-point noise causing the library to produce degenerate output.
- `unionAll` runs `union` twice — once to actually merge the pieces, once more on the merged
  result — because a single `union` call can occasionally leave a self-touching ring (a
  `polygon-clipping` quirk, unrelated to whether the inputs were valid). This was verified
  empirically: removing the second `union` call reintroduces self-intersecting rings in
  `got_mountain.geojson` even with `trimFoldedOffsets` in place. Don't remove it without
  re-checking.

## Intentional design choices — don't "fix" these

- **Junctions are not special-cased.** If three line segments of the same range share an
  endpoint (a fork), each one tapers to a point at that shared coordinate independently. The
  result is three separate spikes touching at one point, not one wide merged joint. This was a
  deliberate choice ("more natural mountain structure") after trying the opposite (detecting
  shared endpoints and keeping them full-width) — don't reintroduce junction detection.
- **No global heal/repair pass.** An earlier version used a tiny dilate-then-erode
  (`buffer(eps)` then `buffer(-eps)`) to clean up touching-point artifacts. It was removed
  because it also merged separate ridges that only touched at a point, which fights the
  "junctions stay separate" choice above. `trimFoldedOffsets` replaced the need for it for real
  self-intersections; touching-at-a-point pieces are left as-is (they're valid, just not
  merged).

## Dead end: migrating to JSTS

This module was fully rewritten once to use `jsts` (the JS port of the Java Topology Suite),
replacing the hand-rolled vector math with `BufferOp`'s single-sided polygon buffering. In
isolation it handled joins and sharp bends well (via `JOIN_MITRE`), but the JSTS version
shipped here only has the legacy (pre-`OverlayNG`) boolean overlay engine, and it kept throwing
`TopologyException: found non-noded intersection` on real map data — especially once dangling
ends were sharpened to a point, since that creates lots of near-coincident vertices between
touching pieces. Working around it required an escalating pile of fixes (fixed `PrecisionModel`
grids, zero-distance `buffer` repairs, splitting geometries apart before every clip so only one
simple polygon was ever handed to the overlay engine at a time) and still weren't fully robust.
The whole `jsts` approach was reverted in favor of this file's hand-rolled `polygon-clipping`
implementation, which is simpler and has proven more robust for this dataset. Don't re-attempt
the JSTS route without a strong reason — if a similar problem comes up again, `trimFoldedOffsets`
(cheap, local, no library involved) is the kind of fix that actually worked.