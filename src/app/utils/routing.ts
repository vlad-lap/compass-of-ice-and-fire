import { Position } from 'geojson';
import {
    CellIndex,
    Grid,
    PathResult,
    RoadNetwork,
    RouteLeg,
    RoutePlan,
    RouteResult,
    RoutingGeodata,
    RoutingIndex,
} from '../models';
import {
    BBOX_MARGIN_RATIO,
    DEFAULT_CELL_BUDGET,
    MIN_BBOX_MARGIN,
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
    IMPASSABLE,
    TerrainK,
    isPointInAreas,
    labelComponents,
    pointToSegmentDistance,
    rasterizeGrid,
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
import { KM_PER_COORD_UNIT } from '../components/map-page/constants';

export enum SpeedKmH {
    foot = 4,
    horse = 8,
    dragon = 100,
}

const ON_NETWORK_EPS = 0.2;

const ROAD_TIME_TOLERANCE = 3;

function getRoadTimeTolerance(roadShare: number): number {
    return 1 + (ROAD_TIME_TOLERANCE - 1) * roadShare;
}

function getRoadShare(route: GroundRoute): number {
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

export function computeGridCosts(grid: Grid, k: Float64Array, start: CellIndex): Float64Array {
    const cells = grid.cols * grid.rows;
    const gScore = new Float64Array(cells).fill(Infinity);
    const visited = new Uint8Array(cells);
    const startFlat = toFlatIndex(grid, start.col, start.row);

    if (k[startFlat] === IMPASSABLE) {
        return gScore;
    }

    gScore[startFlat] = 0;
    const open = new NumericMinHeap();
    open.push(0, startFlat);

    while (open.size > 0) {
        const currentFlat = open.pop();
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

function findNearestPassableCell(grid: Grid, k: Float64Array, origin: CellIndex): CellIndex | null {
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

                if (k[flatIndex] !== IMPASSABLE) {
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

    return {
        foot: groundRoute ? toRouteResult(groundRoute, SpeedKmH.foot) : null,
        horse: groundRoute ? toRouteResult(groundRoute, SpeedKmH.horse) : null,
        dragon: calculateDragonRoute(from, to),
        legs: groundRoute ? groundRoute.legs : [],
    };
}

interface RoadCandidate {
    node: number;
    distance: number;
}

interface PlanContext {
    index: RoutingIndex;
    roadNetwork: RoadNetwork;
    gridRoute: (from: Position, to: Position) => GroundRoute | null;
}

function createPlanContext(index: RoutingIndex, roadNetwork: RoadNetwork): PlanContext {
    const legs = new Map<string, GroundRoute | null>();

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

interface GroundRoute {
    path: Position[];
    cost: number;
    legs: RouteLeg[];
}

function planGroundRoute(
    from: Position,
    to: Position,
    index: RoutingIndex,
    roadNetwork: RoadNetwork | null,
): GroundRoute | null {
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
): GroundRoute | null {
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
): GroundRoute | null {
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
): GroundRoute | null {
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
    build: (variant: T) => GroundRoute | null,
): GroundRoute | null {
    variants.sort((a, b) => a.bound - b.bound);

    let best: GroundRoute | null = null;

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

    const nearest = thinCandidates(
        roadNetwork,
        findNearestNodesInGroup(roadNetwork, anchor.group, point, CANDIDATE_COUNT),
    );
    if (!nearest.length) {
        return [];
    }

    const points = [point, ...nearest.map(candidate => roadNetwork.nodes[candidate.node])];
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const grid = buildGrid(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
    );

    const k = rasterizeGrid(grid, index);
    const placedPoint = placePoint(point, grid, index, k);
    if (!placedPoint) {
        return [];
    }

    const costs = computeGridCosts(grid, k, placedPoint);

    return nearest
        .map(candidate => {
            const placed = placePoint(roadNetwork.nodes[candidate.node], grid, index, k);
            if (!placed) {
                return null;
            }
            const cost = costs[toFlatIndex(grid, placed.col, placed.row)];
            return isFinite(cost) ? { node: candidate.node, distance: cost } : null;
        })
        .filter((candidate): candidate is RoadCandidate => candidate !== null);
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

function anchorRoute(route: GroundRoute | null, from: Position, to: Position): GroundRoute | null {
    if (!route) {
        return null;
    }

    const legs: RouteLeg[] = route.legs.map(leg => ({ ...leg, path: [] }));
    const path: Position[] = [];

    const append = (position: Position, leg: RouteLeg | undefined) => {
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

function chargeLength(length: number, leg: RouteLeg): number {
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

function combineRoutes(...pieces: (GroundRoute | null | false)[]): GroundRoute {
    const combined: GroundRoute = { path: [], cost: 0, legs: [] };

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

function roadSegmentRoute(roadPath: RoadNetworkPath): GroundRoute {
    return {
        path: roadPath.path,
        cost: roadPath.distance,
        legs: [{ kind: 'road', path: roadPath.path, cost: roadPath.distance }],
    };
}

function buildGridRoute(gridFrom: Position, gridTo: Position, index: RoutingIndex): GroundRoute | null {
    const { groundPath, grid, k } = findGroundPathWithRetry(gridFrom, gridTo, index);
    if (!groundPath) {
        return null;
    }

    const simplifiedPath = simplifyPath(groundPath.path, grid.cellSize * SIMPLIFY_EPSILON_FACTOR);
    const smoothedGridPath = pullTautPath(simplifiedPath, index, grid.cellSize);
    const cost = measurePathCost(smoothedGridPath, grid, k);

    return {
        path: smoothedGridPath,
        cost,
        legs: [{ kind: 'grid', path: smoothedGridPath, cost }],
    };
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
): { groundPath: PathResult | null; grid: Grid; k: Float64Array } {
    let grid: Grid;
    let k: Float64Array;

    for (const { marginRatio, minMargin, cellBudget } of MARGIN_RETRY_STEPS) {
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
            return { groundPath, grid, k };
        }
    }

    return { groundPath: null, grid, k };
}

function getCellLabel(grid: Grid, labels: Int32Array, { col, row }: CellIndex): number {
    return labels[toFlatIndex(grid, col, row)];
}

function toRouteResult(route: GroundRoute, speedKmh: number): RouteResult {
    return {
        path: route.path,
        distanceKm: getPathDistanceKm(route.path),
        timeHours: (route.cost * KM_PER_COORD_UNIT) / speedKmh,
    };
}

function getPathDistanceKm(path: Position[]): number {
    let totalCoordDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
        totalCoordDistance += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }

    return totalCoordDistance * KM_PER_COORD_UNIT;
}

export function simplifyPath(path: Position[], epsilon: number): Position[] {
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

    if (maxDistance <= epsilon) {
        return [first, last];
    }

    const left = simplifyPath(path.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(path.slice(maxIndex), epsilon);

    return [...left.slice(0, -1), ...right];
}

const VISIBILITY_SAMPLE_FACTOR = 0.5;
const MAX_PULL_DISTANCE_CELLS = 10;

export function pullTautPath(path: Position[], index: RoutingIndex, cellSize: number): Position[] {
    if (path.length < 3) {
        return path;
    }

    const taut: Position[] = [path[0]];
    let anchor = 0;

    while (anchor < path.length - 1) {
        let farthest = anchor + 1;

        while (farthest + 1 < path.length && isSegmentPassable(path[anchor], path[farthest + 1], index, cellSize)) {
            farthest++;
        }

        taut.push(path[farthest]);
        anchor = farthest;
    }

    return taut;
}

function isSegmentPassable(from: Position, to: Position, index: RoutingIndex, cellSize: number): boolean {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (distance > cellSize * MAX_PULL_DISTANCE_CELLS) {
        return false;
    }

    const sampleCount = Math.ceil(distance / (cellSize * VISIBILITY_SAMPLE_FACTOR));

    for (let i = 1; i < sampleCount; i++) {
        const t = i / sampleCount;
        const point: Position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

        if (classifyCell(point, index, cellSize) === null) {
            return false;
        }
    }

    return true;
}
