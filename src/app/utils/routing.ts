import { Position } from 'geojson';
import {
    CellIndex,
    Grid,
    IndexedPort,
    PathResult,
    RoadNetwork,
    RouteLeg,
    RouteLegKind,
    RoutePlan,
    RoutePorts,
    RouteResult,
    RoutingGeodata,
    RoutingIndex,
} from '../models';
import {
    BBOX_MARGIN_RATIO,
    DEFAULT_CELL_BUDGET,
    MIN_BBOX_MARGIN,
    MIN_CELL_SIZE,
    getCellCenter,
    getCellIndexAt,
    NEIGHBOR_OFFSETS,
    buildGrid,
    toFlatIndex,
} from './grid';
import {
    buildRoutingIndex,
    classifyCell,
    getLandmass,
    isPassablePoint,
    IMPASSABLE,
    TerrainK,
    isPointInAreas,
    isNavigable,
    isSeaEndpoint,
    keepsSeaClearance,
    labelComponents,
    pointToSegmentDistance,
    rasterizeGrid,
    rasterizeSeaGrid,
} from './raster';
import { NumericMinHeap } from './min-heap';
import {
    findNearestNodesInGroup,
    findNetworkAnchor,
    findNetworkPath,
    getNetworkDistances,
    NetworkAnchor,
    RoadNetworkPath,
} from './road-network';
import { KM_PER_COORD_UNIT, MapBounds } from '../components/map-page/constants';

export enum SpeedKmH {
    foot = 4,
    horse = 8,
    ship = 10,
    dragon = 100,
}

const ON_NETWORK_EPS = 0.2;

const ROAD_TIME_TOLERANCE = 3;

function getRoadTimeTolerance(roadShare: number): number {
    return 1 + (ROAD_TIME_TOLERANCE - 1) * roadShare;
}

function getRoadShare(route: PlannedRoute): number {
    if (route.cost === 0) {
        return 0;
    }

    const roadCost = route.legs
        .filter(leg => leg.kind === 'road')
        .reduce((total, leg) => total + leg.cost, 0);

    return roadCost / route.cost;
}

const CANDIDATE_COUNT = 20;

const CANDIDATE_SPACING = 0.2;

const NO_PARENT = -1;

export const MARGIN_RETRY_STEPS: { marginRatio: number; minMargin: number; cellBudget: number }[] = [
    { marginRatio: BBOX_MARGIN_RATIO, minMargin: MIN_BBOX_MARGIN, cellBudget: DEFAULT_CELL_BUDGET },
    { marginRatio: 1, minMargin: 2, cellBudget: 100_000 },
    { marginRatio: 4, minMargin: 8, cellBudget: 60_000 },
];

export function findPath(
    grid: Grid,
    k: Float64Array,
    start: CellIndex,
    goal: CellIndex,
): PathResult | null {
    const startFlat = toFlatIndex(grid, start.col, start.row);
    const goalFlat = toFlatIndex(grid, goal.col, goal.row);

    if (k[startFlat] === IMPASSABLE || k[goalFlat] === IMPASSABLE) {
        return null;
    }

    const goalCenter = getCellCenter(grid, goal.col, goal.row);
    const cells = grid.cols * grid.rows;

    const gScore = new Float64Array(cells).fill(Infinity);
    const cameFrom = new Int32Array(cells).fill(NO_PARENT);
    const visited = new Uint8Array(cells);

    gScore[startFlat] = 0;
    const open = new NumericMinHeap();
    open.push(heuristic(getCellCenter(grid, start.col, start.row), goalCenter), startFlat);

    while (open.size > 0) {
        const currentFlat = open.pop();

        if (currentFlat === goalFlat) {
            return buildPathResult(grid, cameFrom, currentFlat, gScore[currentFlat]);
        }
        if (visited[currentFlat]) {
            continue;
        }
        visited[currentFlat] = 1;

        const col = currentFlat % grid.cols;
        const row = Math.floor(currentFlat / grid.cols);
        const currentK = k[currentFlat];
        const currentG = gScore[currentFlat];

        for (const offset of NEIGHBOR_OFFSETS) {
            const neighborCol = col + offset.col;
            const neighborRow = row + offset.row;
            if (neighborCol < 0 || neighborCol >= grid.cols || neighborRow < 0 || neighborRow >= grid.rows) {
                continue;
            }

            const neighborFlat = toFlatIndex(grid, neighborCol, neighborRow);
            const neighborK = k[neighborFlat];
            if (neighborK === IMPASSABLE) {
                continue;
            }

            const distance = Math.hypot(offset.col, offset.row) * grid.cellSize;
            const edgeCost = 0.5 * distance * (1 / currentK + 1 / neighborK);
            const tentativeG = currentG + edgeCost;

            if (tentativeG < gScore[neighborFlat]) {
                gScore[neighborFlat] = tentativeG;
                cameFrom[neighborFlat] = currentFlat;
                const neighborCenter = getCellCenter(grid, neighborCol, neighborRow);
                open.push(tentativeG + heuristic(neighborCenter, goalCenter), neighborFlat);
            }
        }
    }

    return null;
}

export function computeGridCosts(
    grid: Grid,
    k: Float64Array,
    start: CellIndex,
    targets: CellIndex[] = [],
): Float64Array {
    const cells = grid.cols * grid.rows;
    const gScore = new Float64Array(cells).fill(Infinity);
    const visited = new Uint8Array(cells);
    const startFlat = toFlatIndex(grid, start.col, start.row);

    if (k[startFlat] === IMPASSABLE) {
        return gScore;
    }

    const pending = new Set(targets.map(target => toFlatIndex(grid, target.col, target.row)));
    gScore[startFlat] = 0;
    const open = new NumericMinHeap();
    open.push(0, startFlat);

    while (open.size > 0) {
        const currentFlat = open.pop();
        if (visited[currentFlat]) {
            continue;
        }
        visited[currentFlat] = 1;

        if (targets.length && pending.delete(currentFlat) && !pending.size) {
            return gScore;
        }

        const col = currentFlat % grid.cols;
        const row = Math.floor(currentFlat / grid.cols);
        const currentK = k[currentFlat];
        const currentG = gScore[currentFlat];

        for (const offset of NEIGHBOR_OFFSETS) {
            const neighborCol = col + offset.col;
            const neighborRow = row + offset.row;
            if (neighborCol < 0 || neighborCol >= grid.cols || neighborRow < 0 || neighborRow >= grid.rows) {
                continue;
            }

            const neighborFlat = toFlatIndex(grid, neighborCol, neighborRow);
            const neighborK = k[neighborFlat];
            if (neighborK === IMPASSABLE) {
                continue;
            }

            const distance = Math.hypot(offset.col, offset.row) * grid.cellSize;
            const tentativeG = currentG + 0.5 * distance * (1 / currentK + 1 / neighborK);
            if (tentativeG < gScore[neighborFlat]) {
                gScore[neighborFlat] = tentativeG;
                open.push(tentativeG, neighborFlat);
            }
        }
    }

    return gScore;
}

export function placePoint(
    point: Position,
    grid: Grid,
    index: RoutingIndex,
    k: Float64Array,
): CellIndex | null {
    const cell = getCellIndexAt(grid, point);
    if (!cell) {
        return null;
    }

    if (classifyCell(point, index, grid.cellSize) !== null) {
        return cell;
    }

    if (!isPointInAreas(point, index.land)) {
        return null;
    }

    return findNearestPassableCell(grid, k, cell);
}

function findNearestPassableCell(
    grid: Grid,
    k: Float64Array,
    origin: CellIndex,
    isAcceptable: (cell: CellIndex) => boolean = () => true,
): CellIndex | null {
    const visited = new Set<number>([toFlatIndex(grid, origin.col, origin.row)]);
    let ring: CellIndex[] = [origin];

    while (ring.length > 0) {
        const nextRing: CellIndex[] = [];

        for (const cell of ring) {
            for (const offset of NEIGHBOR_OFFSETS) {
                const col = cell.col + offset.col;
                const row = cell.row + offset.row;
                if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
                    continue;
                }

                const flatIndex = toFlatIndex(grid, col, row);
                if (visited.has(flatIndex)) {
                    continue;
                }
                visited.add(flatIndex);

                if (k[flatIndex] !== IMPASSABLE && isAcceptable({ col, row })) {
                    return { col, row };
                }
                nextRing.push({ col, row });
            }
        }

        ring = nextRing;
    }

    return null;
}

function heuristic(point: Position, goal: Position): number {
    return Math.hypot(point[0] - goal[0], point[1] - goal[1]);
}

function buildPathResult(
    grid: Grid,
    cameFrom: Int32Array,
    endFlat: number,
    cost: number,
): PathResult {
    const path: Position[] = [];
    let current = endFlat;

    while (current !== NO_PARENT) {
        const col = current % grid.cols;
        const row = Math.floor(current / grid.cols);
        path.push(getCellCenter(grid, col, row));
        current = cameFrom[current];
    }

    path.reverse();
    return { path, cost };
}

export function calculateDragonRoute(from: Position, to: Position): RouteResult {
    const distanceKm = Math.hypot(to[0] - from[0], to[1] - from[1]) * KM_PER_COORD_UNIT;

    return {
        path: [from, to],
        distanceKm,
        timeHours: distanceKm / SpeedKmH.dragon,
        legs: [],
    };
}

const SIMPLIFY_EPSILON_FACTOR = 0.5;

export function planRoutes(
    from: Position,
    to: Position,
    geodata: RoutingGeodata,
    roadNetwork: RoadNetwork | null = null,
): RoutePlan {
    return planRoutesWithIndex(from, to, buildRoutingIndex(geodata), roadNetwork);
}

export function planRoutesWithIndex(
    from: Position,
    to: Position,
    index: RoutingIndex,
    roadNetwork: RoadNetwork | null = null,
): RoutePlan {
    const groundRoute = planGroundRoute(from, to, index, roadNetwork);
    const seaRoute = planSeaRoute(from, to, index);
    const viaSea = planCombinedRoutes(from, to, index, roadNetwork, groundRoute);

    return {
        foot: groundRoute ? toRouteResult(groundRoute, SpeedKmH.foot) : null,
        horse: groundRoute ? toRouteResult(groundRoute, SpeedKmH.horse) : null,
        footShip: viaSea.foot,
        horseShip: viaSea.horse,
        ship: seaRoute ? toRouteResult(seaRoute, SpeedKmH.ship) : null,
        dragon: calculateDragonRoute(from, to),
    };
}

export const SEA_CELL_SIZE = 0.1;
export const SEA_ESTIMATE_CELL_SIZE = 0.3;

export interface SeaRaster {
    grid: Grid;
    k: Float64Array;
    costK: Float64Array;
    labels: Int32Array;
}

const seaRasters = new WeakMap<RoutingIndex, Map<number, SeaRaster>>();

export function getSeaRaster(index: RoutingIndex, cellSize = SEA_CELL_SIZE): SeaRaster {
    if (!seaRasters.has(index)) {
        seaRasters.set(index, new Map());
    }

    const byCellSize = seaRasters.get(index);
    const cached = byCellSize.get(cellSize);
    if (cached) {
        return cached;
    }

    const grid: Grid = {
        minLng: MapBounds.West,
        minLat: MapBounds.South,
        cellSize,
        cols: Math.ceil((MapBounds.East - MapBounds.West) / cellSize),
        rows: Math.ceil((MapBounds.North - MapBounds.South) / cellSize),
    };
    const { k, costK } = rasterizeSeaGrid(grid, index);
    const raster: SeaRaster = { grid, k, costK, labels: labelComponents(grid, k) };

    byCellSize.set(cellSize, raster);

    return raster;
}

function estimateSeaCost(from: Position, to: Position, index: RoutingIndex): number | null {
    const { grid, costK, labels } = getSeaRaster(index, SEA_ESTIMATE_CELL_SIZE);
    const placedFrom = placeSeaPoint(from, grid, costK, index);
    const placedTo = placeSeaPoint(to, grid, costK, index);
    if (!placedFrom || !placedTo) {
        return null;
    }
    if (getCellLabel(grid, labels, placedFrom) !== getCellLabel(grid, labels, placedTo)) {
        return null;
    }

    return findPath(grid, costK, placedFrom, placedTo)?.cost ?? null;
}

function planSeaRoute(from: Position, to: Position, index: RoutingIndex): PlannedRoute | null {
    return isSeaEndpoint(from, index) && isSeaEndpoint(to, index) ? buildSeaRoute(from, to, index) : null;
}

function buildSeaRoute(from: Position, to: Position, index: RoutingIndex): PlannedRoute | null {
    const { grid, k, costK, labels } = getSeaRaster(index);
    const placedFrom = placeSeaPoint(from, grid, k, index);
    const placedTo = placeSeaPoint(to, grid, k, index);
    if (!placedFrom || !placedTo) {
        return null;
    }
    if (getCellLabel(grid, labels, placedFrom) !== getCellLabel(grid, labels, placedTo)) {
        return null;
    }

    const seaPath = findPath(grid, k, placedFrom, placedTo);
    if (!seaPath) {
        return null;
    }

    const path = pullTautPath(seaPath.path, getSeaPassability(index, grid, k));
    const cost = measurePathCost(path, grid, costK);

    return anchorRoute({ path, cost, legs: [{ kind: 'sea', path, cost }] }, from, to);
}

function placeSeaPoint(
    point: Position,
    grid: Grid,
    k: Float64Array,
    index: RoutingIndex,
): CellIndex | null {
    const cell = getCellIndexAt(grid, point);
    if (!cell) {
        return null;
    }
    if (k[toFlatIndex(grid, cell.col, cell.row)] !== IMPASSABLE) {
        return cell;
    }

    return findNearestPassableCell(grid, k, cell, candidate =>
        isStubNavigable(point, getCellCenter(grid, candidate.col, candidate.row), index, grid.cellSize));
}

const STUB_SAMPLE_FACTOR = 0.25;

function isStubNavigable(from: Position, to: Position, index: RoutingIndex, cellSize: number): boolean {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const sampleCount = Math.max(1, Math.ceil(distance / (cellSize * STUB_SAMPLE_FACTOR)));
    let ashore = true;

    for (let i = 1; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const point: Position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
        const onLand = isPointInAreas(point, index.land);

        if (onLand && !ashore) {
            return false;
        }
        ashore = ashore && onLand;
    }

    return true;
}

interface RoadCandidate {
    node: number;
    distance: number;
}

interface PlanContext {
    index: RoutingIndex;
    roadNetwork: RoadNetwork;
    gridRoute: (from: Position, to: Position) => PlannedRoute | null;
}

function createPlanContext(index: RoutingIndex, roadNetwork: RoadNetwork): PlanContext {
    const legs = new Map<string, PlannedRoute | null>();

    return {
        index,
        roadNetwork,
        gridRoute: (from, to) => {
            const key = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
            if (!legs.has(key)) {
                legs.set(key, buildGridRoute(from, to, index));
            }
            return legs.get(key);
        },
    };
}

interface PlannedLeg {
    kind: RouteLegKind;
    path: Position[];
    cost: number;
}

interface PlannedRoute {
    path: Position[];
    cost: number;
    legs: PlannedLeg[];
}


export const PORT_APPROACH_BAND = 1.5;
export const PORT_PRIORITY_TIME_CAP = 2;

const PORT_TYPE_PRIORITY = ['city', 'settlement', 'castle', 'ruin'];
const LANDING_CANDIDATE_COUNT = 6;
const PORT_VERIFY_COUNT = 3;
const PORT_PRICING_CELL_BUDGET = 40_000;
const LANDING_SPACING = 0.5;
const LANDING_INSET = MIN_CELL_SIZE;

interface EmbarkationPoint {
    port: IndexedPort | null;
    point: Position;
}

interface Embarkation extends EmbarkationPoint {
    cost: number;
    eligible: boolean;
}

interface CombinedRoutes {
    foot: RouteResult | null;
    horse: RouteResult | null;
}

function planCombinedRoutes(
    from: Position,
    to: Position,
    index: RoutingIndex,
    roadNetwork: RoadNetwork | null,
    groundRoute: PlannedRoute | null,
): CombinedRoutes {
    if (isNavigable(from, index) && isNavigable(to, index)) {
        return { foot: null, horse: null };
    }

    const departurePoints = findEmbarkationPoints(from, to, index);
    const arrivalPoints = findEmbarkationPoints(to, from, index);
    const isWorthSailing = (speedKmh: number) => !groundRoute
        || getBestCombinedBound(from, to, departurePoints, arrivalPoints, speedKmh)
            < getCostTimeHours(groundRoute.cost, speedKmh);

    if (!departurePoints.length || !arrivalPoints.length
        || (!isWorthSailing(SpeedKmH.foot) && !isWorthSailing(SpeedKmH.horse))) {
        return { foot: null, horse: null };
    }

    const departures = priceEmbarkations(from, departurePoints, index);
    const arrivals = priceEmbarkations(to, arrivalPoints, index);
    const context = {
        index,
        roadNetwork,
        seaRoutes: new Map<string, PlannedRoute | null>(),
        seaEstimates: new Map<string, number | null>(),
        groundRoutes: new Map<string, PlannedRoute | null>(),
    };

    return {
        foot: isWorthSailing(SpeedKmH.foot)
            ? pickCombinedRoute(from, to, departures, arrivals, context, SpeedKmH.foot)
            : null,
        horse: isWorthSailing(SpeedKmH.horse)
            ? pickCombinedRoute(from, to, departures, arrivals, context, SpeedKmH.horse)
            : null,
    };
}

function getBestCombinedBound(
    from: Position,
    to: Position,
    departures: EmbarkationPoint[],
    arrivals: EmbarkationPoint[],
    speedKmh: number,
): number {
    let best = Infinity;

    for (const departure of departures) {
        const toPort = getStraightTimeHours(from, departure.point, speedKmh);
        for (const arrival of arrivals) {
            if (isSamePosition(departure.point, arrival.point)) {
                continue;
            }
            best = Math.min(best, toPort
                + getStraightTimeHours(departure.point, arrival.point, SpeedKmH.ship)
                + getStraightTimeHours(arrival.point, to, speedKmh));
        }
    }

    return best;
}

interface CombinedContext {
    index: RoutingIndex;
    roadNetwork: RoadNetwork | null;
    seaRoutes: Map<string, PlannedRoute | null>;
    seaEstimates: Map<string, number | null>;
    groundRoutes: Map<string, PlannedRoute | null>;
}

function pickCombinedRoute(
    from: Position,
    to: Position,
    departures: Embarkation[],
    arrivals: Embarkation[],
    context: CombinedContext,
    speedKmh: number,
): RouteResult | null {
    const variants: { departure: Embarkation; arrival: Embarkation; bound: number }[] = [];

    for (const departure of departures) {
        for (const arrival of arrivals) {
            if (isSamePosition(departure.point, arrival.point)) {
                continue;
            }
            variants.push({
                departure,
                arrival,
                bound: getCostTimeHours(departure.cost, speedKmh)
                    + getStraightTimeHours(departure.point, arrival.point, SpeedKmH.ship)
                    + getCostTimeHours(arrival.cost, speedKmh),
            });
        }
    }
    variants.sort((a, b) => a.bound - b.bound);

    const ranked: { variant: (typeof variants)[number]; estimate: number }[] = [];
    let best = Infinity;
    let bestEligible = Infinity;

    for (const variant of variants) {
        if (variant.bound >= bestEligible) {
            break;
        }

        const sea = getCachedSeaEstimate(variant.departure.point, variant.arrival.point, context);
        if (sea === null) {
            continue;
        }

        const estimate = getCostTimeHours(variant.departure.cost, speedKmh)
            + getCostTimeHours(sea, SpeedKmH.ship)
            + getCostTimeHours(variant.arrival.cost, speedKmh);

        ranked.push({ variant, estimate });
        best = Math.min(best, estimate);
        if (variant.departure.eligible && variant.arrival.eligible) {
            bestEligible = Math.min(bestEligible, estimate);
        }
    }

    return pickVerifiedVariant(from, to, ranked, context, speedKmh);
}

interface VerifiedVariant {
    departure: Embarkation;
    arrival: Embarkation;
    time: number;
}

function pickVerifiedVariant(
    from: Position,
    to: Position,
    ranked: { variant: { departure: Embarkation; arrival: Embarkation }; estimate: number }[],
    context: CombinedContext,
    speedKmh: number,
): RouteResult | null {
    const byEstimate = ranked.sort((a, b) => a.estimate - b.estimate);
    const worthVerifying = byEstimate[0] ? byEstimate[0].estimate * PORT_PRIORITY_TIME_CAP : 0;
    const verified = byEstimate
        .slice(0, PORT_VERIFY_COUNT)
        .filter(({ estimate }) => estimate <= worthVerifying)
        .map(({ variant }) => verifyVariant(from, to, variant, context, speedKmh))
        .filter((variant): variant is VerifiedVariant => variant !== null);

    const fastest = pickFastest(verified);
    const preferred = pickFastest(verified.filter(({ departure, arrival }) => departure.eligible && arrival.eligible));
    const chosen = preferred && fastest && preferred.time <= fastest.time * PORT_PRIORITY_TIME_CAP
        ? preferred
        : fastest;

    return chosen ? buildCombinedRoute(from, to, chosen.departure, chosen.arrival, context, speedKmh) : null;
}

function verifyVariant(
    from: Position,
    to: Position,
    variant: { departure: Embarkation; arrival: Embarkation },
    context: CombinedContext,
    speedKmh: number,
): VerifiedVariant | null {
    const approach = getCachedGroundRoute(from, variant.departure.point, context);
    const exit = getCachedGroundRoute(variant.arrival.point, to, context);
    const sea = getCachedSeaEstimate(variant.departure.point, variant.arrival.point, context);

    if (sea === null
        || (!approach && !isSamePosition(from, variant.departure.point))
        || (!exit && !isSamePosition(variant.arrival.point, to))) {
        return null;
    }

    return {
        ...variant,
        time: getCostTimeHours(approach?.cost ?? 0, speedKmh)
            + getCostTimeHours(sea, SpeedKmH.ship)
            + getCostTimeHours(exit?.cost ?? 0, speedKmh),
    };
}

function pickFastest(variants: VerifiedVariant[]): VerifiedVariant | null {
    return variants.reduce(
        (winner, variant) => !winner || variant.time < winner.time ? variant : winner,
        null as VerifiedVariant | null,
    );
}

function buildCombinedRoute(
    from: Position,
    to: Position,
    departure: Embarkation,
    arrival: Embarkation,
    context: CombinedContext,
    speedKmh: number,
): RouteResult | null {
    const approach = getCachedGroundRoute(from, departure.point, context);
    const exit = getCachedGroundRoute(arrival.point, to, context);
    const sea = getCachedSeaRoute(departure.point, arrival.point, context);
    if (approach === null && !isSamePosition(from, departure.point)) {
        return null;
    }
    if (exit === null && !isSamePosition(arrival.point, to)) {
        return null;
    }
    if (!sea) {
        return null;
    }

    const route = anchorRoute(combineRoutes(approach, sea, exit), from, to);

    return route
        ? toRouteResult(route, speedKmh, {
            fromId: departure.port?.id ?? null,
            toId: arrival.port?.id ?? null,
        })
        : null;
}

function getCachedSeaRoute(from: Position, to: Position, context: CombinedContext): PlannedRoute | null {
    return getCachedRoute(from, to, context.seaRoutes, () => buildSeaRoute(from, to, context.index));
}

function getCachedSeaEstimate(from: Position, to: Position, context: CombinedContext): number | null {
    const key = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
    if (!context.seaEstimates.has(key)) {
        context.seaEstimates.set(key, estimateSeaCost(from, to, context.index));
    }

    return context.seaEstimates.get(key);
}

function getCachedGroundRoute(from: Position, to: Position, context: CombinedContext): PlannedRoute | null {
    return isSamePosition(from, to)
        ? null
        : getCachedRoute(from, to, context.groundRoutes,
            () => planGroundRoute(from, to, context.index, context.roadNetwork));
}

function getCachedRoute(
    from: Position,
    to: Position,
    cache: Map<string, PlannedRoute | null>,
    build: () => PlannedRoute | null,
): PlannedRoute | null {
    const key = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
    if (!cache.has(key)) {
        cache.set(key, build());
    }

    return cache.get(key);
}

function findEmbarkationPoints(
    endpoint: Position,
    other: Position,
    index: RoutingIndex,
): EmbarkationPoint[] {
    if (isNavigable(endpoint, index)) {
        return [{ port: null, point: endpoint }];
    }

    const landmass = getLandmass(endpoint, index.land);
    if (landmass === null) {
        return [];
    }

    const ports = index.ports.filter(port => port.landmass === landmass);

    return ports.length
        ? ports.map(port => ({ port, point: port.point }))
        : takeNearestLandings(findLandingPoints(landmass, index), endpoint, other);
}

function priceEmbarkations(
    endpoint: Position,
    candidates: EmbarkationPoint[],
    index: RoutingIndex,
): Embarkation[] {
    if (candidates.every(candidate => isSamePosition(endpoint, candidate.point))) {
        return markPreferredEmbarkations(candidates.map(candidate => ({ ...candidate, cost: 0, eligible: true })));
    }

    const points = [endpoint, ...candidates.map(candidate => candidate.point)];
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const grid = buildGrid(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
        PORT_PRICING_CELL_BUDGET,
    );

    const k = rasterizeGrid(grid, index);
    const placedEndpoint = placePassablePoint(endpoint, grid, index, k);
    if (!placedEndpoint) {
        return [];
    }

    const placed = candidates.map(candidate => placePassablePoint(candidate.point, grid, index, k));
    const costs = computeGridCosts(grid, k, placedEndpoint, placed.filter(cell => cell !== null));

    const priced = candidates
        .map((candidate, at) => {
            if (isSamePosition(endpoint, candidate.point)) {
                return { ...candidate, cost: 0, eligible: true };
            }

            const cell = placed[at];
            const cost = cell ? costs[toFlatIndex(grid, cell.col, cell.row)] : Infinity;

            return isFinite(cost) ? { ...candidate, cost, eligible: true } : null;
        })
        .filter((embarkation): embarkation is Embarkation => embarkation !== null);

    return markPreferredEmbarkations(priced);
}

function takeNearestLandings(
    landings: Position[],
    endpoint: Position,
    other: Position,
): EmbarkationPoint[] {
    return [...landings]
        .sort((a, b) => getJourneyBound(endpoint, a, other) - getJourneyBound(endpoint, b, other))
        .slice(0, LANDING_CANDIDATE_COUNT)
        .map(point => ({ port: null, point }));
}

function getJourneyBound(endpoint: Position, candidate: Position, other: Position): number {
    return getStraightTimeHours(endpoint, candidate, SpeedKmH.horse)
        + getStraightTimeHours(candidate, other, SpeedKmH.ship);
}

function markPreferredEmbarkations(candidates: Embarkation[]): Embarkation[] {
    if (!candidates.length) {
        return candidates;
    }

    const nearest = Math.min(...candidates.map(candidate => candidate.cost));
    const band = candidates.filter(candidate => candidate.cost <= nearest * PORT_APPROACH_BAND);
    const bestRank = Math.min(...band.map(candidate => getPortRank(candidate.port)));

    return candidates.map(candidate => ({
        ...candidate,
        eligible: candidate.cost > nearest * PORT_APPROACH_BAND || getPortRank(candidate.port) === bestRank,
    }));
}

function getPortRank(port: IndexedPort | null): number {
    const rank = port ? PORT_TYPE_PRIORITY.indexOf(port.type) : -1;

    return rank === -1 ? PORT_TYPE_PRIORITY.length : rank;
}

function findLandingPoints(landmass: number, index: RoutingIndex): Position[] {
    const points: Position[] = [];

    for (const area of index.land.filter(candidate => candidate.landmass === landmass)) {
        for (const [outerRing] of getAreaRings(area)) {
            const inward = getRingOrientation(outerRing);

            for (let i = 0; i < outerRing.length - 1; i++) {
                const inset = getInsetPoint(outerRing[i], outerRing[i + 1], inward);
                const isSpaced = points.every(kept => heuristic(kept, inset) > LANDING_SPACING);

                if (isSpaced && getLandmass(inset, index.land) === landmass) {
                    points.push(inset);
                }
            }
        }
    }

    return points;
}

function getAreaRings(area: { geometry: { type: string; coordinates: unknown } }): Position[][][] {
    return area.geometry.type === 'Polygon'
        ? [area.geometry.coordinates as Position[][]]
        : (area.geometry.coordinates as Position[][][]);
}

function getRingOrientation(ring: Position[]): number {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }

    return area >= 0 ? 1 : -1;
}

function getInsetPoint(from: Position, to: Position, inward: number): Position {
    const length = heuristic(from, to) || 1;
    const normal = [-(to[1] - from[1]) / length, (to[0] - from[0]) / length];

    return [
        (from[0] + to[0]) / 2 + inward * normal[0] * LANDING_INSET,
        (from[1] + to[1]) / 2 + inward * normal[1] * LANDING_INSET,
    ];
}

function placePassablePoint(
    point: Position,
    grid: Grid,
    index: RoutingIndex,
    k: Float64Array,
): CellIndex | null {
    const cell = placePoint(point, grid, index, k);
    if (!cell) {
        return null;
    }

    return k[toFlatIndex(grid, cell.col, cell.row)] === IMPASSABLE
        ? findNearestPassableCell(grid, k, cell)
        : cell;
}

function getCostTimeHours(cost: number, speedKmh: number): number {
    return (cost * KM_PER_COORD_UNIT) / speedKmh;
}

function planGroundRoute(
    from: Position,
    to: Position,
    index: RoutingIndex,
    roadNetwork: RoadNetwork | null,
): PlannedRoute | null {
    if (!isOnOneLandmass(from, to, index)) {
        return null;
    }

    if (!roadNetwork) {
        return anchorRoute(buildGridRoute(from, to, index), from, to);
    }

    const context = createPlanContext(index, roadNetwork);
    const fromAnchor = findNetworkAnchor(from, roadNetwork);
    const toAnchor = findNetworkAnchor(to, roadNetwork);
    if (!fromAnchor || !toAnchor) {
        return anchorRoute(context.gridRoute(from, to), from, to);
    }

    const fromOnNetwork = fromAnchor.distance <= ON_NETWORK_EPS;
    const toOnNetwork = toAnchor.distance <= ON_NETWORK_EPS;
    const sameGroup = fromAnchor.group === toAnchor.group;

    const roadRoute = sameGroup
        ? planSameGroupRoute(from, to, context, fromAnchor, toAnchor, fromOnNetwork, toOnNetwork)
        : planCrossGroupRoute(from, to, context, fromAnchor, toAnchor, fromOnNetwork, toOnNetwork);

    if (roadRoute) {
        const allowed = getRoadTimeTolerance(getRoadShare(roadRoute)) * heuristic(from, to);
        if (roadRoute.cost <= allowed) {
            return anchorRoute(roadRoute, from, to);
        }
    }

    const direct = context.gridRoute(from, to);
    if (!roadRoute || !direct) {
        return anchorRoute(roadRoute ?? direct, from, to);
    }

    const useRoad = roadRoute.cost <= getRoadTimeTolerance(getRoadShare(roadRoute)) * direct.cost;

    return anchorRoute(useRoad ? roadRoute : direct, from, to);
}

function isOnOneLandmass(from: Position, to: Position, index: RoutingIndex): boolean {
    const fromLandmass = getLandmass(from, index.land);

    return fromLandmass !== null && fromLandmass === getLandmass(to, index.land);
}

function planSameGroupRoute(
    from: Position,
    to: Position,
    context: PlanContext,
    fromAnchor: NetworkAnchor,
    toAnchor: NetworkAnchor,
    fromOnNetwork: boolean,
    toOnNetwork: boolean,
): PlannedRoute | null {
    const entries = fromOnNetwork ? [onNetworkEntry(fromAnchor)] : findCostedCandidates(context, from);
    const exits = toOnNetwork ? [onNetworkEntry(toAnchor)] : findCostedCandidates(context, to);

    return planRoadMiddleRoute(from, to, context, entries, exits);
}

function planCrossGroupRoute(
    from: Position,
    to: Position,
    context: PlanContext,
    fromAnchor: NetworkAnchor,
    toAnchor: NetworkAnchor,
    fromOnNetwork: boolean,
    toOnNetwork: boolean,
): PlannedRoute | null {
    if (!fromOnNetwork || !toOnNetwork) {
        return null;
    }

    const { roadNetwork } = context;
    const exits = [
        onNetworkEntry(fromAnchor),
        ...thinCandidates(roadNetwork, findNearestNodesInGroup(roadNetwork, fromAnchor.group, to, CANDIDATE_COUNT)),
    ];
    const entries = [
        onNetworkEntry(toAnchor),
        ...thinCandidates(roadNetwork, findNearestNodesInGroup(roadNetwork, toAnchor.group, from, CANDIDATE_COUNT)),
    ];

    const fromDistances = getNetworkDistances(roadNetwork, fromAnchor.node);
    const toDistances = getNetworkDistances(roadNetwork, toAnchor.node);
    const components = findNodeComponents(context, [...exits, ...entries]);

    const variants: { exit: RoadCandidate; entry: RoadCandidate; bound: number }[] = [];
    for (const exit of exits) {
        const toExit = fromDistances[exit.node];
        if (!isFinite(toExit)) {
            continue;
        }
        for (const entry of entries) {
            const fromEntry = toDistances[entry.node];
            if (!isFinite(fromEntry)) {
                continue;
            }
            const exitComponent = components.get(exit.node);
            if (exitComponent === undefined || exitComponent !== components.get(entry.node)) {
                continue;
            }
            const exitPoint = roadNetwork.nodes[exit.node];
            const entryPoint = roadNetwork.nodes[entry.node];
            const gap = Math.hypot(exitPoint[0] - entryPoint[0], exitPoint[1] - entryPoint[1]);
            variants.push({ exit, entry, bound: toExit + gap + fromEntry });
        }
    }

    return pickCheapestVariant(variants, variant => {
        const leadIn = findNetworkPath(roadNetwork, fromAnchor.node, variant.exit.node);
        const leadOut = findNetworkPath(roadNetwork, variant.entry.node, toAnchor.node);
        if (!leadIn || !leadOut) {
            return null;
        }

        const gapLeg = context.gridRoute(roadNetwork.nodes[variant.exit.node], roadNetwork.nodes[variant.entry.node]);
        if (!gapLeg) {
            return null;
        }

        return combineRoutes(
            leadIn.distance > 0 && roadSegmentRoute(leadIn),
            gapLeg,
            leadOut.distance > 0 && roadSegmentRoute(leadOut),
        );
    });
}

function planRoadMiddleRoute(
    from: Position,
    to: Position,
    context: PlanContext,
    entries: RoadCandidate[],
    exits: RoadCandidate[],
): PlannedRoute | null {
    const { roadNetwork } = context;
    const variants: { entry: RoadCandidate; exit: RoadCandidate; bound: number }[] = [];

    for (const entry of entries) {
        const distances = getNetworkDistances(roadNetwork, entry.node);
        for (const exit of exits) {
            const roadDistance = distances[exit.node];
            if (!isFinite(roadDistance) || roadDistance === 0) {
                continue;
            }
            variants.push({ entry, exit, bound: entry.distance + roadDistance + exit.distance });
        }
    }

    return pickCheapestVariant(variants, variant => {
        const roadPath = findNetworkPath(roadNetwork, variant.entry.node, variant.exit.node);
        if (!roadPath) {
            return null;
        }

        const entryLeg = variant.entry.distance > 0 ? context.gridRoute(from, roadPath.path[0]) : null;
        if (variant.entry.distance > 0 && !entryLeg) {
            return null;
        }

        const exitLeg = variant.exit.distance > 0
            ? context.gridRoute(roadPath.path[roadPath.path.length - 1], to)
            : null;
        if (variant.exit.distance > 0 && !exitLeg) {
            return null;
        }

        return combineRoutes(entryLeg, roadSegmentRoute(roadPath), exitLeg);
    });
}

function pickCheapestVariant<T extends { bound: number }>(
    variants: T[],
    build: (variant: T) => PlannedRoute | null,
): PlannedRoute | null {
    variants.sort((a, b) => a.bound - b.bound);

    let best: PlannedRoute | null = null;

    for (const variant of variants) {
        if (best && variant.bound >= best.cost) {
            break;
        }

        const route = build(variant);
        if (route && (!best || route.cost < best.cost)) {
            best = route;
        }
    }

    return best;
}

function onNetworkEntry(anchor: NetworkAnchor): RoadCandidate {
    return { node: anchor.node, distance: 0 };
}

function findCostedCandidates(context: PlanContext, point: Position): RoadCandidate[] {
    const { index, roadNetwork } = context;
    const anchor = findNetworkAnchor(point, roadNetwork);
    if (!anchor) {
        return [];
    }

    const nearest = findNearestNodesInGroup(roadNetwork, anchor.group, point, CANDIDATE_COUNT);
    if (!nearest.length) {
        return [];
    }

    const points = [point, ...nearest.map(candidate => roadNetwork.nodes[candidate.node])];
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const corners: [Position, Position] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
    ];

    for (const { marginRatio, minMargin, cellBudget } of MARGIN_RETRY_STEPS) {
        const grid = buildGrid(corners[0], corners[1], cellBudget, marginRatio, minMargin);
        const costed = costCandidatesOnGrid(grid, index, roadNetwork, point, anchor.group);

        if (costed.length) {
            return costed;
        }
    }

    return [];
}

function costCandidatesOnGrid(
    grid: Grid,
    index: RoutingIndex,
    roadNetwork: RoadNetwork,
    point: Position,
    group: number,
): RoadCandidate[] {
    const k = rasterizeGrid(grid, index);
    const placedPoint = placePoint(point, grid, index, k);
    if (!placedPoint) {
        return [];
    }

    const costs = computeGridCosts(grid, k, placedPoint);
    const reachable: RoadCandidate[] = [];

    roadNetwork.nodes.forEach((position, node) => {
        if (roadNetwork.nodeGroups[node] !== group) {
            return;
        }

        const cell = getCellIndexAt(grid, position);
        const cost = cell ? costs[toFlatIndex(grid, cell.col, cell.row)] : Infinity;

        if (isFinite(cost)) {
            reachable.push({ node, distance: cost });
        }
    });

    return thinCandidates(roadNetwork, reachable.sort((a, b) => a.distance - b.distance))
        .slice(0, CANDIDATE_COUNT);
}

function thinCandidates(roadNetwork: RoadNetwork, candidates: RoadCandidate[]): RoadCandidate[] {
    const kept: RoadCandidate[] = [];

    for (const candidate of candidates) {
        const point = roadNetwork.nodes[candidate.node];
        const isDistinct = kept.every(other => {
            const keptPoint = roadNetwork.nodes[other.node];
            return Math.hypot(point[0] - keptPoint[0], point[1] - keptPoint[1]) > CANDIDATE_SPACING;
        });

        if (isDistinct) {
            kept.push(candidate);
        }
    }

    return kept;
}

function findNodeComponents(context: PlanContext, candidates: RoadCandidate[]): Map<number, number> {
    const { index, roadNetwork } = context;
    const points = candidates.map(candidate => roadNetwork.nodes[candidate.node]);
    if (!points.length) {
        return new Map();
    }

    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const grid = buildGrid(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
    );

    const k = rasterizeGrid(grid, index);
    const labels = labelComponents(grid, k);
    const components = new Map<number, number>();

    for (const candidate of candidates) {
        const placed = placePoint(roadNetwork.nodes[candidate.node], grid, index, k);
        if (placed) {
            components.set(candidate.node, getCellLabel(grid, labels, placed));
        }
    }

    return components;
}

const JOINT_EPSILON = 1e-9;

function isSamePosition(a: Position, b: Position): boolean {
    return Math.abs(a[0] - b[0]) <= JOINT_EPSILON && Math.abs(a[1] - b[1]) <= JOINT_EPSILON;
}

function anchorRoute(route: PlannedRoute | null, from: Position, to: Position): PlannedRoute | null {
    if (!route) {
        return null;
    }

    const legs: PlannedLeg[] = route.legs.map(leg => ({ ...leg, path: [] }));
    const path: Position[] = [];

    const append = (position: Position, leg: PlannedLeg | undefined) => {
        if (path.length > 0 && isSamePosition(path[path.length - 1], position)) {
            return;
        }
        path.push(position);
        leg?.path.push(position);
    };

    append(from, legs[0]);
    route.legs.forEach((leg, index) => leg.path.forEach(position => append(position, legs[index])));
    append(to, legs[legs.length - 1]);

    for (const [index, leg] of legs.entries()) {
        const added = getPathLength(leg.path) - getPathLength(route.legs[index].path);
        const previous = legs[index - 1];
        const joint = previous?.path.length && leg.path.length
            ? Math.hypot(
                leg.path[0][0] - previous.path[previous.path.length - 1][0],
                leg.path[0][1] - previous.path[previous.path.length - 1][1],
            )
            : 0;

        leg.cost += chargeLength(Math.max(0, added) + joint, route.legs[index]);
    }

    return { path, cost: legs.reduce((total, leg) => total + leg.cost, 0), legs };
}

function chargeLength(length: number, leg: PlannedLeg): number {
    if (length <= 0) {
        return 0;
    }

    const legLength = getPathLength(leg.path);
    const averageK = legLength > 0 && leg.cost > 0 ? legLength / leg.cost : TerrainK.Default;

    return length / averageK;
}

function getPathLength(path: Position[]): number {
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
        length += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    return length;
}

function combineRoutes(...pieces: (PlannedRoute | null | false)[]): PlannedRoute {
    const combined: PlannedRoute = { path: [], cost: 0, legs: [] };

    for (const piece of pieces) {
        if (!piece) {
            continue;
        }
        combined.path.push(...piece.path);
        combined.legs.push(...piece.legs);
        combined.cost += piece.cost;
    }

    return combined;
}

function roadSegmentRoute(roadPath: RoadNetworkPath): PlannedRoute {
    return {
        path: roadPath.path,
        cost: roadPath.distance,
        legs: [{ kind: 'road', path: roadPath.path, cost: roadPath.distance }],
    };
}

function buildGridRoute(gridFrom: Position, gridTo: Position, index: RoutingIndex): PlannedRoute | null {
    const { groundPath, grid, k, isCoarse } = findGroundPathWithRetry(gridFrom, gridTo, index);
    if (!groundPath) {
        return null;
    }

    const simplifiedPath = simplifyPath(
        groundPath.path,
        grid.cellSize * SIMPLIFY_EPSILON_FACTOR,
        getGroundClearance(index, grid.cellSize),
    );
    const smoothedGridPath = pullTautPath(simplifiedPath, getGroundPassability(index, grid.cellSize));
    if (isCoarse && !staysOnLand(smoothedGridPath, index)) {
        return null;
    }

    const cost = measurePathCost(smoothedGridPath, grid, k);

    return {
        path: smoothedGridPath,
        cost,
        legs: [{ kind: 'grid', path: smoothedGridPath, cost }],
    };
}

const LAND_CHECK_SPACING = MIN_CELL_SIZE;

function staysOnLand(path: Position[], index: RoutingIndex): boolean {
    for (let i = 0; i < path.length - 1; i++) {
        const steps = Math.ceil(heuristic(path[i], path[i + 1]) / LAND_CHECK_SPACING);

        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            const point: Position = [
                path[i][0] + (path[i + 1][0] - path[i][0]) * t,
                path[i][1] + (path[i + 1][1] - path[i][1]) * t,
            ];

            if (!isPointInAreas(point, index.land) || isPointInAreas(point, index.lakes)) {
                return false;
            }
        }
    }

    return true;
}

const COST_SAMPLE_FACTOR = 0.5;

function measurePathCost(path: Position[], grid: Grid, k: Float64Array): number {
    let cost = 0;
    let lastK = TerrainK.Default;

    for (let i = 0; i < path.length - 1; i++) {
        const [from, to] = [path[i], path[i + 1]];
        const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const steps = Math.max(1, Math.ceil(distance / (grid.cellSize * COST_SAMPLE_FACTOR)));
        const stepLength = distance / steps;

        for (let step = 0; step < steps; step++) {
            const t = (step + 0.5) / steps;
            const cell = getCellIndexAt(grid, [
                from[0] + (to[0] - from[0]) * t,
                from[1] + (to[1] - from[1]) * t,
            ]);
            const sampled = cell ? k[toFlatIndex(grid, cell.col, cell.row)] : IMPASSABLE;
            if (sampled !== IMPASSABLE) {
                lastK = sampled;
            }
            cost += stepLength / lastK;
        }
    }

    return cost;
}

function findGroundPathWithRetry(
    from: Position,
    to: Position,
    index: RoutingIndex,
): { groundPath: PathResult | null; grid: Grid; k: Float64Array; isCoarse: boolean } {
    let grid: Grid;
    let k: Float64Array;

    for (const [step, { marginRatio, minMargin, cellBudget }] of MARGIN_RETRY_STEPS.entries()) {
        grid = buildGrid(from, to, cellBudget, marginRatio, minMargin);
        k = rasterizeGrid(grid, index);
        const placedFrom = placePoint(from, grid, index, k);
        const placedTo = placePoint(to, grid, index, k);

        if (!placedFrom || !placedTo) {
            continue;
        }

        const labels = labelComponents(grid, k);
        if (getCellLabel(grid, labels, placedFrom) !== getCellLabel(grid, labels, placedTo)) {
            continue;
        }

        const groundPath = findPath(grid, k, placedFrom, placedTo);
        if (groundPath) {
            return { groundPath, grid, k, isCoarse: step > 0 };
        }
    }

    return { groundPath: null, grid, k, isCoarse: false };
}

function getCellLabel(grid: Grid, labels: Int32Array, { col, row }: CellIndex): number {
    return labels[toFlatIndex(grid, col, row)];
}

function toRouteResult(route: PlannedRoute, speedKmh: number, ports?: RoutePorts): RouteResult {
    const legs: RouteLeg[] = route.legs.map((leg, index) => ({
        ...leg,
        distanceKm: getPathDistanceKm(leg.path) + getJointDistanceKm(route.legs[index - 1], leg),
        timeHours: getLegTimeHours(leg, speedKmh),
    }));

    return {
        path: route.path,
        distanceKm: getPathDistanceKm(route.path),
        timeHours: legs.reduce((total, leg) => total + leg.timeHours, 0),
        legs,
        ports,
    };
}

function getJointDistanceKm(previous: PlannedLeg | undefined, leg: PlannedLeg): number {
    return previous?.path.length && leg.path.length
        ? getPathDistanceKm([previous.path[previous.path.length - 1], leg.path[0]])
        : 0;
}

function getLegTimeHours(leg: PlannedLeg, speedKmh: number): number {
    return (leg.cost * KM_PER_COORD_UNIT) / (leg.kind === 'sea' ? SpeedKmH.ship : speedKmh);
}

function getStraightTimeHours(from: Position, to: Position, speedKmh: number): number {
    return (heuristic(from, to) * KM_PER_COORD_UNIT) / speedKmh;
}

function getPathDistanceKm(path: Position[]): number {
    let totalCoordDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
        totalCoordDistance += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }

    return totalCoordDistance * KM_PER_COORD_UNIT;
}

export function simplifyPath(
    path: Position[],
    epsilon: number,
    isShortcutPassable?: SegmentPassability,
): Position[] {
    if (path.length < 3) {
        return path;
    }

    const first = path[0];
    const last = path[path.length - 1];
    let maxDistance = 0;
    let maxIndex = 0;

    for (let i = 1; i < path.length - 1; i++) {
        const distance = pointToSegmentDistance(path[i], first, last);
        if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = i;
        }
    }

    if (maxDistance <= epsilon && (!isShortcutPassable || isShortcutPassable(first, last))) {
        return [first, last];
    }

    const splitIndex = maxDistance > epsilon ? maxIndex : Math.floor((path.length - 1) / 2);
    const left = simplifyPath(path.slice(0, splitIndex + 1), epsilon, isShortcutPassable);
    const right = simplifyPath(path.slice(splitIndex), epsilon, isShortcutPassable);

    return [...left.slice(0, -1), ...right];
}

const VISIBILITY_SAMPLE_FACTOR = 0.5;
const MAX_PULL_DISTANCE_CELLS = 10;

export type SegmentPassability = (from: Position, to: Position) => boolean;

export function pullTautPath(path: Position[], isShortcutPassable: SegmentPassability): Position[] {
    if (path.length < 3) {
        return path;
    }

    const taut: Position[] = [path[0]];
    let anchor = 0;

    while (anchor < path.length - 1) {
        let farthest = anchor + 1;

        while (farthest + 1 < path.length && isShortcutPassable(path[anchor], path[farthest + 1])) {
            farthest++;
        }

        taut.push(path[farthest]);
        anchor = farthest;
    }

    return taut;
}

export function getGroundClearance(index: RoutingIndex, cellSize: number): SegmentPassability {
    return (from, to) => everySample(from, to, cellSize, point => isPassablePoint(point, index, cellSize));
}

export function getGroundPassability(index: RoutingIndex, cellSize: number): SegmentPassability {
    const isClear = getGroundClearance(index, cellSize);

    return (from, to) => isWithinPullDistance(from, to, cellSize) && isClear(from, to);
}

function getSeaPassability(index: RoutingIndex, grid: Grid, k: Float64Array): SegmentPassability {
    return (from, to) => isWithinPullDistance(from, to, grid.cellSize)
        && everySample(from, to, grid.cellSize, point => getCellK(grid, k, point) !== IMPASSABLE)
        && keepsSeaClearance(from, to, index);
}

function isWithinPullDistance(from: Position, to: Position, cellSize: number): boolean {
    return Math.hypot(to[0] - from[0], to[1] - from[1]) <= cellSize * MAX_PULL_DISTANCE_CELLS;
}

function everySample(
    from: Position,
    to: Position,
    cellSize: number,
    isPassable: (point: Position) => boolean,
): boolean {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const sampleCount = Math.ceil(distance / (cellSize * VISIBILITY_SAMPLE_FACTOR));

    for (let i = 1; i < sampleCount; i++) {
        const t = i / sampleCount;

        if (!isPassable([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])) {
            return false;
        }
    }

    return true;
}

function getCellK(grid: Grid, k: Float64Array, point: Position): number {
    const cell = getCellIndexAt(grid, point);

    return cell ? k[toFlatIndex(grid, cell.col, cell.row)] : IMPASSABLE;
}
