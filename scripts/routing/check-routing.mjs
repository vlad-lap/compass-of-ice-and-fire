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

// Terrain coefficients are at most 1, so a route can never average more than the base speed. Any
// excess means the reported distance and time describe different geometry - which they did: cost was
// accumulated along the staircase of cell centers while distance was measured on the drawn line, and
// the stubs and leg joints of the drawn line carried no cost at all.
const BASE_SPEED_KMH = 4;

function checkEffectiveSpeed(results) {
    // Straight off the plan rather than off the recorded fields: those are rounded to a tenth, and
    // the ratio of two rounded numbers overshoots by a hair on its own.
    return results
        .filter(result => result.found)
        .map(result => ({ name: result.name, speed: result.plan.foot.distanceKm / result.plan.foot.timeHours }))
        .filter(({ speed }) => speed > BASE_SPEED_KMH + 1e-6)
        .map(({ name, speed }) => `${name}: ${speed.toFixed(4)} km/h over a base of ${BASE_SPEED_KMH}`);
}

// A settlement you cannot even stand on is always a data or model error, whatever else is true of
// the route to it. This invariant would have caught both: islands painted over by sea polygons (43
// locations), and towns on a confluence declared a crossing for only one of their rivers (4 more).
function checkLocationsPassable(routing, index, locations, cellSize) {
    return [...locations].filter(([, point]) => routing.classifyCell(point, index, cellSize) === null)
        .map(([name]) => name);
}

// A route may prefer a road over open ground, but only in proportion to how much of the route the
// road carries. Checked against the real alternative - the same route planned with no road network at
// all - rather than against the straight line. Routes that are entirely road are checked too: their
// share is 1, so they get the full tolerance, and every legitimate one beats open ground anyway.
const ROAD_TIME_TOLERANCE = 3;

function getRoadTimeTolerance(roadShare) {
    return 1 + (ROAD_TIME_TOLERANCE - 1) * roadShare;
}

function checkDetourGuard(routing, geodata, locations, results) {
    const offenders = [];

    for (const result of results) {
        if (!result.found || !result.structure.includes('road')) {
            continue;
        }

        const gridOnly = routing.planRoutes(
            locations.get(result.name.split(' -> ')[0]),
            locations.get(result.name.split(' -> ')[1]),
            geodata,
            null,
        );
        if (!gridOnly.foot) {
            continue;
        }

        const total = result.legCosts.reduce((sum, cost) => sum + cost, 0);
        const roadCost = result.plan.legs
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
        if (!result.found) {
            continue;
        }

        const joined = result.plan.legs.flatMap(leg => leg.path);
        const path = result.plan.foot.path;

        if (joined.length !== path.length) {
            offenders.push(`${result.name}: legs hold ${joined.length} points, the path has ${path.length}`);
            continue;
        }

        const mismatch = path.findIndex((position, index) =>
            position[0] !== joined[index][0] || position[1] !== joined[index][1]);
        if (mismatch !== -1) {
            offenders.push(`${result.name}: point ${mismatch} differs, path ${path[mismatch]} vs legs ${joined[mismatch]}`);
        }
    }

    return offenders;
}

function checkMapBounds(results) {
    const offenders = [];

    for (const result of results) {
        if (!result.found) {
            continue;
        }

        const outside = result.plan.foot.path.filter(([lng, lat]) =>
            lng < MAP_BOUNDS.west || lng > MAP_BOUNDS.east || lat < MAP_BOUNDS.south || lat > MAP_BOUNDS.north);

        if (outside.length) {
            offenders.push(`${result.name}: ${outside.length} points outside the map, e.g. ${outside[0].map(v => v.toFixed(2))}`);
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
    if (!response.plan?.foot || !response.plan.legs?.length) {
        return { ok: false, reason: 'response has no foot/legs' };
    }

    return { ok: true, reason: `init + plan, legs in response: ${response.plan.legs.length}, requestId passed through` };
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

function runCase(routing, geodata, roadNetwork, locations, testCase) {
    const from = locations.get(testCase.from);
    const to = locations.get(testCase.to);
    const startedAt = performance.now();
    const plan = routing.planRoutes(from, to, geodata, roadNetwork);
    const ms = Math.round(performance.now() - startedAt);

    return {
        name: `${testCase.from} -> ${testCase.to}`,
        note: testCase.note,
        ms,
        structure: plan.legs.map(leg => leg.kind),
        legCosts: plan.legs.map(leg => Number(leg.cost.toFixed(4))),
        found: plan.foot !== null,
        distanceKm: plan.foot ? Number(plan.foot.distanceKm.toFixed(1)) : null,
        timeHours: plan.foot ? Number(plan.foot.timeHours.toFixed(1)) : null,
        pathPoints: plan.foot ? plan.foot.path.length : 0,
        dragonKm: Number(plan.dragon.distanceKm.toFixed(1)),
        plan,
    };
}

// The requirements stated in .claude/routing.md. Any of them that only holds after a later phase is
// marked with `phase` and counts as known debt until then, rather than as a failure.
function buildRequirements(locations) {
    const near = (result, name, thresholdKm) =>
        minDistanceToPathKm(result.plan.foot.path, locations.get(name)) <= thresholdKm;
    const roadLegEndsNear = (result, name, thresholdKm) => {
        const roadLegs = result.plan.legs.filter(leg => leg.kind === 'road');
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
            expectNoRoute: true,
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
        for (const field of ['structure', 'found', 'distanceKm', 'timeHours', 'pathPoints']) {
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
    for (const { name, note, structure, found, distanceKm, timeHours, pathPoints, dragonKm } of results) {
        cases[name] = { note, structure, found, distanceKm, timeHours, pathPoints, dragonKm };
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

const results = CASES.map(testCase => {
    const result = runCase(routing, geodata, roadNetwork, locations, testCase);
    const summary = result.found
        ? `${String(result.distanceKm).padStart(7)}km ${String(result.timeHours).padStart(6)}h ${String(result.pathPoints).padStart(4)}pts`
        : '                 no route';
    console.log(
        `${getConsolePrefix('routing', result.name.padEnd(30))} ${String(result.ms).padStart(6)}ms ${summary}  ` +
        `[${result.structure.join('+') || '-'}]  ${result.note}`,
    );
    return result;
});

const totalMs = results.reduce((sum, result) => sum + result.ms, 0);
console.log(`\ntotal ${totalMs} ms, worst case ${Math.max(...results.map(r => r.ms))} ms\n`);

const byName = new Map(results.map(result => [result.name, result]));
let failed = 0;
let deferred = 0;

for (const requirement of buildRequirements(locations)) {
    const result = byName.get(requirement.case);
    const ok = result && (requirement.expectNoRoute || result.found) ? requirement.check(result) : false;
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

const guardOffenders = checkDetourGuard(routing, geodata, locations, results);
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
    console.log(`  OK       no route averages more than the base ${BASE_SPEED_KMH} km/h, so distance and time agree`);
}

const routingIndex = routing.buildRoutingIndex(geodata);
const blockedLocations = checkLocationsPassable(routing, routingIndex, locations, routing.MIN_CELL_SIZE);
if (blockedLocations.length) {
    failed++;
    console.log(`  FAIL     ${blockedLocations.length} locations are impassable: ${blockedLocations.slice(0, 8).join(', ')}`);
} else {
    console.log(`  OK       all ${locations.size} locations are passable, none blocked by water or a barrier`);
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

const raster = checkRasterFaithfulness(routing, routingIndex, locations);
if (raster.mismatches.length) {
    failed++;
    console.log(`  FAIL     raster != classifyCell: ${raster.mismatches.length}+ mismatches out of ${raster.cells} cells`);
    raster.mismatches.forEach(mismatch => console.log(`             ${mismatch}`));
} else {
    console.log(`  OK       raster == classifyCell on all ${raster.cells} cells of real geodata`);
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
