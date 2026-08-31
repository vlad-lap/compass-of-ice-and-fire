import { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon, Position } from 'geojson';
import { BarrierCrossing, BarrierCrossingKind, Grid, RoadNetwork, RouteResult, RoutingGeodata } from '../models';
import { KM_PER_COORD_UNIT, MapBounds } from '../components/map-page/constants';
import { buildGrid, cellCount, getCellCenter, getCellIndexAt, toFlatIndex } from './grid';
import {
    buildRoutingIndex,
    classifyCell,
    classifySeaCell,
    getDistanceToLand,
    getLandmass,
    getSeaClearanceThreshold,
    isOpenSea,
    isSeaEndpoint,
    keepsSeaClearance,
    labelComponents,
    MOUNTAIN_K_BY_HEIGHT,
    NO_COMPONENT,
    rasterizeGrid,
    SEA_CLEARANCE,
    TerrainK,
    WaterK,
} from './raster';
import {
    calculateDragonRoute,
    findPath,
    SEA_CELL_SIZE,
    MARGIN_RETRY_STEPS,
    placePoint,
    planRoutes,
    planRoutesWithIndex,
    getGroundClearance,
    getGroundPassability,
    pullTautPath,
    simplifyPath,
    SpeedKmH,
} from './routing';

describe('buildGrid', () => {
    it('extends the bounds past both points by the margin ratio', () => {
        const grid = buildGrid([0, 0], [10, 4]);

        expect(grid.minLng).toBeLessThan(0);
        expect(grid.minLat).toBeLessThan(0);
        expect(grid.minLng + grid.cols * grid.cellSize).toBeGreaterThan(10);
        expect(grid.minLat + grid.rows * grid.cellSize).toBeGreaterThan(4);
    });

    it('keeps a non-zero margin when the two points coincide on an axis', () => {
        const grid = buildGrid([5, 5], [5, 9]);

        expect(grid.cellSize).toBeGreaterThan(0);
        expect(Number.isFinite(grid.cellSize)).toBe(true);
        expect(grid.cols).toBeGreaterThan(0);
    });

    it('keeps a non-zero margin when both points are identical', () => {
        const grid = buildGrid([5, 5], [5, 5]);

        expect(grid.cellSize).toBeGreaterThan(0);
        expect(Number.isFinite(grid.cellSize)).toBe(true);
        expect(grid.cols).toBeGreaterThan(0);
        expect(grid.rows).toBeGreaterThan(0);
    });

    it('targets roughly the requested cell budget', () => {
        const grid = buildGrid([0, 0], [10, 4], 1000);

        expect(cellCount(grid)).toBeGreaterThanOrEqual(1000);
        expect(cellCount(grid)).toBeLessThan(1300);
    });
});

describe('getCellCenter / getCellIndexAt', () => {
    it('round-trips a cell center back to the same cell index', () => {
        const grid = buildGrid([0, 0], [10, 4], 500);

        const center = getCellCenter(grid, 3, 2);
        expect(getCellIndexAt(grid, center)).toEqual({ col: 3, row: 2 });
    });

    it('places the two input points inside the grid bounds', () => {
        const from: [number, number] = [0, 0];
        const to: [number, number] = [10, 4];
        const grid = buildGrid(from, to);

        expect(getCellIndexAt(grid, from)).not.toBeNull();
        expect(getCellIndexAt(grid, to)).not.toBeNull();
    });

    it('returns null outside the grid bounds', () => {
        const grid = buildGrid([0, 0], [10, 4]);

        expect(getCellIndexAt(grid, [grid.minLng - 1, grid.minLat - 1])).toBeNull();
    });
});

describe('toFlatIndex', () => {
    it('produces a unique index within [0, cellCount)', () => {
        const grid = buildGrid([0, 0], [10, 4], 500);

        expect(toFlatIndex(grid, 0, 0)).toBe(0);
        expect(toFlatIndex(grid, grid.cols - 1, grid.rows - 1)).toBe(cellCount(grid) - 1);
    });
});

function square(
    [x, y]: [number, number],
    size: number,
    properties: Record<string, unknown> = {},
): Feature<Polygon> {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'Polygon',
            coordinates: [[[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]]],
        },
    };
}

function rect(
    [x, y]: [number, number],
    width: number,
    height: number,
    properties: Record<string, unknown> = {},
): Feature<Polygon> {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'Polygon',
            coordinates: [[[x, y], [x, y + height], [x + width, y + height], [x + width, y], [x, y]]],
        },
    };
}

function line(
    coordinates: [number, number][],
    properties: Record<string, unknown> = {},
): Feature<LineString> {
    return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } };
}

const TEST_RIVER = 'test river';

function river(coordinates: [number, number][], size: number): Feature<LineString> {
    return line(coordinates, { size, name: TEST_RIVER });
}

function crossing([lng, lat]: [number, number], kind: BarrierCrossingKind): BarrierCrossing {
    return { point: [lng, lat], kind, barrier: TEST_RIVER, via: 'test crossing' };
}

function collection<T extends Feature>(features: T[]): FeatureCollection<T['geometry']> {
    return { type: 'FeatureCollection', features };
}

// Water is the default now, so every fixture needs land under the area it exercises.
const TEST_LAND = rect([-60, -60], 120, 120);
const TEST_LAND_EAST = 60;

const geodata: RoutingGeodata = {
    continents: collection([TEST_LAND]),
    islands: collection([]),
    forests: collection([square([0, 0], 2)]),
    deserts: collection([square([3, 0], 2)]),
    swamps: collection([square([6, 0], 2)]),
    mountains: collection([square([0, 3], 2, { height: 2 }), square([3, 3], 2, { height: 3 })]),
    lakes: collection([square([6, 3], 2), square([0, 6], 2, { variant: 'dry' })]),
    seas: collection([]),
    bays: collection([]),
    straits: collection([]),
    locations: collection([]),
    rivers: collection([]),
    theWall: collection([]),
    barrierCrossings: [],
};

const CELL_SIZE = 0.5;

describe('classifyCell', () => {
    const index = buildRoutingIndex(geodata);

    it('classifies a point inside a forest', () => {
        expect(classifyCell([1, 1], index, CELL_SIZE)).toBe(TerrainK.Forest);
    });

    it('classifies a point inside a desert', () => {
        expect(classifyCell([4, 1], index, CELL_SIZE)).toBe(TerrainK.Desert);
    });

    it('classifies a point inside a swamp', () => {
        expect(classifyCell([7, 1], index, CELL_SIZE)).toBe(TerrainK.Swamp);
    });

    it('classifies mountains by height', () => {
        expect(classifyCell([1, 4], index, CELL_SIZE)).toBe(MOUNTAIN_K_BY_HEIGHT[2]);
        expect(classifyCell([4, 4], index, CELL_SIZE)).toBe(MOUNTAIN_K_BY_HEIGHT[3]);
    });

    it('treats a normal lake as impassable water', () => {
        expect(classifyCell([6.5, 3.5], index, CELL_SIZE)).toBeNull();
    });

    it('treats a point off the land as impassable, wherever it is', () => {
        // Inside the map bounds, so the only reason it is blocked is that no land is drawn there.
        expect(classifyCell([100, 20], index, CELL_SIZE)).toBeNull();
    });

    it('treats a dry lake as desert', () => {
        expect(classifyCell([1, 7], index, CELL_SIZE)).toBe(TerrainK.Desert);
    });

    it('falls back to the default coefficient outside any known area', () => {
        expect(classifyCell([20, 20], index, CELL_SIZE)).toBe(TerrainK.Default);
    });

    it('prioritizes mountains over forests when areas overlap', () => {
        const overlappingIndex = buildRoutingIndex({
            ...geodata,
            forests: collection([square([0, 3], 2)]),
        });

        expect(classifyCell([1, 4], overlappingIndex, CELL_SIZE)).toBe(MOUNTAIN_K_BY_HEIGHT[2]);
    });
});

describe('detours to a crossing', () => {
    it('widens the search box in absolute terms, so a detour is found even for points on one meridian', () => {
        // A barrier across the whole width with its only gate far to the east. The two points share a
        // longitude, so the box has zero span there and a purely proportional margin could never
        // reach the gate however many times the search widened.
        const geodataWithGate: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            rivers: collection([river([[-20, 5], [20, 5]], 2)]),
            barrierCrossings: [crossing([6, 5], 'location')],
        };

        const plan = planRoutes([0, 4], [0, 6], geodataWithGate);

        expect(plan.foot).not.toBeNull();
        expect(plan.foot.path.some(([lng]) => lng > 4)).toBe(true);
    });
});

describe('landmasses', () => {
    // Narrow enough that the coarse grids the search falls back to bridge it, which is the whole
    // point: reachability is decided by the geometry, not by whatever resolution the search picked.
    const STRAIT = 0.3;
    const ISLAND = square([TEST_LAND_EAST + STRAIT, 0], 4);
    const MAINLAND_POINT: Position = [0, 2];
    const ISLAND_POINT: Position = [TEST_LAND_EAST + STRAIT + 2, 2];
    const withIsland = (island: Feature<Polygon | MultiPolygon>): RoutingGeodata =>
        ({ ...emptyRoutingGeodata(), islands: collection([island]) });

    it('puts an island of its own in a separate landmass', () => {
        const index = buildRoutingIndex(withIsland(ISLAND));

        expect(getLandmass(MAINLAND_POINT, index.land)).not.toBeNull();
        expect(getLandmass(ISLAND_POINT, index.land)).not.toBe(getLandmass(MAINLAND_POINT, index.land));
    });

    it('has no ground route to an island, on any grid', () => {
        const plan = planRoutes(MAINLAND_POINT, ISLAND_POINT, withIsland(ISLAND));

        expect(plan.foot).toBeNull();
        expect(plan.dragon.distanceKm).toBeGreaterThan(0);
    });

    // Without this the test above would prove nothing: it has to be the landmass rule that refuses
    // the route, not the raster - and on the widest fallback grid the raster does not refuse it.
    it('is the rule that refuses the route, not the grid, which bridges the strait when coarse', () => {
        const index = buildRoutingIndex(withIsland(ISLAND));
        const widest = MARGIN_RETRY_STEPS[MARGIN_RETRY_STEPS.length - 1];
        const grid = buildGrid(MAINLAND_POINT, ISLAND_POINT,
            widest.cellBudget, widest.marginRatio, widest.minMargin);
        const labels = labelComponents(grid, rasterizeGrid(grid, index));
        const labelAt = (point: Position) => {
            const { col, row } = getCellIndexAt(grid, point);
            return labels[toFlatIndex(grid, col, row)];
        };

        expect(grid.cellSize).toBeGreaterThan(STRAIT);
        expect(labelAt(ISLAND_POINT)).not.toBe(NO_COMPONENT);
        expect(labelAt(ISLAND_POINT)).toBe(labelAt(MAINLAND_POINT));
    });

    it('joins land polygons that touch into one landmass', () => {
        const index = buildRoutingIndex(withIsland(square([TEST_LAND_EAST, 0], 4)));

        expect(getLandmass([TEST_LAND_EAST + 2, 2], index.land)).toBe(getLandmass(MAINLAND_POINT, index.land));
    });

    it('joins a polygon drawn inside another into one landmass', () => {
        const index = buildRoutingIndex(withIsland(square([10, 10], 2)));

        expect(getLandmass([11, 11], index.land)).toBe(getLandmass(MAINLAND_POINT, index.land));
    });

    it('keeps the islands of one multipolygon apart', () => {
        const index = buildRoutingIndex(withIsland({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    ISLAND.geometry.coordinates,
                    square([TEST_LAND_EAST + STRAIT, 20], 4).geometry.coordinates,
                ],
            },
        }));

        expect(getLandmass(ISLAND_POINT, index.land))
            .not.toBe(getLandmass([TEST_LAND_EAST + STRAIT + 2, 22], index.land));
    });
});

describe('map bounds', () => {
    const index = buildRoutingIndex(emptyRoutingGeodata());

    it('treats anything past the edge of the map as impassable, not as open ground', () => {
        expect(classifyCell([0, 0], index, CELL_SIZE)).toBe(TerrainK.Default);
        expect(classifyCell([0, MapBounds.North + 0.1], index, CELL_SIZE)).toBeNull();
        expect(classifyCell([0, MapBounds.South - 0.1], index, CELL_SIZE)).toBeNull();
        expect(classifyCell([MapBounds.East + 0.1, 0], index, CELL_SIZE)).toBeNull();
        expect(classifyCell([MapBounds.West - 0.1, 0], index, CELL_SIZE)).toBeNull();
    });

    it('keeps the boundary itself passable', () => {
        expect(classifyCell([0, MapBounds.North], index, CELL_SIZE)).toBe(TerrainK.Default);
        expect(classifyCell([MapBounds.West, 0], index, CELL_SIZE)).toBe(TerrainK.Default);
    });

    it('never routes around the edge of the map', () => {
        const grid = buildGrid([MapBounds.West + 1, MapBounds.North - 1], [MapBounds.West + 3, MapBounds.North - 1]);
        const wall: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            lakes: collection([rect([MapBounds.West + 1.9, MapBounds.North - 40], 0.2, 41)]),
        };
        const wallIndex = buildRoutingIndex(wall);

        // The sea wall runs from far south up to the map edge, so the only way past it would be
        // around the top - which the bounds forbid.
        expect(findPath(
            grid,
            rasterizeGrid(grid, wallIndex),
            getCellIndexAt(grid, [MapBounds.West + 1, MapBounds.North - 1]),
            getCellIndexAt(grid, [MapBounds.West + 3, MapBounds.North - 1]),
        )).toBeNull();
    });
});

describe('buildRoutingIndex', () => {
    it('merges dry lakes into the deserts layer with the desert coefficient', () => {
        const index = buildRoutingIndex(geodata);

        expect(index.deserts).toHaveLength(2);
        expect(index.deserts.every(area => area.k === TerrainK.Desert)).toBe(true);
    });

    it('keeps only non-dry lakes in the lakes layer, marked impassable', () => {
        const index = buildRoutingIndex(geodata);

        expect(index.lakes).toHaveLength(1);
        expect(index.lakes.every(area => area.k === null)).toBe(true);
    });
});

function emptyRoutingGeodata(): RoutingGeodata {
    return {
        continents: collection([TEST_LAND]),
        islands: collection([]),
        forests: collection([]),
        deserts: collection([]),
        swamps: collection([]),
        mountains: collection([]),
        lakes: collection([]),
        seas: collection([]),
        bays: collection([]),
        straits: collection([]),
        locations: collection([]),
        rivers: collection([]),
        theWall: collection([]),
        barrierCrossings: [],
    };
}

describe('river crossings', () => {
    const CELL = 0.5;

    it('never blocks a size-1 river', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 1)]),
        });

        expect(classifyCell([5, 5], index, CELL)).toBe(TerrainK.Default);
    });

    it('blocks a size-2 river with no road or location nearby', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 2)]),
        });

        expect(classifyCell([5, 5], index, CELL)).toBeNull();
    });

    it('blocks a size-3 river with no road or location nearby', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 3)]),
        });

        expect(classifyCell([5, 5], index, CELL)).toBeNull();
    });

    it('allows crossing a blocking river at a location on it', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 2)]),
            barrierCrossings: [crossing([5, 5], 'location')],
        });

        expect(classifyCell([5, 5], index, CELL)).toBe(TerrainK.Default);
    });

    it('allows crossing a blocking river where a road bridges it, with no location involved', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 2)]),
            barrierCrossings: [crossing([5, 5], 'bridge')],
        });

        expect(classifyCell([5, 5], index, CELL)).toBe(TerrainK.Default);
    });

    it('still blocks the river away from the crossing', () => {
        const index = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            rivers: collection([river([[0, 5], [10, 5]], 2)]),
            barrierCrossings: [crossing([5, 5], 'location')],
        });

        expect(classifyCell([2, 5], index, CELL)).toBeNull();
    });

    it('routes around a blocking river to cross at a location, instead of a shorter direct line', () => {
        const testGrid: Grid = { minLng: 0, minLat: 0, cellSize: 1, cols: 10, rows: 10 };
        const geodataWithCrossing: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            rivers: collection([river([[5, 0], [5, 10]], 2)]),
            barrierCrossings: [crossing([5, 8], 'location')],
        };

        const crossingIndex = buildRoutingIndex(geodataWithCrossing);
        const result = findPath(
            testGrid,
            rasterizeGrid(testGrid, crossingIndex),
            { col: 0, row: 5 },
            { col: 9, row: 5 },
        );

        expect(result).not.toBeNull();
        // The crossing exemption around a location is deliberately wider than the river's own
        // blocked band (see LOCATION_CROSSING_FACTOR), so the cheapest crossing is usually a bit
        // closer to the start/goal than the location itself, not necessarily right at it.
        expect(result.path.some(([lng, lat]) => Math.abs(lng - 5) < 1 && Math.abs(lat - 8) < 3)).toBe(true);
    });
});

describe('findPath', () => {
    const testGrid: Grid = { minLng: 0, minLat: 0, cellSize: 1, cols: 10, rows: 10 };

    it('finds a direct path across open terrain with cost close to distance/k', () => {
        const index = buildRoutingIndex(emptyRoutingGeodata());

        const result = findPath(testGrid, rasterizeGrid(testGrid, index), { col: 0, row: 0 }, { col: 9, row: 9 });

        expect(result).not.toBeNull();
        expect(result.path[0]).toEqual(getCellCenter(testGrid, 0, 0));
        expect(result.path[result.path.length - 1]).toEqual(getCellCenter(testGrid, 9, 9));
        expect(result.cost).toBeCloseTo((9 * Math.sqrt(2)) / TerrainK.Default, 1);
    });

    it('returns null when a solid wall of water fully separates start and goal', () => {
        const wallGeodata: RoutingGeodata = { ...emptyRoutingGeodata(), lakes: collection([rect([5, 0], 1, 10)]) };
        const index = buildRoutingIndex(wallGeodata);

        const result = findPath(testGrid, rasterizeGrid(testGrid, index), { col: 0, row: 5 }, { col: 9, row: 5 });

        expect(result).toBeNull();
    });

    it('routes through a gap in a wall of water', () => {
        const wallWithGapGeodata: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            lakes: collection([rect([5, 0], 1, 5), rect([5, 6], 1, 4)]),
        };
        const index = buildRoutingIndex(wallWithGapGeodata);

        const result = findPath(testGrid, rasterizeGrid(testGrid, index), { col: 0, row: 5 }, { col: 9, row: 5 });

        expect(result).not.toBeNull();
        expect(result.path.some(([, lat]) => lat >= 5 && lat <= 6)).toBe(true);
    });

    it('returns null immediately when the start or goal cell is impassable', () => {
        const index = buildRoutingIndex({ ...emptyRoutingGeodata(), lakes: collection([rect([0, 0], 10, 10)]) });

        expect(findPath(testGrid, rasterizeGrid(testGrid, index), { col: 0, row: 0 }, { col: 9, row: 9 })).toBeNull();
    });

});

describe('placePoint', () => {
    const placementGrid: Grid = { minLng: 0, minLat: 0, cellSize: 1, cols: 10, rows: 10 };
    const placementGeodata: RoutingGeodata = {
        ...emptyRoutingGeodata(),
        // Land only up to latitude 6, so a point above it is off the land - which is what open sea
        // means now that sea polygons no longer decide passability.
        continents: collection([rect([0, 0], 10, 6)]),
        lakes: collection([
            rect([2, 2], 3, 3),
            rect([7, 1], 2, 2, { variant: 'dry' }),
        ]),
    };
    const index = buildRoutingIndex(placementGeodata);
    const placementRaster = rasterizeGrid(placementGrid, index);

    it('keeps a point on land as-is', () => {
        expect(placePoint([1, 1], placementGrid, index, placementRaster)).toEqual({ col: 1, row: 1 });
    });

    it('rejects a point off the land instead of snapping it ashore', () => {
        expect(placePoint([7, 7], placementGrid, index, placementRaster)).toBeNull();
    });

    it('snaps a point inside a normal lake to the nearest passable cell', () => {
        const placed = placePoint([2.5, 4.5], placementGrid, index, placementRaster);

        expect(placed).not.toBeNull();
        expect(classifyCell(getCellCenter(placementGrid, placed.col, placed.row), index, 1)).not.toBeNull();
    });

    it('does not snap a point in a dry lake, since it is already passable', () => {
        expect(placePoint([8, 2], placementGrid, index, placementRaster)).toEqual({ col: 8, row: 2 });
    });

    it('returns null outside the grid bounds', () => {
        expect(placePoint([20, 20], placementGrid, index, placementRaster)).toBeNull();
    });

    it('returns null when no passable cell can be reached', () => {
        const fullyWaterGrid: Grid = { minLng: 0, minLat: 0, cellSize: 1, cols: 3, rows: 3 };
        const fullyWaterIndex = buildRoutingIndex({
            ...emptyRoutingGeodata(),
            lakes: collection([rect([0, 0], 3, 3)]),
        });

        expect(placePoint([1.5, 1.5], fullyWaterGrid, fullyWaterIndex, rasterizeGrid(fullyWaterGrid, fullyWaterIndex))).toBeNull();
    });
});

describe('calculateDragonRoute', () => {
    it('returns the straight path between the two points', () => {
        const result = calculateDragonRoute([0, 0], [3, 4]);
        expect(result.path).toEqual([[0, 0], [3, 4]]);
    });

    it('computes distance via KM_PER_COORD_UNIT, ignoring terrain', () => {
        const result = calculateDragonRoute([0, 0], [3, 4]);
        expect(result.distanceKm).toBeCloseTo(5 * KM_PER_COORD_UNIT);
    });

    it('computes time as distance / dragon speed', () => {
        const result = calculateDragonRoute([0, 0], [3, 4]);
        expect(result.timeHours).toBeCloseTo(result.distanceKm / SpeedKmH.dragon);
    });

    it('is symmetric regardless of point order', () => {
        expect(calculateDragonRoute([0, 0], [3, 4]).distanceKm).toBeCloseTo(
            calculateDragonRoute([3, 4], [0, 0]).distanceKm,
        );
    });

    it('returns zero distance and time for coincident points', () => {
        const result = calculateDragonRoute([5, 5], [5, 5]);
        expect(result.distanceKm).toBe(0);
        expect(result.timeHours).toBe(0);
    });
});

describe('planRoutes', () => {
    it('gives foot and horse the same path, with the horse exactly twice as fast', () => {
        const plan = planRoutes([0, 0], [5, 5], emptyRoutingGeodata());

        expect(plan.foot).not.toBeNull();
        expect(plan.horse).not.toBeNull();
        expect(plan.horse.path).toEqual(plan.foot.path);
        expect(plan.horse.distanceKm).toBeCloseTo(plan.foot.distanceKm);
        expect(plan.horse.timeHours).toBeCloseTo(plan.foot.timeHours / 2);
    });

    it('simplifies the rendered path down to its corners, without changing distance/time', () => {
        const plan = planRoutes([0, 0], [5, 5], emptyRoutingGeodata());

        // A perfectly straight diagonal over open terrain collapses to just its two endpoints,
        // even though the underlying grid path visits hundreds of cells along the way.
        expect(plan.foot.path).toHaveLength(2);
        expect(plan.foot.path[0][0]).toBeCloseTo(0, 1);
        expect(plan.foot.path[0][1]).toBeCloseTo(0, 1);
        expect(plan.foot.path[1][0]).toBeCloseTo(5, 1);
        expect(plan.foot.path[1][1]).toBeCloseTo(5, 1);
        expect(plan.foot.distanceKm).toBeGreaterThan(0);
        expect(plan.foot.timeHours).toBeGreaterThan(0);
    });

    it('always returns a dragon route, independent of ground passability', () => {
        const plan = planRoutes([0, 0], [5, 5], emptyRoutingGeodata());
        expect(plan.dragon).toEqual(calculateDragonRoute([0, 0], [5, 5]));
    });

    it('returns null foot/horse when a wall of water fully separates the points, but still returns dragon', () => {
        const from: [number, number] = [0, 0];
        const to: [number, number] = [10, 0];
        const wallGeodata: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            lakes: collection([rect([5, -100], 1, 200)]),
        };

        const plan = planRoutes(from, to, wallGeodata);

        expect(plan.foot).toBeNull();
        expect(plan.horse).toBeNull();
        expect(plan.dragon).toEqual(calculateDragonRoute(from, to));
    });

    it('returns null foot/horse when either point lies off the land', () => {
        const from: [number, number] = [0, 0];
        const to: [number, number] = [10, 10];
        const geodataWithSea: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            continents: collection([rect([-5, -5], 12, 12)]),
        };

        const plan = planRoutes(from, to, geodataWithSea);

        expect(plan.foot).toBeNull();
        expect(plan.horse).toBeNull();
    });
});

describe('planRoutes with roadNetwork', () => {
    it('follows the exact road path, not a grid shortcut, when from/to share a road group', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[0, 0], [0, 5], [5, 5]],
            edges: [{ from: 0, to: 1, distance: 5 }, { from: 1, to: 2, distance: 5 }],
            nodeGroups: [0, 0, 0],
        };

        const plan = planRoutes([0, 0], [5, 5], emptyRoutingGeodata(), roadNetwork);

        // A straight line would be shorter (~7.07), but the road takes an L-shaped detour -
        // the result must follow that exact detour, not the grid's cheaper direct route.
        expect(plan.foot.path).toEqual([[0, 0], [0, 5], [5, 5]]);
        expect(plan.foot.distanceKm).toBeCloseTo(10 * KM_PER_COORD_UNIT, 5);
    });

    it('rides the road as far as possible, then finishes with the grid algorithm', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[0, 0], [3, 0]],
            edges: [{ from: 0, to: 1, distance: 3 }],
            nodeGroups: [0, 0],
        };

        const plan = planRoutes([0, 0], [3.5, 0], emptyRoutingGeodata(), roadNetwork);

        expect(plan.foot.path[0]).toEqual([0, 0]);
        expect(plan.foot.distanceKm).toBeGreaterThan(3 * KM_PER_COORD_UNIT);
        expect(plan.foot.distanceKm).toBeLessThan(4 * KM_PER_COORD_UNIT);
    });

    it('crosses via the network even when neither endpoint sits on it, if that shortens the trip', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[2, 0], [8, 0]],
            // A distance well below the nodes' own 6-unit separation, standing in for a road
            // shortcut real data would express through its own geometry (e.g. a more direct
            // alignment than either grid leg alone) - this isolates the distance-comparison gate.
            edges: [{ from: 0, to: 1, distance: 3 }],
            nodeGroups: [0, 0],
        };

        const plan = planRoutes([0, 0], [10, 0], emptyRoutingGeodata(), roadNetwork);

        expect(plan.foot).not.toBeNull();
        expect(plan.foot.path.some(([lng, lat]) => lng === 2 && lat === 0)).toBe(true);
        expect(plan.foot.path.some(([lng, lat]) => lng === 8 && lat === 0)).toBe(true);
    });

    it('ignores a network crossing that would make the trip longer, even when both ends are near it', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[0, 5], [10, 5]],
            // Entry (5) + road (40) + exit (5) = 50 against a direct distance of 10, so the road
            // variant loses by more than ROAD_TIME_TOLERANCE and open ground must win.
            edges: [{ from: 0, to: 1, distance: 40 }],
            nodeGroups: [0, 0],
        };

        const plan = planRoutes([0, 0], [10, 0], emptyRoutingGeodata(), roadNetwork);

        expect(plan.foot).not.toBeNull();
        expect(plan.foot.legs.map(leg => leg.kind)).toEqual(['grid']);
        expect(plan.foot.path.every(([, lat]) => lat < 1)).toBe(true);
    });

    it('starts and ends the route exactly at the requested points, not at cell centers', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[2, 0], [8, 0]],
            edges: [{ from: 0, to: 1, distance: 6 }],
            nodeGroups: [0, 0],
        };
        const from: [number, number] = [0.37, 0.11];
        const to: [number, number] = [9.63, -0.29];

        const plan = planRoutes(from, to, emptyRoutingGeodata(), roadNetwork);

        expect(plan.foot.path[0]).toEqual(from);
        expect(plan.foot.path[plan.foot.path.length - 1]).toEqual(to);
    });

    it('skips a nearer-but-unreachable exit node in favor of a farther one that actually works', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[0, 0], [6, 2], [6, -5]],
            edges: [{ from: 0, to: 1, distance: 6.32 }, { from: 1, to: 2, distance: 7 }],
            nodeGroups: [0, 0, 0],
        };
        // Node [6, 2] is numerically closer to the target than [6, -5], so it's tried first - but it
        // sits off the land, which no detour can fix, while [6, -5] approaches the target over solid
        // ground. Off the land rather than in a lake on purpose: a point in a lake gets moved to the
        // nearest shore, so it would stay usable.
        const geodataWithWall: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            continents: collection([rect([-2, -8], 14, 9)]),
        };

        const plan = planRoutes([0, 0], [10, 0], geodataWithWall, roadNetwork);

        // [6, 2] still shows up as a waypoint along the road to [6, -5] (the chain passes through
        // it), but the exit actually used must be [6, -5] - a fully-direct fallback (~854km) or a
        // route stuck exiting at the blocked node would both come out far shorter than this.
        expect(plan.foot).not.toBeNull();
        expect(plan.foot.path.some(([lng, lat]) => lng === 6 && lat === -5)).toBe(true);
        expect(plan.foot.distanceKm).toBeGreaterThan(1500);
    });

    it('falls back to a direct route when the nearest-to-target network node is a dead end', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[0, 0], [5, 5]],
            edges: [{ from: 0, to: 1, distance: 7.07 }],
            nodeGroups: [0, 0],
        };
        // Node [5, 5] is numerically closer to the target than [0, 0], so it gets picked as the exit
        // point - but it sits off the land, so the grid leg from there can never succeed.
        const geodataWithDeadEndNode: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            continents: collection([rect([-2, -2], 12, 6)]),
        };

        const plan = planRoutes([0, 0], [5, 3.5], geodataWithDeadEndNode, roadNetwork);

        expect(plan.foot).not.toBeNull();
        expect(plan.foot.path[0][0]).toBeCloseTo(0, 1);
        expect(plan.foot.path[0][1]).toBeCloseTo(0, 1);
    });

    it('ignores the road network entirely when neither point is on it', () => {
        const roadNetwork: RoadNetwork = {
            nodes: [[100, 100], [105, 100]],
            edges: [{ from: 0, to: 1, distance: 5 }],
            nodeGroups: [0, 0],
        };

        const withNetwork = planRoutes([0, 0], [5, 5], emptyRoutingGeodata(), roadNetwork);
        const withoutNetwork = planRoutes([0, 0], [5, 5], emptyRoutingGeodata());

        expect(withNetwork.foot.path).toEqual(withoutNetwork.foot.path);
    });
});

describe('simplifyPath', () => {
    it('collapses colinear points down to just the endpoints', () => {
        const path: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3]];
        expect(simplifyPath(path, 0.01)).toEqual([[0, 0], [3, 3]]);
    });

    it('keeps a point whose deviation exceeds epsilon', () => {
        const path: [number, number][] = [[0, 0], [1, 1], [2, 0]];
        expect(simplifyPath(path, 0.1)).toEqual([[0, 0], [1, 1], [2, 0]]);
    });

    it('drops a point whose deviation is within epsilon', () => {
        const path: [number, number][] = [[0, 0], [1, 0.05], [2, 0]];
        expect(simplifyPath(path, 0.1)).toEqual([[0, 0], [2, 0]]);
    });

    it('returns paths shorter than 3 points unchanged', () => {
        expect(simplifyPath([[0, 0]], 0.1)).toEqual([[0, 0]]);
        expect(simplifyPath([[0, 0], [1, 1]], 0.1)).toEqual([[0, 0], [1, 1]]);
    });

    it('keeps multiple genuine corners', () => {
        const path: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
        expect(simplifyPath(path, 0.01)).toEqual([[0, 0], [2, 0], [2, 2]]);
    });
});

describe('simplifyPath with a passability test', () => {
    const CELL = 0.5;
    const index = buildRoutingIndex({ ...emptyRoutingGeodata(), lakes: collection([rect([4, -1], 2, 2)]) });
    const DETOUR: [number, number][] = [[0, 0], [3, 0], [3, 1.5], [7, 1.5], [7, 0], [10, 0]];

    it('collapses the detour when only the geometry is considered', () => {
        expect(simplifyPath(DETOUR, 2)).toEqual([[0, 0], [10, 0]]);
    });

    it('keeps the detour when the shortcut it would leave behind is impassable', () => {
        const simplified = simplifyPath(DETOUR, 2, getGroundClearance(index, CELL));
        const isClear = getGroundClearance(index, CELL);

        expect(simplified.length).toBeGreaterThan(2);
        expect(simplified.every((point, at) => at === 0 || isClear(simplified[at - 1], point))).toBe(true);
    });

    it('terminates on a path it cannot fix, rather than splitting for ever', () => {
        const throughTheLake: [number, number][] = [[0, 0], [5, 0], [10, 0]];

        expect(simplifyPath(throughTheLake, 2, getGroundClearance(index, CELL))).toEqual(throughTheLake);
    });
});

describe('pullTautPath', () => {
    const CELL = 0.5;

    it('straightens a staircase with no obstacle down to just its endpoints', () => {
        const index = buildRoutingIndex(emptyRoutingGeodata());
        const path: [number, number][] = [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2]];

        expect(pullTautPath(path, getGroundPassability(index, CELL))).toEqual([[0, 0], [4, 2]]);
    });

    it('keeps a detour around an obstacle instead of cutting through it', () => {
        const wallGeodata: RoutingGeodata = {
            ...emptyRoutingGeodata(),
            lakes: collection([rect([4, -1], 2, 2)]),
        };
        const index = buildRoutingIndex(wallGeodata);
        const path: [number, number][] = [
            [0, 0], [1, 0], [2, 0], [3, 0],
            [3, 1], [4, 1], [5, 1], [6, 1], [7, 1],
            [7, 0], [8, 0], [9, 0], [10, 0],
        ];

        const taut = pullTautPath(path, getGroundPassability(index, CELL));

        expect(taut[0]).toEqual([0, 0]);
        expect(taut[taut.length - 1]).toEqual([10, 0]);
        expect(taut.some(([, y]) => y === 1)).toBe(true);
    });

    it('returns paths shorter than 3 points unchanged', () => {
        const index = buildRoutingIndex(emptyRoutingGeodata());
        expect(pullTautPath([[0, 0]], getGroundPassability(index, CELL))).toEqual([[0, 0]]);
        expect(pullTautPath([[0, 0], [1, 1]], getGroundPassability(index, CELL))).toEqual([[0, 0], [1, 1]]);
    });
});


// The sea fixtures are laid out inside the map bounds, since the sea grid always spans the whole map:
// a wide stretch of painted water, with land only where a test needs something to sail around.
const TEST_WATER = rect([0, 0], 40, 30);
const TEST_ISLAND = square([18, 13], 4);

function seaGeodata(land: Feature<Polygon>[] = [], water = [TEST_WATER]): RoutingGeodata {
    return {
        ...emptyRoutingGeodata(),
        continents: collection([]),
        islands: collection(land),
        seas: collection(water),
    };
}

function port([lng, lat]: [number, number], type = 'city', isPort = true): Feature<Point> {
    return {
        type: 'Feature',
        properties: { id: `${type}-${lng}-${lat}`, type, isPort },
        geometry: { type: 'Point', coordinates: [lng, lat] },
    };
}

describe('classifySeaCell', () => {
    const CELL = 0.1;
    const index = buildRoutingIndex(seaGeodata([TEST_ISLAND]));

    it('classifies open water at full speed', () => {
        expect(classifySeaCell([5, 5], index, CELL)).toBe(WaterK.Default);
    });

    it('refuses a point on an island the water is painted over', () => {
        expect(classifySeaCell([20, 15], index, CELL)).toBeNull();
    });

    it('refuses a point no water polygon covers', () => {
        expect(classifySeaCell([45, 15], index, CELL)).toBeNull();
    });

    it('refuses a point outside the map, water or not', () => {
        expect(classifySeaCell([1, MapBounds.North + 1], index, CELL)).toBeNull();
    });

    it('charges the Smoking Sea ten times over', () => {
        const smoking = buildRoutingIndex(seaGeodata([], [
            rect([0, 0], 40, 30, { id: 'sea-the-smoking-sea' }),
        ]));

        expect(classifySeaCell([5, 5], smoking, CELL)).toBe(WaterK.SmokingSea);
    });

    it('penalises water within the clearance threshold of land, the more the closer to the shore', () => {
        const halfway = classifySeaCell([20, 13 - getSeaClearanceThreshold(CELL) / 2], index, CELL);
        const almostAshore = classifySeaCell([20, 12.999], index, CELL);

        expect(halfway).toBeGreaterThan(0);
        expect(halfway).toBeLessThan(WaterK.Default);
        expect(almostAshore).toBeGreaterThan(0);
        expect(almostAshore).toBeLessThan(halfway / 1000);
    });

    it('leaves water beyond the threshold at full speed', () => {
        const clear: Position = [20, 13 - getSeaClearanceThreshold(CELL) - 0.001];

        expect(classifySeaCell(clear, index, CELL)).toBe(WaterK.Default);
        expect(isOpenSea(clear, index)).toBe(true);
    });
});

describe('isSeaEndpoint', () => {
    const index = buildRoutingIndex({
        ...seaGeodata([TEST_ISLAND]),
        locations: collection([port([20, 13.05]), port([21, 14], 'castle', false)]),
    });

    it('accepts a port, even though it stands on land', () => {
        expect(isSeaEndpoint([20, 13.05], index)).toBe(true);
    });

    it('accepts any point in water', () => {
        expect(isSeaEndpoint([5, 5], index)).toBe(true);
    });

    it('refuses a location on land that is not a port', () => {
        expect(isSeaEndpoint([21, 14], index)).toBe(false);
    });

    it('refuses a point that is neither water nor a port', () => {
        expect(isSeaEndpoint([45, 15], index)).toBe(false);
    });
});

describe('keepsSeaClearance', () => {
    const index = buildRoutingIndex(seaGeodata([TEST_ISLAND]));

    it('accepts a chord that stays as far from land as its ends', () => {
        expect(keepsSeaClearance([5, 5], [35, 5], index)).toBe(true);
    });

    it('rejects a chord that passes closer to land than its ends do', () => {
        const west: Position = [10, 15];
        const east: Position = [30, 15];

        expect(getDistanceToLand(west, index)).toBe(SEA_CLEARANCE);
        expect(getDistanceToLand(east, index)).toBe(SEA_CLEARANCE);
        expect(keepsSeaClearance(west, east, index)).toBe(false);
    });
});

describe('sea routes', () => {
    const index = buildRoutingIndex({
        ...seaGeodata([TEST_ISLAND]),
        locations: collection([port([20, 13.05])]),
    });

    it('plans a route between two points in water, timed at the speed of a ship', () => {
        const plan = planRoutesWithIndex([5, 15], [35, 15], index);

        expect(plan.ship).not.toBeNull();
        expect(plan.ship.timeHours).toBeCloseTo(plan.ship.distanceKm / SpeedKmH.ship, 6);
        expect(plan.ship.legs.map(leg => leg.kind)).toEqual(['sea']);
        expect(plan.foot).toBeNull();
    });

    it('sails around an island rather than over it', () => {
        const plan = planRoutesWithIndex([5, 15], [35, 15], index);

        expect(plan.ship.path.every(point => classifySeaCell(point, index, SEA_CELL_SIZE) !== null)).toBe(true);
        expect(plan.ship.path.some(([, lat]) => Math.abs(lat - 15) > 2)).toBe(true);
    });

    it('keeps every vertex of the drawn route clear of land', () => {
        const plan = planRoutesWithIndex([5, 15], [35, 15], index);

        expect(plan.ship.path.every(point => isOpenSea(point, index))).toBe(true);
    });

    it('finds no route when land runs across the water from edge to edge', () => {
        const walled = buildRoutingIndex(seaGeodata([rect([19, -5], 2, 40)]));

        expect(planRoutesWithIndex([5, 15], [35, 15], walled).ship).toBeNull();
    });

    it('finds no route from a point that is neither water nor a port', () => {
        expect(planRoutesWithIndex([45, 15], [35, 15], index).ship).toBeNull();
    });

    it('leaves a port on land by a stub into the coastal water', () => {
        const plan = planRoutesWithIndex([20, 13.05], [35, 15], index);

        expect(plan.ship).not.toBeNull();
        expect(plan.ship.path[0]).toEqual([20, 13.05]);
        expect(isOpenSea(plan.ship.path[1], index)).toBe(false);
    });

    it('still answers with a dragon route where no ship route exists', () => {
        const plan = planRoutesWithIndex([45, 15], [46, 16], index);

        expect(plan.ship).toBeNull();
        expect(plan.dragon.distanceKm).toBeGreaterThan(0);
    });
});

// Two long thin islands with open water between them: thin so that every port sits on a coast, long so
// that the walk to one end differs from the walk to the other by as much as a test needs.
const WEST_ISLE = rect([2, 10], 10, 2);
const EAST_ISLE = rect([30, 10], 6, 2);
const PORTLESS_ISLE = rect([30, 20], 4, 2);

const WEST_POINT: Position = [7, 11];
const EAST_POINT: Position = [33, 11];
const PORTLESS_POINT: Position = [32, 21];

const EAST_PORT = port([30.2, 11]);

function combinedIndex(westPorts: Feature<Point>[], islands = [WEST_ISLE, EAST_ISLE]) {
    return buildRoutingIndex({
        ...seaGeodata(islands),
        locations: collection([...westPorts, EAST_PORT]),
    });
}

describe('combined routes', () => {
    const index = combinedIndex([port([2.2, 11])]);

    it('walks to a port, sails, and walks on when there is no ground route', () => {
        const plan = planRoutesWithIndex(WEST_POINT, EAST_POINT, index);

        expect(plan.foot).toBeNull();
        expect(plan.footShip).not.toBeNull();
        expect(plan.footShip.legs.map(leg => leg.kind)).toContain('sea');
        expect(plan.footShip.legs.filter(leg => leg.kind !== 'sea').length).toBeGreaterThan(0);
        expect(plan.footShip.ports).toEqual({ fromId: 'city-2.2-11', toId: 'city-30.2-11' });
    });

    it('reports the same route to a rider, only faster, since only the land legs speed up', () => {
        const plan = planRoutesWithIndex(WEST_POINT, EAST_POINT, index);
        const seaTime = (route: RouteResult) => route.legs
            .filter(leg => leg.kind === 'sea')
            .reduce((total, leg) => total + leg.timeHours, 0);

        expect(plan.horseShip.timeHours).toBeLessThan(plan.footShip.timeHours);
        expect(seaTime(plan.horseShip)).toBeCloseTo(seaTime(plan.footShip), 6);
    });

    it('sails on from a point already in water, boarding nothing', () => {
        const plan = planRoutesWithIndex([20, 25], WEST_POINT, index);

        expect(plan.foot).toBeNull();
        expect(plan.ship).toBeNull();
        expect(plan.footShip).not.toBeNull();
        expect(plan.footShip.legs[0].kind).toBe('sea');
        expect(plan.footShip.ports).toEqual({ fromId: null, toId: 'city-2.2-11' });
    });

    it('gives every leg its own distance and time, summing to the route', () => {
        const { legs, distanceKm, timeHours } = planRoutesWithIndex(WEST_POINT, EAST_POINT, index).footShip;

        expect(legs.reduce((total, leg) => total + leg.distanceKm, 0)).toBeCloseTo(distanceKm, 6);
        expect(legs.reduce((total, leg) => total + leg.timeHours, 0)).toBeCloseTo(timeHours, 6);
    });
});

describe('choosing a port by type', () => {
    it('prefers the city when the walk to it is within the band of the nearest port', () => {
        const index = combinedIndex([port([2.2, 11]), port([11.8, 11], 'castle')]);

        expect(planRoutesWithIndex(WEST_POINT, EAST_POINT, index).footShip.ports.fromId).toBe('city-2.2-11');
    });

    it('takes the castle when it is nearer than the band allows the city to be', () => {
        const index = combinedIndex([port([2.2, 11]), port([7.5, 10.2], 'castle')]);

        expect(planRoutesWithIndex(WEST_POINT, EAST_POINT, index).footShip.ports.fromId)
            .toBe('castle-7.5-10.2');
    });

    it('ranks a settlement above a castle and a castle above a ruin', () => {
        const bySettlement = combinedIndex([port([2.2, 11], 'settlement'), port([11.8, 11], 'castle')]);
        const byCastle = combinedIndex([port([2.2, 11], 'castle'), port([11.8, 11], 'ruin')]);

        expect(planRoutesWithIndex(WEST_POINT, EAST_POINT, bySettlement).footShip.ports.fromId)
            .toBe('settlement-2.2-11');
        expect(planRoutesWithIndex(WEST_POINT, EAST_POINT, byCastle).footShip.ports.fromId)
            .toBe('castle-2.2-11');
    });
});

describe('landing where there is no port', () => {
    it('enters an island with no port anywhere on its coast', () => {
        const index = combinedIndex([port([2.2, 11])], [WEST_ISLE, EAST_ISLE, PORTLESS_ISLE]);
        const plan = planRoutesWithIndex(WEST_POINT, PORTLESS_POINT, index);

        expect(plan.foot).toBeNull();
        expect(plan.footShip).not.toBeNull();
        expect(plan.footShip.ports).toEqual({ fromId: 'city-2.2-11', toId: null });
    });
});
