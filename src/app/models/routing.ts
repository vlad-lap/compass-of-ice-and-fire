import { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon, Position } from 'geojson';
import { FeatureData } from './location';

export type TravelMode = 'foot' | 'horse' | 'footShip' | 'horseShip' | 'ship' | 'dragon';

export type RoutePointValue = FeatureData | Position | string;

export interface RouteEndpoints {
    from?: RoutePointValue;
    to?: RoutePointValue;
}

// Where a combined route boards and lands. `null` on a landmass that has no port at all, which the
// ship may enter anywhere.
export interface RoutePorts {
    fromId: string | null;
    toId: string | null;
}

export interface RouteResult {
    path: Position[];
    distanceKm: number;
    timeHours: number;
    legs: RouteLeg[];
    ports?: RoutePorts;
}

export type RouteLegKind = 'road' | 'grid' | 'sea';

// The stretches a route is made of. Their paths partition `RouteResult.path` exactly: concatenating
// them in order reproduces the drawn route, and every point belongs to one leg. `distanceKm` and
// `timeHours` are the leg's own share of the journey, so the ui can show a breakdown; they sum to the
// route's totals.
export interface RouteLeg {
    kind: RouteLegKind;
    path: Position[];
    cost: number;
    distanceKm: number;
    timeHours: number;
}

// The routes on offer between two points, each complete in itself. `foot` and `horse` stay on land;
// `footShip` and `horseShip` walk to a port, sail, and walk on - they are planned separately
// because the faster traveller can afford a longer walk to a better placed port, so the two can board
// at different ports. `ship` is water from end to end, and the dragon flies straight.
export interface RoutePlan {
    foot: RouteResult | null;
    horse: RouteResult | null;
    footShip: RouteResult | null;
    horseShip: RouteResult | null;
    ship: RouteResult | null;
    dragon: RouteResult;
}

export type BarrierCrossingKind = 'bridge' | 'location' | 'gate';

// Where a barrier - a size 2/3 river, or the Wall - may be crossed. Derived at build time into
// geodata/barrier-crossings.json.
export interface BarrierCrossing {
    point: Position;
    kind: BarrierCrossingKind;
    barrier: string;
    via: string;
}

export interface BarrierCrossings {
    crossings: BarrierCrossing[];
}

export interface RoutingGeodata {
    continents: FeatureCollection<Polygon | MultiPolygon>;
    islands: FeatureCollection<Polygon | MultiPolygon>;
    rivers: FeatureCollection<LineString | MultiLineString>;
    theWall: FeatureCollection<LineString | MultiLineString>;
    forests: FeatureCollection<Polygon | MultiPolygon>;
    deserts: FeatureCollection<Polygon | MultiPolygon>;
    swamps: FeatureCollection<Polygon | MultiPolygon>;
    mountains: FeatureCollection<Polygon | MultiPolygon>;
    lakes: FeatureCollection<Polygon | MultiPolygon>;
    seas: FeatureCollection<Polygon | MultiPolygon>;
    bays: FeatureCollection<Polygon | MultiPolygon>;
    straits: FeatureCollection<Polygon | MultiPolygon>;
    locations: FeatureCollection<Point>;
    barrierCrossings: BarrierCrossing[];
}

export interface Grid {
    minLng: number;
    minLat: number;
    cellSize: number;
    cols: number;
    rows: number;
}

export interface CellIndex {
    col: number;
    row: number;
}

export type BBox = [number, number, number, number];

export interface IndexedArea {
    bbox: BBox;
    geometry: Polygon | MultiPolygon;
    k: number | null;
}

// A single land polygon, together with the landmass it belongs to: the group of polygons that touch
// each other, and so can be walked between. Two points on different landmasses have no ground route
// however the grid is resolved.
export interface IndexedLandmass extends IndexedArea {
    landmass: number;
}

// A line that blocks movement, together with the crossings declared for it. Keeping them attached is
// what stops a bridge over one river from opening a hole in another one near a confluence.
export interface IndexedBarrier {
    bbox: BBox;
    geometry: LineString | MultiLineString;
    crossings: Position[];
}

export interface CoastSegment {
    from: Position;
    to: Position;
}

// Every land ring edge, hashed into square buckets, so that "how far is this point from land" - asked
// once per sample of a sea route - does not scan a continent's outline.
export type Coastline = Map<number, CoastSegment[]>;

// A port, with what the planner needs to choose between ports: the landmass it stands on, and the
// type that ranks it against the others there.
export interface IndexedPort {
    id: string;
    type: string;
    point: Position;
    landmass: number | null;
}

export interface RoutingIndex {
    land: IndexedLandmass[];
    coastline: Coastline;
    mountains: IndexedArea[];
    swamps: IndexedArea[];
    deserts: IndexedArea[];
    forests: IndexedArea[];
    lakes: IndexedArea[];
    water: IndexedArea[];
    ports: IndexedPort[];
    barriers: IndexedBarrier[];
}

export interface PathResult {
    path: Position[];
    cost: number;
}


export interface RoadNetworkEdge {
    from: number;
    to: number;
    distance: number;
}

export interface RoadNetwork {
    nodes: Position[];
    edges: RoadNetworkEdge[];
    nodeGroups: number[];
}

export interface RouteWorkerInit {
    type: 'init';
    geodata: RoutingGeodata;
    roadNetwork: RoadNetwork | null;
}

export interface RouteWorkerRequest {
    type: 'plan';
    requestId: number;
    from: Position;
    to: Position;
}

export type RouteWorkerMessage = RouteWorkerInit | RouteWorkerRequest;

export interface RouteWorkerResponse {
    requestId: number;
    plan: RoutePlan;
}
