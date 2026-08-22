import { Feature, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import { flatten } from 'lodash';
import {
    BarrierCrossing,
    BBox,
    Grid,
    IndexedArea,
    IndexedBarrier,
    IndexedLandmass,
    RoutingGeodata,
    RoutingIndex,
} from '../models';
import { getGeometryPositions, pointInPolygon } from './geometry';
import {
    getCellCenter,
    getColAtLng,
    getRowAtLat,
    MIN_CELL_SIZE,
    NEIGHBOR_OFFSETS,
    toFlatIndex,
} from './grid';
import { MapBounds } from '../components/map-page/constants';

export const MOUNTAIN_K_BY_HEIGHT: Record<number, number> = { 1: 0.5, 2: 0.35, 3: 0.2 };

export enum TerrainK {
    Swamp = 0.3,
    Desert = 0.7,
    Forest = 0.9,
    Default = 1,
}

export const IMPASSABLE = 0;

export const RIVER_BAND_FACTOR = Math.SQRT2 / 2;

export const CROSSING_GATE_RADIUS = 0.02;
export const CROSSING_GATE_FACTOR = 1.5;

export function getCrossingGateRadius(cellSize: number): number {
    return Math.max(CROSSING_GATE_RADIUS, cellSize * CROSSING_GATE_FACTOR);
}

const BLOCKING_RIVER_SIZES = [2, 3];

export function buildRoutingIndex(geodata: RoutingGeodata): RoutingIndex {
    const dryLakes = geodata.lakes.features.filter(feature => feature.properties?.variant === 'dry');
    const wetLakes = geodata.lakes.features.filter(feature => feature.properties?.variant !== 'dry');

    return {
        land: indexLandmasses([...geodata.continents.features, ...geodata.islands.features]),
        mountains: geodata.mountains.features.map(feature =>
            indexArea(feature, MOUNTAIN_K_BY_HEIGHT[feature.properties?.height] ?? TerrainK.Default),
        ),
        swamps: geodata.swamps.features.map(feature => indexArea(feature, TerrainK.Swamp)),
        deserts: [
            ...geodata.deserts.features.map(feature => indexArea(feature, TerrainK.Desert)),
            ...dryLakes.map(feature => indexArea(feature, TerrainK.Desert)),
        ],
        forests: geodata.forests.features.map(feature => indexArea(feature, TerrainK.Forest)),
        lakes: wetLakes.map(feature => indexArea(feature, null)),
        barriers: [
            ...geodata.rivers.features
                .filter(feature => BLOCKING_RIVER_SIZES.includes(feature.properties?.size)),
            ...geodata.theWall.features,
        ].map(feature => indexBarrier(feature, geodata.barrierCrossings)),
    };
}

export function isWithinMapBounds([lng, lat]: Position): boolean {
    return lng >= MapBounds.West && lng <= MapBounds.East
        && lat >= MapBounds.South && lat <= MapBounds.North;
}

export function classifyCell(point: Position, index: RoutingIndex, cellSize: number): number | null {
    if (!isWithinMapBounds(point)) {
        return null;
    }

    const riverThreshold = cellSize * RIVER_BAND_FACTOR;
    const gateRadius = getCrossingGateRadius(cellSize);

    const blocked = index.barriers.some(barrier =>
        isInBBox(point, expandBBox(barrier.bbox, riverThreshold))
        && isNearLineGeometry(point, barrier.geometry, riverThreshold)
        && !isNearAnyPoint(point, barrier.crossings, gateRadius),
    );

    return blocked ? null : classifyLandscape(point, index);
}

function classifyLandscape(point: Position, index: RoutingIndex): number | null {
    if (!findContaining(point, index.land)) {
        return null;
    }

    if (findContaining(point, index.lakes)) {
        return null;
    }

    const layersByPriority = [index.mountains, index.swamps, index.deserts, index.forests];
    for (const layer of layersByPriority) {
        const area = findContaining(point, layer);
        if (area) {
            return area.k;
        }
    }

    return TerrainK.Default;
}

export function rasterizeGrid(grid: Grid, index: RoutingIndex): Float64Array {
    const cells = grid.cols * grid.rows;
    const k = new Float64Array(cells).fill(TerrainK.Default);
    const land = new Uint8Array(cells);
    const rowMask = new Uint8Array(grid.cols);
    const extent = getGridBBox(grid);

    fillAreas(grid, rowMask, index.forests, extent, (flatIndex, value) => { k[flatIndex] = value; });
    fillAreas(grid, rowMask, index.deserts, extent, (flatIndex, value) => { k[flatIndex] = value; });
    fillAreas(grid, rowMask, index.swamps, extent, (flatIndex, value) => { k[flatIndex] = value; });
    fillAreas(grid, rowMask, [...index.mountains].reverse(), extent, (flatIndex, value) => { k[flatIndex] = value; });
    fillAreas(grid, rowMask, index.lakes, extent, (flatIndex, value) => { k[flatIndex] = value; });

    fillAreas(grid, rowMask, index.land, extent, flatIndex => { land[flatIndex] = 1; });
    for (let flatIndex = 0; flatIndex < cells; flatIndex++) {
        if (!land[flatIndex]) {
            k[flatIndex] = IMPASSABLE;
        }
    }

    blockOutsideMap(k, grid);
    blockBarriers(k, grid, index, extent);

    return k;
}

function blockOutsideMap(k: Float64Array, grid: Grid): void {
    const minCol = Math.ceil((MapBounds.West - grid.minLng) / grid.cellSize - 0.5);
    const maxCol = Math.floor((MapBounds.East - grid.minLng) / grid.cellSize - 0.5);
    const minRow = Math.ceil((MapBounds.South - grid.minLat) / grid.cellSize - 0.5);
    const maxRow = Math.floor((MapBounds.North - grid.minLat) / grid.cellSize - 0.5);

    for (let row = 0; row < grid.rows; row++) {
        const rowOffset = row * grid.cols;

        if (row < minRow || row > maxRow) {
            k.fill(IMPASSABLE, rowOffset, rowOffset + grid.cols);
            continue;
        }

        k.fill(IMPASSABLE, rowOffset, rowOffset + Math.min(grid.cols, Math.max(0, minCol)));
        k.fill(IMPASSABLE, rowOffset + Math.max(0, Math.min(grid.cols, maxCol + 1)), rowOffset + grid.cols);
    }
}

export const NO_COMPONENT = -1;

export function labelComponents(grid: Grid, k: Float64Array): Int32Array {
    const labels = new Int32Array(grid.cols * grid.rows).fill(NO_COMPONENT);
    const stack: number[] = [];
    let nextLabel = 0;

    for (let seed = 0; seed < labels.length; seed++) {
        if (k[seed] === IMPASSABLE || labels[seed] !== NO_COMPONENT) {
            continue;
        }

        const label = nextLabel++;
        labels[seed] = label;
        stack.push(seed);

        while (stack.length > 0) {
            const flatIndex = stack.pop();
            const col = flatIndex % grid.cols;
            const row = (flatIndex - col) / grid.cols;

            for (const offset of NEIGHBOR_OFFSETS) {
                const neighborCol = col + offset.col;
                const neighborRow = row + offset.row;
                if (neighborCol < 0 || neighborCol >= grid.cols || neighborRow < 0 || neighborRow >= grid.rows) {
                    continue;
                }

                const neighborFlat = neighborRow * grid.cols + neighborCol;
                if (k[neighborFlat] === IMPASSABLE || labels[neighborFlat] !== NO_COMPONENT) {
                    continue;
                }

                labels[neighborFlat] = label;
                stack.push(neighborFlat);
            }
        }
    }

    return labels;
}

function getGridBBox(grid: Grid): BBox {
    return [
        grid.minLng,
        grid.minLat,
        grid.minLng + grid.cols * grid.cellSize,
        grid.minLat + grid.rows * grid.cellSize,
    ];
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function blockBarriers(k: Float64Array, grid: Grid, index: RoutingIndex, extent: BBox): void {
    const threshold = grid.cellSize * RIVER_BAND_FACTOR;
    const gateRadius = getCrossingGateRadius(grid.cellSize);

    for (const barrier of index.barriers) {
        if (!bboxesOverlap(expandBBox(barrier.bbox, threshold), extent)) {
            continue;
        }

        for (const part of getLineParts(barrier.geometry)) {
            for (let i = 0; i < part.length - 1; i++) {
                forEachCellNearSegment(grid, part[i], part[i + 1], threshold, (flatIndex, center) => {
                    if (!isNearAnyPoint(center, barrier.crossings, gateRadius)) {
                        k[flatIndex] = IMPASSABLE;
                    }
                });
            }
        }
    }
}

function forEachCellNearSegment(
    grid: Grid,
    start: Position,
    end: Position,
    threshold: number,
    visit: (flatIndex: number, center: Position) => void,
): void {
    const minCol = Math.max(0, getColAtLng(grid, Math.min(start[0], end[0]) - threshold));
    const maxCol = Math.min(grid.cols - 1, getColAtLng(grid, Math.max(start[0], end[0]) + threshold));
    const minRow = Math.max(0, getRowAtLat(grid, Math.min(start[1], end[1]) - threshold));
    const maxRow = Math.min(grid.rows - 1, getRowAtLat(grid, Math.max(start[1], end[1]) + threshold));

    for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
            const center = getCellCenter(grid, col, row);
            if (pointToSegmentDistance(center, start, end) <= threshold) {
                visit(toFlatIndex(grid, col, row), center);
            }
        }
    }
}

function fillAreas(
    grid: Grid,
    rowMask: Uint8Array,
    areas: IndexedArea[],
    extent: BBox,
    write: (flatIndex: number, value: number) => void,
): void {
    for (const area of areas) {
        if (!bboxesOverlap(area.bbox, extent)) {
            continue;
        }
        const value = area.k ?? IMPASSABLE;
        for (const rings of getPolygonRings(area.geometry)) {
            fillPolygon(grid, rowMask, rings, value, write);
        }
    }
}

function fillPolygon(
    grid: Grid,
    rowMask: Uint8Array,
    [outerRing, ...holes]: Position[][],
    value: number,
    write: (flatIndex: number, value: number) => void,
): void {
    const [, minLat, , maxLat] = getRingBBox(outerRing);
    const minRow = Math.max(0, getRowAtLat(grid, minLat));
    const maxRow = Math.min(grid.rows - 1, getRowAtLat(grid, maxLat) + 1);

    const outerEdges = buildEdgeTable(outerRing);
    const holeEdges = holes.map(hole => buildEdgeTable(hole));

    for (let row = minRow; row <= maxRow; row++) {
        const centerLat = grid.minLat + (row + 0.5) * grid.cellSize;
        const outerSpans = getRowSpans(grid, outerEdges, centerLat);
        if (!outerSpans.length) {
            continue;
        }

        for (const [from, to] of outerSpans) {
            rowMask.fill(1, from, to + 1);
        }
        for (const hole of holeEdges) {
            for (const [from, to] of getRowSpans(grid, hole, centerLat)) {
                rowMask.fill(0, from, to + 1);
            }
        }

        const rowOffset = row * grid.cols;
        for (const [from, to] of outerSpans) {
            for (let col = from; col <= to; col++) {
                if (rowMask[col]) {
                    write(rowOffset + col, value);
                    rowMask[col] = 0;
                }
            }
            rowMask.fill(0, from, to + 1);
        }
    }
}

interface EdgeTable {
    edges: { currLng: number; currLat: number; prevLng: number; prevLat: number; minLat: number; maxLat: number }[];
}

function buildEdgeTable(ring: Position[]): EdgeTable {
    const edges: EdgeTable['edges'] = [];

    for (let curr = 0, prev = ring.length - 1; curr < ring.length; prev = curr++) {
        const [currLng, currLat] = ring[curr];
        const [prevLng, prevLat] = ring[prev];

        if (currLat !== prevLat) {
            edges.push({
                currLng,
                currLat,
                prevLng,
                prevLat,
                minLat: Math.min(currLat, prevLat),
                maxLat: Math.max(currLat, prevLat),
            });
        }
    }

    edges.sort((a, b) => a.minLat - b.minLat);
    return { edges };
}

function getRowSpans(grid: Grid, { edges }: EdgeTable, centerLat: number): [number, number][] {
    const crossings: number[] = [];

    for (const edge of edges) {
        if (edge.minLat > centerLat) {
            break;
        }
        if (edge.maxLat < centerLat) {
            continue;
        }
        if (edge.currLat > centerLat === edge.prevLat > centerLat) {
            continue;
        }

        const verticalRatio = (centerLat - edge.currLat) / (edge.prevLat - edge.currLat);
        crossings.push(edge.currLng + (edge.prevLng - edge.currLng) * verticalRatio);
    }

    if (crossings.length < 2) {
        return [];
    }

    crossings.sort((a, b) => a - b);

    const spans: [number, number][] = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, Math.ceil((crossings[i] - grid.minLng) / grid.cellSize - 0.5));
        const to = Math.min(grid.cols - 1, Math.ceil((crossings[i + 1] - grid.minLng) / grid.cellSize - 0.5) - 1);
        if (from <= to) {
            spans.push([from, to]);
        }
    }

    return spans;
}

function getPolygonRings(geometry: Polygon | MultiPolygon): Position[][][] {
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function getLineParts(geometry: LineString | MultiLineString): Position[][] {
    return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
}

function indexArea(feature: Feature<Polygon | MultiPolygon>, k: number | null): IndexedArea {
    return { bbox: getBBox(feature.geometry), geometry: feature.geometry, k };
}

const LANDMASS_BUCKET_SIZE = 0.25;
const LANDMASS_BUCKET_ROW_STRIDE = 100_000;
const LANDMASS_JOIN_DISTANCE = MIN_CELL_SIZE * Math.SQRT2;

function indexLandmasses(features: Feature<Polygon | MultiPolygon>[]): IndexedLandmass[] {
    const polygons = flatten(features.map(feature => getPolygonRings(feature.geometry)))
        .map(rings => ({ rings, bbox: getRingBBox(rings[0]) }));
    const roots = new Int32Array(polygons.length).map((_, index) => index);

    joinTouchingPolygons(polygons, roots);
    joinNestedPolygons(polygons, roots);

    return polygons.map((polygon, index) => ({
        bbox: polygon.bbox,
        geometry: { type: 'Polygon', coordinates: polygon.rings },
        k: TerrainK.Default,
        landmass: findRoot(roots, index),
    }));
}

function findRoot(roots: Int32Array, index: number): number {
    let root = index;
    while (roots[root] !== root) {
        root = roots[root] = roots[roots[root]];
    }
    return root;
}

function join(roots: Int32Array, a: number, b: number): void {
    roots[findRoot(roots, a)] = findRoot(roots, b);
}

interface LandPolygon {
    rings: Position[][];
    bbox: BBox;
}

function joinTouchingPolygons(polygons: LandPolygon[], roots: Int32Array): void {
    const buckets = new Map<number, { polygon: number; from: Position; to: Position }[]>();

    polygons.forEach((polygon, index) => {
        const ring = polygon.rings[0];
        for (let i = 0; i < ring.length - 1; i++) {
            const [from, to] = [ring[i], ring[i + 1]];
            forEachBucketNearSegment(from, to, key => {
                const edges = buckets.get(key);
                if (edges) {
                    edges.push({ polygon: index, from, to });
                } else {
                    buckets.set(key, [{ polygon: index, from, to }]);
                }
            });
        }
    });

    for (const edges of buckets.values()) {
        for (let i = 0; i < edges.length; i++) {
            for (let j = i + 1; j < edges.length; j++) {
                if (findRoot(roots, edges[i].polygon) === findRoot(roots, edges[j].polygon)) {
                    continue;
                }
                const distance = segmentToSegmentDistance(edges[i].from, edges[i].to, edges[j].from, edges[j].to);
                if (distance <= LANDMASS_JOIN_DISTANCE) {
                    join(roots, edges[i].polygon, edges[j].polygon);
                }
            }
        }
    }
}

function joinNestedPolygons(polygons: LandPolygon[], roots: Int32Array): void {
    polygons.forEach((polygon, index) => {
        polygons.forEach((outer, outerIndex) => {
            if (outerIndex === index
                || findRoot(roots, outerIndex) === findRoot(roots, index)
                || !bboxContains(outer.bbox, polygon.bbox)) {
                return;
            }
            if (pointInPolygon(polygon.rings[0][0], { type: 'Polygon', coordinates: outer.rings })) {
                join(roots, index, outerIndex);
            }
        });
    });
}

function forEachBucketNearSegment(from: Position, to: Position, visit: (key: number) => void): void {
    const toBucket = (value: number) => Math.floor(value / LANDMASS_BUCKET_SIZE);
    const minCol = toBucket(Math.min(from[0], to[0]) - LANDMASS_JOIN_DISTANCE);
    const maxCol = toBucket(Math.max(from[0], to[0]) + LANDMASS_JOIN_DISTANCE);
    const minRow = toBucket(Math.min(from[1], to[1]) - LANDMASS_JOIN_DISTANCE);
    const maxRow = toBucket(Math.max(from[1], to[1]) + LANDMASS_JOIN_DISTANCE);

    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            visit(col * LANDMASS_BUCKET_ROW_STRIDE + row);
        }
    }
}

function segmentToSegmentDistance(a: Position, b: Position, c: Position, d: Position): number {
    if (segmentsCross(a, b, c, d)) {
        return 0;
    }

    return Math.min(
        pointToSegmentDistance(a, c, d),
        pointToSegmentDistance(b, c, d),
        pointToSegmentDistance(c, a, b),
        pointToSegmentDistance(d, a, b),
    );
}

function segmentsCross(a: Position, b: Position, c: Position, d: Position): boolean {
    const side = (from: Position, to: Position, point: Position) =>
        (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0]);

    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function bboxContains(outer: BBox, inner: BBox): boolean {
    return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

export function getLandmass(point: Position, land: IndexedLandmass[]): number | null {
    return findContaining(point, land)?.landmass ?? null;
}

function indexBarrier(
    feature: Feature<LineString | MultiLineString>,
    barrierCrossings: BarrierCrossing[],
): IndexedBarrier {
    const label = feature.properties?.name ?? feature.properties?.id ?? 'unnamed';

    return {
        bbox: getBBox(feature.geometry),
        geometry: feature.geometry,
        crossings: barrierCrossings.filter(crossing => crossing.barrier === label).map(({ point }) => point),
    };
}

function getBBox(geometry: Polygon | MultiPolygon | LineString | MultiLineString): BBox {
    return getRingBBox(getGeometryPositions(geometry));
}

function getRingBBox(positions: Position[]): BBox {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    for (const [lng, lat] of positions) {
        if (lng < minLng) {
            minLng = lng;
        }
        if (lng > maxLng) {
            maxLng = lng;
        }
        if (lat < minLat) {
            minLat = lat;
        }
        if (lat > maxLat) {
            maxLat = lat;
        }
    }

    return [minLng, minLat, maxLng, maxLat];
}

function isInBBox([lng, lat]: Position, [minLng, minLat, maxLng, maxLat]: BBox): boolean {
    return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function expandBBox([minLng, minLat, maxLng, maxLat]: BBox, margin: number): BBox {
    return [minLng - margin, minLat - margin, maxLng + margin, maxLat + margin];
}

function findContaining<T extends IndexedArea>(point: Position, areas: T[]): T | undefined {
    return areas.find(area => isInBBox(point, area.bbox) && pointInPolygon(point, area.geometry));
}

export function isPointInAreas(point: Position, areas: IndexedArea[]): boolean {
    return findContaining(point, areas) !== undefined;
}

function isNearLineGeometry(
    point: Position,
    geometry: LineString | MultiLineString,
    threshold: number,
): boolean {
    return getLineParts(geometry).some(line => isNearLine(point, line, threshold));
}

function isNearAnyPoint(point: Position, points: Position[], threshold: number): boolean {
    return points.some(candidate => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) <= threshold);
}

function isNearLine(point: Position, line: Position[], threshold: number): boolean {
    for (let i = 0; i < line.length - 1; i++) {
        if (pointToSegmentDistance(point, line[i], line[i + 1]) <= threshold) {
            return true;
        }
    }

    return false;
}

export function pointToSegmentDistance([px, py]: Position, [ax, ay]: Position, [bx, by]: Position): number {
    const dx = bx - ax;
    const dy = by - ay;

    if (dx === 0 && dy === 0) {
        return Math.hypot(px - ax, py - ay);
    }

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
