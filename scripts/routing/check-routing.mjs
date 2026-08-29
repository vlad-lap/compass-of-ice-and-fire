import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { getConsolePrefix } from '../console-utils.mjs';

/**
 * Fails on a broken spec requirement and on any route whose result drifted from
 * scripts/routing/baseline.json. An intended change means running
 * `npm run check-routing -- --update` and committing the new baseline.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const GEODATA = join(ROOT, 'geodata');
const BASELINE = join(HERE, 'baseline.json');
const KM_PER_COORD_UNIT = 85.371;

const GEODATA_FILES = {
    continents: 'got_continents.geojson',
    islands: 'got_islands.geojson',
    rivers: 'got_rivers.geojson',
    theWall: 'got_wall.geojson',
    forests: 'got_landscape_forest.geojson',
    deserts: 'got_landscape_desert.geojson',
    swamps: 'got_landscape_swamp.geojson',
    mountains: 'got_mountain.geojson',
    lakes: 'got_lakes.geojson',
    seas: 'got_water_sea.geojson',
    bays: 'got_water_bay.geojson',
    straits: 'got_water_strait.geojson',
    locations: 'got_locations.geojson',
};

const CASES = [
    { from: 'Old Ghis', to: 'Morosh', note: 'spec example 1' },
    { from: "King's Landing", to: 'The Eyrie', note: 'spec example 2' },
    { from: 'Qohor', to: 'Old Ghis', note: 'spec example 3' },
    { from: 'Mantarys', to: 'Old Ghis', note: 'spec example 4' },
    { from: 'Pentos', to: 'Vaes Dothrak', note: 'spec example 5' },
    { from: 'Selhorys', to: 'Volon Therys', note: 'spec rivers 1' },
    { from: 'Pennytree', to: 'Stone Hedge', note: 'spec rivers 2' },
    { from: 'Saath', to: 'Morosh', note: 'detour guard, x15.9' },
    { from: 'The Sorrows (Chroyane)', to: 'Volon Therys', note: 'rule 4 gate hole, x15.8' },
    { from: 'Maidenpool', to: 'Saltpans', note: 'road kept at x2.6 over open ground' },
    { from: 'Sarhoy', to: 'Volon Therys', note: 'road variant only reachable via a bridge crossing' },
    { from: 'Saath', to: 'Vaes Graddakh (Sarys)', note: 'both on the road, but the road winds x8.8' },
    { from: "King's Landing", to: 'Winterfell', note: 'long-distance control' },
    { from: "King's Landing", to: 'Pentos', note: 'across the Narrow Sea, must be unreachable' },
    { from: 'Winterfell', to: 'Craster\'s Keep', note: 'beyond the Wall, must pass a gate' },
    { from: 'Castle Black', to: 'Dragonstone', note: 'an island, unreachable however coarse the grid gets' },
    { from: 'King\'s Landing', to: 'Pyke', note: 'an island a short hop off the shore, still unreachable' },
];

// A patch of open water in the Narrow Sea, so that a case can begin where a ship already is. It is not
// a location and must not be treated as one - `casePoints` below carries it, `locations` does not, or
// every check that asks whether a location is passable would report the sea as broken.
const OPEN_WATER = 'Open water in the Narrow Sea';
const OPEN_WATER_POINT = [26, 8];

// Sea cases are kept apart from the ground ones so that the raster-faithfulness sweep, which costs a
// second per case, keeps its original scope. Every case in both lists is planned in full, so the sea
// invariants see the ground cases too - King's Landing -> Pentos is a sea route as much as it is a
// missing ground one.
const SEA_CASES = [
    { from: 'Lordsport', to: 'Lannisport', note: 'sea: island port to the mainland across Ironman\'s Bay' },
    { from: "King's Landing", to: 'Lannisport', note: 'sea: around Dorne, a detour no from-to box would hold' },
    { from: 'Meereen', to: 'Volantis', note: 'sea: past Valyria, where the Smoking Sea costs x10' },
    { from: 'Oldtown', to: 'Sunspear', note: 'sea: along a coast the whole way' },
    { from: 'Eastwatch-by-the-Sea', to: 'Oldtown', note: 'sea: around all of Westeros' },
    { from: 'Braavos', to: 'Pentos', note: 'sea: two ports a short hop apart' },
    { from: 'Winterfell', to: 'Oldtown', note: 'sea: Winterfell is no port, so there is no sea route' },
];

// Combined cases exist for the port choice, which is the part of a combined route that is a judgement
// rather than a search. The first two are the pair that fixed the rule: the same traveller, two ports
// of different type, and the answer turning on how much longer the walk to the better one is.
const COMBINED_CASES = [
    { from: 'Ramsgate', to: 'Braavos', note: 'combined: castle and city both close, the city wins' },
    { from: 'Castle Black', to: 'Braavos', note: 'combined: the castle is far closer, so it wins' },
    { from: "King's Landing", to: 'Quiet Isle', note: 'combined: an island with no port, entered anywhere' },
    { from: OPEN_WATER, to: 'Winterfell', note: 'combined: from a ship already at sea to an inland castle' },
];

async function bundle(entry, name) {
    const outfile = join(mkdtempSync(join(tmpdir(), 'routing-check-')), name);

    await build({
        entryPoints: [join(ROOT, ...entry)],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        logLevel: 'warning',
    });

    return outfile;
}

async function loadRouting() {
    const outfile = join(mkdtempSync(join(tmpdir(), 'routing-check-')), 'routing.mjs');

    await build({
        stdin: {
            contents: [
                "export * from './src/app/utils/grid';",
                "export * from './src/app/utils/raster';",
                "export * from './src/app/utils/routing';",
            ].join('\n'),
            resolveDir: ROOT,
            loader: 'ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        logLevel: 'warning',
    });

    return import(pathToFileURL(outfile).href);
}

// rasterizeGrid has to be bit-for-bit what calling classifyCell on every cell center would give -
// that equivalence is the only thing that makes inverting the loop safe. Checked against real
// geodata over every cell of several grids; the budgets are small because classifyCell costs
// roughly 32 us per cell.
function checkRasterFaithfulness(routing, index, locations) {
    const budgets = [4_000, 20_000];
    let cells = 0;
    const mismatches = [];

    for (const testCase of CASES) {
        for (const cellBudget of budgets) {
            const grid = routing.buildGrid(locations.get(testCase.from), locations.get(testCase.to), cellBudget);
            const raster = routing.rasterizeGrid(grid, index);

            for (let row = 0; row < grid.rows; row++) {
                for (let col = 0; col < grid.cols; col++) {
                    const center = routing.getCellCenter(grid, col, row);
                    const expected = routing.classifyCell(center, index, grid.cellSize);
                    const actual = raster[routing.toFlatIndex(grid, col, row)];
                    cells++;

                    if ((expected ?? 0) !== actual && mismatches.length < 5) {
                        mismatches.push(
                            `${testCase.from}->${testCase.to} budget=${cellBudget} cell=${col},${row} ` +
                            `center=${center.map(v => v.toFixed(5))} classifyCell=${expected} raster=${actual}`,
                        );
                    }
                }
            }
        }
    }

    return { cells, mismatches };
}

// The same equivalence for the sea raster, on local grids rather than on the global one a route
// actually searches: classifySeaCell has to answer for every cell center, and the global sea grid is
// 1.2 million cells. The coastal grading makes this stricter than the ground check - it compares a
// distance-derived coefficient, not just a layer lookup, so the raster's band pass and the geometric
// distance query have to agree to the last bit.
function checkSeaRasterFaithfulness(routing, index, locations) {
    const budgets = [4_000, 20_000];
    let cells = 0;
    const mismatches = [];

    for (const testCase of SEA_CASES) {
        for (const cellBudget of budgets) {
            const grid = routing.buildGrid(locations.get(testCase.from), locations.get(testCase.to), cellBudget);
            const { k } = routing.rasterizeSeaGrid(grid, index);

            for (let row = 0; row < grid.rows; row++) {
                for (let col = 0; col < grid.cols; col++) {
                    const center = routing.getCellCenter(grid, col, row);
                    const expected = routing.classifySeaCell(center, index, grid.cellSize);
                    const actual = k[routing.toFlatIndex(grid, col, row)];
                    cells++;

                    if ((expected ?? 0) !== actual && mismatches.length < 5) {
                        mismatches.push(
                            `${testCase.from}->${testCase.to} budget=${cellBudget} cell=${col},${row} ` +
                            `center=${center.map(v => v.toFixed(5))} classifySeaCell=${expected} raster=${actual}`,
                        );
                    }
                }
            }
        }
    }

    return { cells, mismatches };
}

// Terrain coefficients are at most 1, so a route can never average more than the base speed. Any
// excess means the reported distance and time describe different geometry - which they did: cost was
// accumulated along the staircase of cell centers while distance was measured on the drawn line, and
// the stubs and leg joints of the drawn line carried no cost at all.
const BASE_SPEED_KMH = { foot: 4, ship: 10 };

function checkEffectiveSpeed(results) {
    // Straight off the plan rather than off the recorded fields: those are rounded to a tenth, and
    // the ratio of two rounded numbers overshoots by a hair on its own.
    return Object.entries(BASE_SPEED_KMH).flatMap(([mode, base]) => results
        .filter(result => result.plan[mode])
        .map(result => ({ name: result.name, mode, speed: result.plan[mode].distanceKm / result.plan[mode].timeHours }))
        .filter(({ speed }) => speed > base + 1e-6)
        .map(({ name, mode, speed }) => `${name}: ${mode} at ${speed.toFixed(4)} km/h over a base of ${base}`));
}

// A settlement you cannot even stand on is always a data or model error, whatever else is true of
// the route to it. This invariant would have caught both: islands painted over by sea polygons (43
// locations), and towns on a confluence declared a crossing for only one of their rivers (4 more).
function checkLocationsPassable(routing, index, locations, cellSize) {
    return [...locations].filter(([, point]) => routing.classifyCell(point, index, cellSize) === null)
        .map(([name]) => name);
}

// Every step of a grid leg has to stand on land, tested against the polygons rather than against any
// raster: a cell coarser than a strait bridges it, so the grid that built a route cannot be the judge
// of whether it walked on water. That is how Castle Black reached Dragonstone - the widest fallback
// grid is 40 km per cell, and Blackwater Bay simply vanished. Sampling is fixed at a kilometre, well
// below anything the map draws.
//
// Grid legs only, and that is the whole of the exception: a road leg is authored geometry travelled at
// k = 1, with no layer consulted along it, so where the map draws a road over water the route follows
// it - Meereen -> Volantis is entirely road and crosses a lake. Checking road legs here would be
// checking the geodata, not the planner.
const LAND_SAMPLE_KM = 1;

function checkPathOnLand(routing, index, results) {
    const offenders = [];

    for (const result of results.filter(({ found }) => found)) {
        for (const leg of result.plan.foot.legs.filter(({ kind }) => kind === 'grid')) {
            const { hits: onWater, firstOffender } = samplePath(leg.path, LAND_SAMPLE_KM, point =>
                !routing.isPointInAreas(point, index.land) || routing.isPointInAreas(point, index.lakes));

            if (onWater) {
                offenders.push(`${result.name}: ${onWater} sampled points on water, `
                    + `e.g. ${firstOffender.map(v => v.toFixed(3))}`);
            }
        }
    }

    return offenders;
}

// Water polygons are drawn over the islands rather than around them, so "inside a sea" is not the
// same as "navigable": a ship route has to be inside painted water and off every landmass at once.
// Tested against the polygons for the same reason the ground check is - the grid that built the route
// cannot be the judge of whether it sailed over an island.
//
// The first and last segment are exempt, and only those: a port stands on land, so the stub joining
// it to the first cell of open water is the "port entrance" rule 3 excludes. checkSeaStubs is what
// keeps that exemption from being a hole.
function checkPathOnWater(routing, index, results) {
    const offenders = [];

    for (const { name, path } of results.flatMap(getSeaSpans)) {
        const { hits, firstOffender } = samplePath(dropStubs(path), LAND_SAMPLE_KM, point =>
            !routing.isPointInAreas(point, index.water) || routing.isPointInAreas(point, index.land));

        if (hits) {
            offenders.push(`${name}: ${hits} sampled points off navigable water, `
                + `e.g. ${firstOffender.map(v => v.toFixed(3))}`);
        }
    }

    return offenders;
}

// The stub from a port to the water is exempt from both the water rule and the clearance rule, so its
// length is the size of that exemption. It may only bridge the gap to the nearest navigable cell -
// a few cells - and never stand in for a stretch of routing across a bay.
const MAX_STUB_CELLS = 4;

function checkSeaStubs(routing, results) {
    const limitKm = MAX_STUB_CELLS * routing.SEA_CELL_SIZE * KM_PER_COORD_UNIT;
    const offenders = [];
    let longest = 0;

    for (const { name, path } of results.flatMap(getSeaSpans)) {
        for (const stub of [path.slice(0, 2), path.slice(-2)]) {
            const km = distanceKm(stub[0], stub[1]);
            longest = Math.max(longest, km);
            if (km > limitKm) {
                offenders.push(`${name}: a port entrance is ${km.toFixed(1)} km, `
                    + `over the ${limitKm.toFixed(1)} km one may cover`);
            }
        }
    }

    return { offenders, longest };
}

function dropStubs(path) {
    return path.length > 3 ? path.slice(1, -1) : path;
}

// Every stretch of water a plan sails, wherever it comes from: the ship route is one sea leg, and a
// combined route carries one in the middle. Both ends of the span have to be the ports, because that
// is where the entrances these checks exempt are drawn - and one of them may be missing from the leg's
// own path. anchorRoute appends points in order and drops a duplicate of the one before, so when a walk
// precedes the sea leg the port is left in the walk and dropped here; the port at the far end stays,
// and it is the following walk that loses it.
function getSeaSpans(result) {
    return Object.entries(result.plan)
        .filter(([, route]) => route?.legs?.length)
        .flatMap(([mode, route]) => route.legs
            .map((leg, at) => ({ leg, before: route.legs[at - 1] }))
            .filter(({ leg }) => leg.kind === 'sea')
            .map(({ leg, before }) => ({
                name: `${result.name} (${mode})`,
                path: before?.path.length ? [before.path[before.path.length - 1], ...leg.path] : leg.path,
            })));
}

// Rules 9 and 10 as one statement: a ship is as far from land as the water it is crossing allows,
// which is 10 km wherever there is room for 10 km, and the middle of the passage wherever there is
// not. Read that way the two rules need no separate cases and no guessed-at radius around a port.
//
// "As far as the water allows" is measured, not assumed: from a point on the route, step sideways -
// across the route, both ways - for as long as the water stays navigable, and take the best clearance
// found on that cross-section. Across the route and not outward along the clearance gradient: the
// gradient points at the open sea, so at the mouth of a bay it reports the 17 km waiting outside a
// 10 km passage and calls a route threading the middle of that passage a violation.
//
// The allowance is half a cell diagonal, because the route is a chain of cell centers: it cannot sit on
// the exact middle of a passage, only within half a cell of it. Open water is judged against the 10 km
// rule with no allowance at all - the search keeps a full half-diagonal in hand there, which is what
// getSeaClearanceThreshold is for.
//
// Leaving and entering a port is the one stretch the rule excuses, and no cross-section can excuse it:
// a ship on its way out of a sound is inshore because it has not got out yet, not because it chose to
// be. The approach is read off the route - everything before the first vertex in open water, and
// everything after the last - and bounded in length, or "still on the way out" would excuse sailing
// down an entire coast.
//
// Judged at the vertices, which is where the route makes its decisions: a vertex is a cell center, and
// its clearance is exactly what the search charged for. Between two vertices the drawn line cuts the
// corner and dips a little below both - pullTautPath holds every chord it draws to the clearance of its
// own endpoints, so the dip is bounded by what one cell-to-cell step can lose, and checkSeaSag measures
// it rather than assuming it.
const CROSS_SECTION_STEP_KM = 0.5;
const CROSS_SECTION_REACH_KM = 40;
const MAX_APPROACH_KM = 150;

function checkSeaClearance(routing, index, results) {
    const allowanceKm = routing.SEA_CELL_SIZE * routing.SEA_MARGIN_FACTOR * KM_PER_COORD_UNIT;
    const offenders = [];
    let worst = null;
    let longestApproachKm = 0;

    for (const { name, path } of results.flatMap(getSeaSpans)) {
        const vertices = dropStubs(path);
        const clearances = vertices.map(point => clearanceKm(routing, index, point));
        const open = clearances.map(clearance => clearance >= routing.SEA_CLEARANCE_KM);
        const first = open.indexOf(true);
        const last = open.lastIndexOf(true);

        const approaches = first === -1
            ? [vertices]
            : [vertices.slice(0, first + 1), vertices.slice(last)];
        for (const approach of approaches) {
            const km = getPathLengthKm(approach);
            longestApproachKm = Math.max(longestApproachKm, km);
            if (km > MAX_APPROACH_KM) {
                offenders.push(`${name}: ${km.toFixed(0)} km inshore before reaching open water, `
                    + `over the ${MAX_APPROACH_KM} km an approach may cover`);
            }
        }

        for (const [at, clearance] of clearances.entries()) {
            if (at <= first || at >= last || open[at]) {
                continue;
            }

            const best = bestClearanceAcrossKm(routing, index, vertices, at);
            if (!worst || clearance - best < worst.clearance - worst.best) {
                worst = { name, point: vertices[at], clearance, best };
            }
            if (clearance < best - allowanceKm) {
                offenders.push(`${name}: ${clearance.toFixed(1)} km off land at `
                    + `${vertices[at].map(v => v.toFixed(3))}, where ${best.toFixed(1)} km was available`);
            }
        }
    }

    return { offenders, worst, allowanceKm, longestApproachKm };
}

// How much the drawn line dips below what its own vertices were owed. pullTautPath holds every chord it
// draws to the clearance of its endpoints, capped at the 10 km the rule asks for - a chord between two
// vertices 19 km out may pass 10 km from land, and that is not a defect. Only the step between two
// adjacent cells is taken on trust, so anything more than that step can lose means the guarantee has
// broken, whatever the clearance at the vertices says. What a step can lose is half a cell diagonal:
// every point on it is within half the step of one of its two ends.
function getMaxSagKm(routing) {
    return routing.SEA_CELL_SIZE * routing.SEA_MARGIN_FACTOR * KM_PER_COORD_UNIT;
}

function checkSeaSag(routing, index, results) {
    const maxSagKm = getMaxSagKm(routing);
    const offenders = [];
    let worst = 0;

    for (const { name, path } of results.flatMap(getSeaSpans)) {
        const vertices = dropStubs(path);

        for (let i = 0; i < vertices.length - 1; i++) {
            const owed = Math.min(
                routing.SEA_CLEARANCE_KM,
                clearanceKm(routing, index, vertices[i]),
                clearanceKm(routing, index, vertices[i + 1]),
            );
            const steps = Math.max(1, Math.ceil(distanceKm(vertices[i], vertices[i + 1]) / LAND_SAMPLE_KM));
            let along = Infinity;

            for (let step = 0; step <= steps; step++) {
                const t = step / steps;
                along = Math.min(along, clearanceKm(routing, index, [
                    vertices[i][0] + (vertices[i + 1][0] - vertices[i][0]) * t,
                    vertices[i][1] + (vertices[i + 1][1] - vertices[i][1]) * t,
                ]));
            }

            const sag = owed - along;
            worst = Math.max(worst, sag);
            if (sag > maxSagKm) {
                offenders.push(`${name}: the line from ${vertices[i].map(v => v.toFixed(3))} `
                    + `comes ${along.toFixed(1)} km from land, ${sag.toFixed(1)} km inside the `
                    + `${owed.toFixed(1)} km its ends were owed`);
            }
        }
    }

    return { offenders, worst };
}

function getPathLengthKm(path) {
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) {
        km += distanceKm(path[i], path[i + 1]);
    }
    return km;
}

function clearanceKm(routing, index, point) {
    return routing.getDistanceToLand(point, index, CROSS_SECTION_REACH_KM / KM_PER_COORD_UNIT) * KM_PER_COORD_UNIT;
}

function bestClearanceAcrossKm(routing, index, vertices, at) {
    const ahead = vertices[Math.min(at + 1, vertices.length - 1)];
    const behind = vertices[Math.max(at - 1, 0)];
    const along = [ahead[0] - behind[0], ahead[1] - behind[1]];
    const length = Math.hypot(along[0], along[1]);
    if (!length) {
        return clearanceKm(routing, index, vertices[at]);
    }

    const across = [-along[1] / length, along[0] / length];
    let best = clearanceKm(routing, index, vertices[at]);

    for (const side of [1, -1]) {
        for (let km = CROSS_SECTION_STEP_KM; km <= CROSS_SECTION_REACH_KM; km += CROSS_SECTION_STEP_KM) {
            const probe = [
                vertices[at][0] + side * across[0] * km / KM_PER_COORD_UNIT,
                vertices[at][1] + side * across[1] * km / KM_PER_COORD_UNIT,
            ];
            if (!routing.isNavigable(probe, index)) {
                break;
            }
            best = Math.max(best, clearanceKm(routing, index, probe));
        }
    }

    return best;
}

// Rules 3 and 6: a combined route boards and lands at a port of the landmass it is leaving or reaching,
// and may name no port only where that landmass has none - in which case it enters wherever it likes.
function checkCombinedPorts(routing, index, locations, results) {
    const offenders = [];
    const portsById = new Map(index.ports.map(port => [port.id, port]));

    for (const result of results) {
        for (const mode of ['footShip', 'horseShip']) {
            const route = result.plan[mode];
            if (!route) {
                continue;
            }

            const ends = [
                { id: route.ports.fromId, point: locations.get(result.name.split(' -> ')[0]) },
                { id: route.ports.toId, point: locations.get(result.name.split(' -> ')[1]) },
            ];

            for (const { id, point } of ends) {
                const landmass = routing.getLandmass(point, index.land);
                const onLandmass = index.ports.filter(port => port.landmass === landmass);

                if (id === null && onLandmass.length) {
                    offenders.push(`${result.name} (${mode}): enters open coast although the landmass `
                        + `has ${onLandmass.length} ports`);
                } else if (id !== null && portsById.get(id)?.landmass !== landmass) {
                    offenders.push(`${result.name} (${mode}): uses ${id}, which is not a port of the `
                        + 'landmass it has to leave or reach');
                }
            }
        }
    }

    return offenders;
}

// Rule 1: a sea route may only start and end in water or at a port. Nothing else about the plan can
// reveal a break here - a route from the middle of a continent would simply look like a route.
function checkSeaEndpoints(routing, index, locations, results) {
    return results
        .filter(({ shipFound }) => shipFound)
        .flatMap(result => result.name.split(' -> ')
            .filter(name => !routing.isSeaEndpoint(locations.get(name), index))
            .map(name => `${result.name}: ${name} is neither a port nor a point in water`));
}

function samplePath(path, stepKm, isOffender) {
    let hits = 0;
    let firstOffender = null;

    for (let i = 0; i < path.length - 1; i++) {
        const [from, to] = [path[i], path[i + 1]];
        const steps = Math.max(1, Math.ceil(distanceKm(from, to) / stepKm));

        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            const point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

            if (isOffender(point)) {
                hits++;
                firstOffender ??= point;
            }
        }
    }

    return { hits, firstOffender };
}

// A route may prefer a road over open ground, but only in proportion to how much of the route the
// road carries. Checked against the real alternative - the same route planned with no road network at
// all - rather than against the straight line. Routes that are entirely road are checked too: their
// share is 1, so they get the full tolerance, and every legitimate one beats open ground anyway.
const ROAD_TIME_TOLERANCE = 3;

function getRoadTimeTolerance(roadShare) {
    return 1 + (ROAD_TIME_TOLERANCE - 1) * roadShare;
}

function checkDetourGuard(routing, index, locations, results) {
    const offenders = [];

    for (const result of results) {
        if (!result.found || !result.structure.includes('road')) {
            continue;
        }

        const gridOnly = routing.planRoutesWithIndex(
            locations.get(result.name.split(' -> ')[0]),
            locations.get(result.name.split(' -> ')[1]),
            index,
            null,
        );
        if (!gridOnly.foot) {
            continue;
        }

        const total = result.legCosts.reduce((sum, cost) => sum + cost, 0);
        const roadCost = result.plan.foot.legs
            .filter(leg => leg.kind === 'road')
            .reduce((sum, leg) => sum + leg.cost, 0);
        const allowed = getRoadTimeTolerance(total === 0 ? 0 : roadCost / total);
        const ratio = result.timeHours / gridOnly.foot.timeHours;

        if (ratio > allowed + 1e-6) {
            offenders.push(
                `${result.name}: x${ratio.toFixed(2)} over open ground with only `
                + `${(100 * roadCost / total).toFixed(0)}% road, allowed x${allowed.toFixed(2)}`,
            );
        }
    }

    return offenders;
}

// A barrier - a size 2/3 river, or the Wall - may only be crossed where geodata/barrier-crossings.json
// says so. Wherever a finished route cuts across one, a crossing declared *for that barrier* has to be
// right there. Matching per barrier matters: at a confluence a bridge over one river used to be
// accepted as licence to hop the other one. The tolerance covers the gate radius the raster opens
// around a crossing, which grows with cell size.
const CROSSING_TOLERANCE = 0.06;
const BLOCKING_RIVER_SIZES = [2, 3];

// Nothing exists past the edge of the mapped world, so a route may never step outside it. Without
// this the terrain default made the void open ground and routes walked around the map.
const MAP_BOUNDS = { north: 48.7, south: -39.3, east: 127.4, west: -7.1 };

// The legs are meant to partition the route: concatenating their paths in order must reproduce the
// drawn path exactly. Without that, anything reading the breakdown - a per-leg style on the map, a
// diagnosis of which leg crossed a river - is quietly working with a different route than the one
// drawn.
function checkLegPartition(results) {
    const offenders = [];

    for (const result of results) {
        for (const [mode, route] of Object.entries(result.plan)) {
            if (!route || !route.legs?.length) {
                continue;
            }

            const joined = route.legs.flatMap(leg => leg.path);
            const path = route.path;

            if (joined.length !== path.length) {
                offenders.push(`${result.name} (${mode}): legs hold ${joined.length} points, `
                    + `the path has ${path.length}`);
                continue;
            }

            const mismatch = path.findIndex((position, index) =>
                position[0] !== joined[index][0] || position[1] !== joined[index][1]);
            if (mismatch !== -1) {
                offenders.push(`${result.name} (${mode}): point ${mismatch} differs, `
                    + `path ${path[mismatch]} vs legs ${joined[mismatch]}`);
            }

            const legTime = route.legs.reduce((sum, leg) => sum + leg.timeHours, 0);
            const legDistance = route.legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
            if (Math.abs(legTime - route.timeHours) > 1e-6 || Math.abs(legDistance - route.distanceKm) > 1e-6) {
                offenders.push(`${result.name} (${mode}): legs sum to ${legDistance.toFixed(1)} km / `
                    + `${legTime.toFixed(1)} h, the route reports ${route.distanceKm.toFixed(1)} km / `
                    + `${route.timeHours.toFixed(1)} h`);
            }
        }
    }

    return offenders;
}

function checkMapBounds(results) {
    const offenders = [];

    for (const result of results) {
        for (const mode of ['foot', 'ship']) {
            const outside = (result.plan[mode]?.path ?? []).filter(([lng, lat]) =>
                lng < MAP_BOUNDS.west || lng > MAP_BOUNDS.east || lat < MAP_BOUNDS.south || lat > MAP_BOUNDS.north);

            if (outside.length) {
                offenders.push(`${result.name}: ${mode} leaves the map at ${outside.length} points, `
                    + `e.g. ${outside[0].map(v => v.toFixed(2))}`);
            }
        }
    }

    return offenders;
}

function getSegmentIntersection(a, b, c, d) {
    const cross = (from, to, point) =>
        (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0]);
    const abc = cross(a, b, c);
    const abd = cross(a, b, d);
    const cda = cross(c, d, a);
    const cdb = cross(c, d, b);

    if (abc * abd >= 0 || cda * cdb >= 0) {
        return null;
    }

    const t = cda / (cda - cdb);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function checkBarrierCrossings(geodata, results) {
    const barriers = [
        ...geodata.rivers.features.filter(feature => BLOCKING_RIVER_SIZES.includes(feature.properties?.size)),
        ...geodata.theWall.features,
    ]
        .map(feature => {
            const parts = feature.geometry.type === 'LineString'
                ? [feature.geometry.coordinates]
                : feature.geometry.coordinates;
            const all = parts.flat();
            return {
                name: feature.properties?.name ?? feature.properties?.id ?? 'unnamed',
                parts,
                bbox: [
                    Math.min(...all.map(([lng]) => lng)),
                    Math.min(...all.map(([, lat]) => lat)),
                    Math.max(...all.map(([lng]) => lng)),
                    Math.max(...all.map(([, lat]) => lat)),
                ],
            };
        });

    const offenders = [];
    let crossingsFound = 0;

    for (const result of results) {
        if (!result.found) {
            continue;
        }

        const path = result.plan.foot.path;
        for (let i = 0; i < path.length - 1; i++) {
            const [a, b] = [path[i], path[i + 1]];
            const minLng = Math.min(a[0], b[0]);
            const maxLng = Math.max(a[0], b[0]);
            const minLat = Math.min(a[1], b[1]);
            const maxLat = Math.max(a[1], b[1]);

            for (const river of barriers) {
                if (minLng > river.bbox[2] || maxLng < river.bbox[0] || minLat > river.bbox[3] || maxLat < river.bbox[1]) {
                    continue;
                }

                for (const part of river.parts) {
                    for (let j = 0; j < part.length - 1; j++) {
                        const at = getSegmentIntersection(a, b, part[j], part[j + 1]);
                        if (!at) {
                            continue;
                        }

                        crossingsFound++;
                        const own = geodata.barrierCrossings.filter(({ barrier }) => barrier === river.name);
                        const nearest = own.length
                            ? Math.min(...own.map(({ point }) => Math.hypot(point[0] - at[0], point[1] - at[1])))
                            : Infinity;

                        if (nearest > CROSSING_TOLERANCE) {
                            const nearestAny = Math.min(...geodata.barrierCrossings.map(({ point }) =>
                                Math.hypot(point[0] - at[0], point[1] - at[1])));
                            offenders.push(
                                `${result.name}: crosses ${river.name} at ${at.map(v => v.toFixed(3))}, `
                                + `nearest crossing declared for it is ${nearest === Infinity ? 'none' : (nearest * KM_PER_COORD_UNIT).toFixed(1) + ' km'} away`
                                + ` (nearest of any barrier: ${(nearestAny * KM_PER_COORD_UNIT).toFixed(1)} km)`,
                            );
                        }
                    }
                }
            }
        }
    }

    return { offenders, crossingsFound };
}

// The worker protocol (one init, then a plan per request) is no longer type-checked end to end:
// the service and the worker talk over postMessage. Driving it against stubs keeps a break from
// being silent - routes would simply stop being computed.
async function checkWorkerProtocol(geodata, roadNetwork, from, to) {
    const outfile = await bundle(['src', 'app', 'services', 'route.worker.ts'], 'route.worker.mjs');
    const handlers = [];
    const responses = [];

    globalThis.addEventListener = (type, handler) => handlers.push(handler);
    globalThis.postMessage = message => responses.push(message);

    await import(pathToFileURL(outfile).href);

    if (handlers.length !== 1) {
        return { ok: false, reason: `worker registered ${handlers.length} message handlers instead of 1` };
    }

    handlers[0]({ data: { type: 'plan', requestId: 1, from, to } });
    if (responses.length !== 0) {
        return { ok: false, reason: 'worker answered plan before init' };
    }

    handlers[0]({ data: { type: 'init', geodata, roadNetwork } });
    handlers[0]({ data: { type: 'plan', requestId: 2, from, to } });

    const [response] = responses;
    if (!response) {
        return { ok: false, reason: 'worker did not answer plan after init' };
    }
    if (response.requestId !== 2) {
        return { ok: false, reason: `requestId ${response.requestId} instead of 2` };
    }
    if (!response.plan?.foot || !response.plan.foot.legs?.length) {
        return { ok: false, reason: 'response has no foot/legs' };
    }

    return {
        ok: true,
        reason: `init + plan, legs in response: ${response.plan.foot.legs.length}, requestId passed through`,
    };
}

function loadGeodata() {
    const geodata = {};
    for (const [key, file] of Object.entries(GEODATA_FILES)) {
        geodata[key] = JSON.parse(readFileSync(join(GEODATA, file), 'utf8'));
    }
    geodata.barrierCrossings = readJSON('barrier-crossings.json').crossings;
    return geodata;
}

function readJSON(file) {
    return JSON.parse(readFileSync(join(GEODATA, file), 'utf8'));
}

function distanceKm(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) * KM_PER_COORD_UNIT;
}

// Distance to the route as a polyline, not to its vertices: the drawn path is pulled taut, so a
// segment can pass straight through a place while its nearest vertex sits tens of km away.
function minDistanceToPathKm(path, point) {
    let nearest = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = dx === 0 && dy === 0
            ? 0
            : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy)));
    }

    return nearest * KM_PER_COORD_UNIT;
}

// The index is built once and shared, as the worker does: building it per case would fold its cost
// into every reported time and hide what a route actually takes.
function runCase(routing, index, roadNetwork, locations, testCase) {
    const from = locations.get(testCase.from);
    const to = locations.get(testCase.to);
    const startedAt = performance.now();
    const plan = routing.planRoutesWithIndex(from, to, index, roadNetwork);
    const ms = Math.round(performance.now() - startedAt);

    return {
        name: `${testCase.from} -> ${testCase.to}`,
        note: testCase.note,
        ms,
        structure: (plan.foot?.legs ?? []).map(leg => leg.kind),
        legCosts: (plan.foot?.legs ?? []).map(leg => Number(leg.cost.toFixed(4))),
        found: plan.foot !== null,
        distanceKm: plan.foot ? Number(plan.foot.distanceKm.toFixed(1)) : null,
        timeHours: plan.foot ? Number(plan.foot.timeHours.toFixed(1)) : null,
        pathPoints: plan.foot ? plan.foot.path.length : 0,
        shipFound: plan.ship !== null,
        shipDistanceKm: plan.ship ? Number(plan.ship.distanceKm.toFixed(1)) : null,
        shipTimeHours: plan.ship ? Number(plan.ship.timeHours.toFixed(1)) : null,
        shipPathPoints: plan.ship ? plan.ship.path.length : 0,
        footShipFound: plan.footShip !== null,
        footShipStructure: (plan.footShip?.legs ?? []).map(leg => leg.kind),
        footShipPorts: plan.footShip ? `${plan.footShip.ports.fromId ?? 'coast'} -> ${plan.footShip.ports.toId ?? 'coast'}` : null,
        footShipDistanceKm: plan.footShip ? Number(plan.footShip.distanceKm.toFixed(1)) : null,
        footShipTimeHours: plan.footShip ? Number(plan.footShip.timeHours.toFixed(1)) : null,
        horseShipPorts: plan.horseShip ? `${plan.horseShip.ports.fromId ?? 'coast'} -> ${plan.horseShip.ports.toId ?? 'coast'}` : null,
        horseShipTimeHours: plan.horseShip ? Number(plan.horseShip.timeHours.toFixed(1)) : null,
        dragonKm: Number(plan.dragon.distanceKm.toFixed(1)),
        plan,
    };
}

// The requirements stated in .claude/routing.md. Any of them that only holds after a later phase is
// marked with `phase` and counts as known debt until then, rather than as a failure.
function buildRequirements(casePoints) {
    const near = (result, name, thresholdKm) =>
        minDistanceToPathKm(result.plan.foot.path, locations.get(name)) <= thresholdKm;
    const roadLegEndsNear = (result, name, thresholdKm) => {
        const roadLegs = result.plan.foot.legs.filter(leg => leg.kind === 'road');
        return roadLegs.some(leg => distanceKm(leg.path[leg.path.length - 1], locations.get(name)) <= thresholdKm
            || distanceKm(leg.path[0], locations.get(name)) <= thresholdKm);
    };

    return [
        {
            // Only the road entry is pinned. Where the route leaves the road follows from the cost of
            // the remaining grid leg, which shifts whenever the rivers in the way change size - and
            // the map is still being edited there. Pinning the exit would make this fail on every
            // such edit without anything actually being wrong.
            case: 'Old Ghis -> Morosh',
            label: 'spec example 1: grid to Astapor, then road, then grid',
            check: result => result.structure.join('+') === 'grid+road+grid'
                && roadLegEndsNear(result, 'Astapor', 60),
        },
        {
            case: "King's Landing -> The Eyrie",
            label: 'spec example 2: entirely by road',
            check: result => result.structure.join('+') === 'road',
        },
        {
            case: 'Qohor -> Old Ghis',
            label: 'spec example 3: road up to Astapor, then grid',
            check: result => result.structure.join('+') === 'road+grid'
                && roadLegEndsNear(result, 'Astapor', 60),
        },
        {
            case: 'Mantarys -> Old Ghis',
            label: 'spec example 4: road up to Astapor, then grid',
            check: result => result.structure.join('+') === 'road+grid'
                && roadLegEndsNear(result, 'Astapor', 60),
        },
        {
            case: 'Pentos -> Vaes Dothrak',
            label: 'spec example 5: entirely by road',
            check: result => result.structure.join('+') === 'road',
        },
        {
            case: 'Selhorys -> Volon Therys',
            label: 'spec rivers 1: the route goes through Volantis',
            check: result => near(result, 'Volantis', 60),
        },
        {
            case: 'Pennytree -> Stone Hedge',
            label: 'spec rivers 2: the route goes through Riverrun',
            check: result => near(result, 'Riverrun', 40),
        },
        {
            case: "King's Landing -> Pentos",
            label: 'no ground route across the Narrow Sea, dragon only',
            groundRouteOptional: true,
            check: result => !result.found && result.dragonKm > 0,
        },
        {
            case: 'Castle Black -> Dragonstone',
            label: 'no ground route to an island, however coarse the grid that searches for one',
            groundRouteOptional: true,
            check: result => !result.found && result.dragonKm > 0,
        },
        {
            case: "King's Landing -> Pyke",
            label: 'no ground route to an island a short hop off the shore either',
            groundRouteOptional: true,
            check: result => !result.found && result.dragonKm > 0,
        },
        {
            case: "Winterfell -> Craster's Keep",
            label: 'the Wall is crossed at one of its four gates, not wherever the route pleases',
            check: result => ['Castle Black', 'Eastwatch-by-the-Sea', 'Shadow Tower', 'Nightfort']
                .some(gate => near(result, gate, 25)),
        },
        {
            case: 'Saath -> Vaes Graddakh (Sarys)',
            label: 'both ends on the road, yet the winding road loses to open ground and is dropped',
            check: result => result.structure.join('+') === 'grid',
        },
        {
            case: 'Saath -> Morosh',
            label: 'the guard rejects the x15.9 detour: route stays entirely on the grid',
            check: result => result.structure.join('+') === 'grid',
        },
        {
            case: "King's Landing -> Pentos",
            label: 'the Narrow Sea has no ground route but a sea one, so the pair is not unreachable',
            groundRouteOptional: true,
            check: result => !result.found && result.shipFound,
        },
        {
            case: 'Winterfell -> Oldtown',
            label: 'no sea route from a landlocked castle, whatever water the other end sits on',
            groundRouteOptional: true,
            check: result => !result.shipFound,
        },
        {
            case: 'Lordsport -> Lannisport',
            label: 'a port on an island reaches the mainland by sea',
            groundRouteOptional: true,
            check: result => result.shipFound,
        },
        {
            case: "King's Landing -> Lannisport",
            label: 'the sea route around Dorne is found, and is far longer than the flight',
            groundRouteOptional: true,
            check: result => result.shipFound && result.shipDistanceKm > 3 * result.dragonKm,
        },
        {
            case: 'Ramsgate -> Braavos',
            label: 'rule 5: a city port wins when the walk to it is within the band of the nearest',
            groundRouteOptional: true,
            check: result => result.footShipPorts === 'city-white-harbor -> city-braavos',
        },
        {
            case: 'Castle Black -> Braavos',
            label: 'rule 5: the nearest port wins outright when nothing better is near, castle or not',
            groundRouteOptional: true,
            check: result => result.footShipPorts === 'castle-eastwatch-by-the-sea -> city-braavos',
        },
        {
            case: "King's Landing -> Quiet Isle",
            label: 'rule 6: an island with no port is entered anywhere on its coast',
            groundRouteOptional: true,
            check: result => result.footShipFound && result.footShipPorts.endsWith('-> coast'),
        },
        {
            case: 'Castle Black -> Dragonstone',
            label: 'rule 1: no ground route to the island, but a combined one',
            groundRouteOptional: true,
            check: result => !result.found && result.footShipFound,
        },
        {
            case: `${OPEN_WATER} -> Winterfell`,
            label: 'a point in water reaches an inland castle: it boards nothing, it is already aboard',
            groundRouteOptional: true,
            check: result => !result.found && !result.shipFound && result.footShipFound
                && result.footShipPorts === 'coast -> city-white-harbor'
                && result.footShipStructure[0] === 'sea',
        },
        {
            case: 'Meereen -> Volantis',
            label: 'the Smoking Sea is navigable but slow, so the route round it beats sailing through',
            groundRouteOptional: true,
            check: result => result.shipFound
                && result.shipTimeHours < result.shipDistanceKm / 9,
        },
    ];
}

function compareToBaseline(results) {
    if (!existsSync(BASELINE)) {
        return { status: 'missing' };
    }

    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const diffs = [];

    for (const result of results) {
        const before = baseline.cases[result.name];
        if (!before) {
            diffs.push(`${result.name}: missing from baseline`);
            continue;
        }
        for (const field of [
            'structure', 'found', 'distanceKm', 'timeHours', 'pathPoints',
            'shipFound', 'shipDistanceKm', 'shipTimeHours', 'shipPathPoints',
            'footShipFound', 'footShipStructure', 'footShipPorts', 'footShipDistanceKm', 'footShipTimeHours',
            'horseShipPorts', 'horseShipTimeHours',
        ]) {
            const a = JSON.stringify(before[field]);
            const b = JSON.stringify(result[field]);
            if (a !== b) {
                diffs.push(`${result.name}: ${field} ${a} -> ${b}`);
            }
        }
    }

    return { status: diffs.length ? 'changed' : 'same', diffs };
}

function writeBaseline(results) {
    const cases = {};
    for (const result of results) {
        const { name, note, structure, found, distanceKm, timeHours, pathPoints } = result;
        const { shipFound, shipDistanceKm, shipTimeHours, shipPathPoints, dragonKm } = result;
        const { footShipFound, footShipStructure, footShipPorts, footShipDistanceKm, footShipTimeHours } = result;
        const { horseShipPorts, horseShipTimeHours } = result;
        cases[name] = {
            note, structure, found, distanceKm, timeHours, pathPoints,
            shipFound, shipDistanceKm, shipTimeHours, shipPathPoints,
            footShipFound, footShipStructure, footShipPorts, footShipDistanceKm, footShipTimeHours,
            horseShipPorts, horseShipTimeHours, dragonKm,
        };
    }
    writeFileSync(BASELINE, `${JSON.stringify({ cases }, null, 4)}\n`);
}

const shouldUpdate = process.argv.includes('--update');
const routing = await loadRouting();
const geodata = loadGeodata();
const roadNetwork = readJSON('road-network.json');
const locations = new Map(
    readJSON('got_locations.geojson').features
        .filter(feature => feature.properties.name)
        .map(feature => [feature.properties.name, feature.geometry.coordinates]),
);

const casePoints = new Map([...locations, [OPEN_WATER, OPEN_WATER_POINT]]);

const routingIndex = routing.buildRoutingIndex(geodata);

// The sea raster covers the whole map at a fixed resolution and is built once per index, exactly as
// the worker keeps it: charging the first case for it would say nothing about what a request costs.
const seaRasterAt = performance.now();
const seaRaster = routing.getSeaRaster(routingIndex);
console.log(`${getConsolePrefix('routing', 'sea raster')} ${Math.round(performance.now() - seaRasterAt)} ms once, `
    + `${seaRaster.grid.cols}x${seaRaster.grid.rows} cells of ${(seaRaster.grid.cellSize * KM_PER_COORD_UNIT).toFixed(1)} km\n`);

const results = [...CASES, ...SEA_CASES, ...COMBINED_CASES].map(testCase => {
    const result = runCase(routing, routingIndex, roadNetwork, casePoints, testCase);
    const summary = result.found
        ? `${String(result.distanceKm).padStart(7)}km ${String(result.timeHours).padStart(6)}h ${String(result.pathPoints).padStart(4)}pts`
        : '                 no route';
    const viaSea = result.footShipFound
        ? `${String(result.footShipDistanceKm).padStart(7)}km ${String(result.footShipTimeHours).padStart(6)}h  ${result.footShipPorts}`
        : '     no route via sea';
    console.log(
        `${getConsolePrefix('routing', result.name.padEnd(30))} ${String(result.ms).padStart(6)}ms ${summary} ` +
        `|${viaSea}`,
    );
    return result;
});

const totalMs = results.reduce((sum, result) => sum + result.ms, 0);
console.log(`\ntotal ${totalMs} ms, worst case ${Math.max(...results.map(r => r.ms))} ms\n`);

const byName = new Map(results.map(result => [result.name, result]));
let failed = 0;
let deferred = 0;

for (const requirement of buildRequirements(casePoints)) {
    const result = byName.get(requirement.case);
    const ok = result && (requirement.groundRouteOptional || result.found) ? requirement.check(result) : false;
    if (ok) {
        console.log(`  OK       ${requirement.label}`);
    } else if (requirement.phase) {
        deferred++;
        console.log(`  PHASE ${requirement.phase}  ${requirement.label} - expected to fail until then`);
    } else {
        failed++;
        console.log(`  FAIL     ${requirement.label} - got [${result?.structure.join('+') ?? 'no route'}]`);
    }
}

const guardOffenders = checkDetourGuard(routing, routingIndex, casePoints, results);
if (guardOffenders.length) {
    failed++;
    console.log('  FAIL     road-assisted routes detouring beyond what their road share earns:');
    guardOffenders.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       every road-assisted route earns its detour by the share of road it carries');
}

const tooFast = checkEffectiveSpeed(results);
if (tooFast.length) {
    failed++;
    console.log('  FAIL     routes averaging more than the base speed:');
    tooFast.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       no route averages more than its base speed, so distance and time agree: '
        + `${Object.entries(BASE_SPEED_KMH).map(([mode, base]) => `${mode} ${base}`).join(' km/h, ')} km/h`);
}

const blockedLocations = checkLocationsPassable(routing, routingIndex, locations, routing.MIN_CELL_SIZE);
if (blockedLocations.length) {
    failed++;
    console.log(`  FAIL     ${blockedLocations.length} locations are impassable: ${blockedLocations.slice(0, 8).join(', ')}`);
} else {
    console.log(`  OK       all ${locations.size} locations are passable, none blocked by water or a barrier`);
}

const onWater = checkPathOnLand(routing, routingIndex, results);
if (onWater.length) {
    failed++;
    console.log('  FAIL     routes walking on water:');
    onWater.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       every grid leg stays on land, sampled every kilometre against the polygons');
}

const legPartition = checkLegPartition(results);
if (legPartition.length) {
    failed++;
    console.log('  FAIL     legs do not partition the route:');
    legPartition.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       legs concatenate back into the drawn route, point for point');
}

const outsideMap = checkMapBounds(results);
if (outsideMap.length) {
    failed++;
    console.log('  FAIL     routes leaving the mapped world:');
    outsideMap.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       no route leaves the mapped world');
}

const riverCheck = checkBarrierCrossings(geodata, results);
if (riverCheck.offenders.length) {
    failed++;
    console.log('  FAIL     routes crossing a barrier away from any declared crossing:');
    riverCheck.offenders.slice(0, 5).forEach(offender => console.log(`             ${offender}`));
} else {
    console.log(`  OK       all ${riverCheck.crossingsFound} barrier crossings made by these routes are at declared crossings`);
}

const offWater = checkPathOnWater(routing, routingIndex, results);
if (offWater.length) {
    failed++;
    console.log('  FAIL     sea routes crossing land or leaving painted water:');
    offWater.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       every sea route stays on painted water and off every landmass');
}

const tooClose = checkSeaClearance(routing, routingIndex, results);
if (tooClose.offenders.length) {
    failed++;
    console.log('  FAIL     sea routes closer to land than the water they cross required:');
    tooClose.offenders.slice(0, 20).forEach(offender => console.log(`             ${offender}`));
} else {
    const worst = tooClose.worst;
    console.log(`  OK       every sea route keeps ${routing.SEA_CLEARANCE_KM} km off land, or the middle of a narrower `
        + `passage${worst ? `, tightest ${worst.clearance.toFixed(1)} km of ${worst.best.toFixed(1)} km available` : ''}`);
    console.log('  OK       every port approach reaches open water within '
        + `${MAX_APPROACH_KM} km, longest ${tooClose.longestApproachKm.toFixed(0)} km`);
}

const sag = checkSeaSag(routing, routingIndex, results);
if (sag.offenders.length) {
    failed++;
    console.log('  FAIL     sea routes whose drawn line loses more clearance than a cell-to-cell step can:');
    sag.offenders.slice(0, 5).forEach(offender => console.log(`             ${offender}`));
} else {
    console.log(`  OK       the drawn line never cuts more than ${sag.worst.toFixed(1)} km inside the clearance its `
        + `vertices were owed, of the ${getMaxSagKm(routing).toFixed(1)} km one cell-to-cell step can lose`);
}

const stubs = checkSeaStubs(routing, results);
if (stubs.offenders.length) {
    failed++;
    console.log('  FAIL     sea routes whose port stub covers more than an entrance:');
    stubs.offenders.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log(`  OK       every port stub only bridges the gap to navigable water, longest ${stubs.longest.toFixed(1)} km`);
}

const badPorts = checkCombinedPorts(routing, routingIndex, casePoints, results);
if (badPorts.length) {
    failed++;
    console.log('  FAIL     combined routes boarding or landing where they may not:');
    badPorts.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       every combined route boards and lands at a port of the right landmass');
}

const badEndpoints = checkSeaEndpoints(routing, routingIndex, casePoints, results);
if (badEndpoints.length) {
    failed++;
    console.log('  FAIL     sea routes starting or ending away from water and from any port:');
    badEndpoints.forEach(offender => console.log(`             ${offender}`));
} else {
    console.log('  OK       every sea route starts and ends in water or at a port');
}

const raster = checkRasterFaithfulness(routing, routingIndex, casePoints);
if (raster.mismatches.length) {
    failed++;
    console.log(`  FAIL     raster != classifyCell: ${raster.mismatches.length}+ mismatches out of ${raster.cells} cells`);
    raster.mismatches.forEach(mismatch => console.log(`             ${mismatch}`));
} else {
    console.log(`  OK       raster == classifyCell on all ${raster.cells} cells of real geodata`);
}

const seaRasterCheck = checkSeaRasterFaithfulness(routing, routingIndex, casePoints);
if (seaRasterCheck.mismatches.length) {
    failed++;
    console.log(`  FAIL     sea raster != classifySeaCell: ${seaRasterCheck.mismatches.length}+ mismatches `
        + `out of ${seaRasterCheck.cells} cells`);
    seaRasterCheck.mismatches.forEach(mismatch => console.log(`             ${mismatch}`));
} else {
    console.log(`  OK       sea raster == classifySeaCell on all ${seaRasterCheck.cells} cells of real geodata`);
}

const workerCheck = await checkWorkerProtocol(
    geodata,
    roadNetwork,
    locations.get("King's Landing"),
    locations.get('The Eyrie'),
);
if (workerCheck.ok) {
    console.log(`  OK       worker protocol: ${workerCheck.reason}`);
} else {
    failed++;
    console.log(`  FAIL     worker protocol: ${workerCheck.reason}`);
}

console.log();

if (shouldUpdate) {
    writeBaseline(results);
    console.log(`${getConsolePrefix('routing', 'baseline')} written to scripts/routing/baseline.json`);
} else {
    const { status, diffs } = compareToBaseline(results);
    if (status === 'missing') {
        console.log(`${getConsolePrefix('routing', 'baseline')} missing - create it with: npm run check-routing -- --update`);
    } else if (status === 'same') {
        console.log(`${getConsolePrefix('routing', 'baseline')} matches`);
    } else {
        failed += diffs.length;
        console.log(`${getConsolePrefix('routing', 'baseline')} DIFFERENCES:`);
        diffs.forEach(diff => console.log(`  ${diff}`));
    }
}

console.log(`\nresult: ${failed} failures, ${deferred} deferred`);
process.exit(failed ? 1 : 0);
