import { FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import { FeatureData } from './location';

export type TravelMode = 'foot' | 'horse' | 'dragon';

export type RoutePointValue = FeatureData | Position | string;

export interface RouteEndpoints {
    from?: RoutePointValue;
    to?: RoutePointValue;
}

export interface RouteResult {
    path: Position[];
    distanceKm: number;
    timeHours: number;
}

export type RouteLegKind = 'road' | 'grid';

// The stretches a route is made of. Their paths partition `RouteResult.path` exactly: concatenating
// them in order reproduces the drawn route, and every point belongs to one leg.
export interface RouteLeg {
    kind: RouteLegKind;
    path: Position[];
    cost: number;
}

export interface RoutePlan {
    foot: RouteResult | null;
    horse: RouteResult | null;
    dragon: RouteResult;
    legs: RouteLeg[];
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

// A line that blocks movement, together with the crossings declared for it. Keeping them attached is
// what stops a bridge over one river from opening a hole in another one near a confluence.
export interface IndexedBarrier {
    bbox: BBox;
    geometry: LineString | MultiLineString;
    crossings: Position[];
}

export interface RoutingIndex {
    land: IndexedArea[];
    mountains: IndexedArea[];
    swamps: IndexedArea[];
    deserts: IndexedArea[];
    forests: IndexedArea[];
    lakes: IndexedArea[];
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
