import {
    LineString,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon,
    Position,
} from 'geojson';
import { flatten, flattenDepth } from 'lodash';

export { getCentralPoint, getMiddleMultiPoint } from '../../../scripts/geometry-utils.mjs';

export type HighlightableGeometry = Polygon | MultiPolygon | LineString | MultiLineString | Point | MultiPoint;

export function getGeometryPositions(geometry: HighlightableGeometry): Position[] {
    switch (geometry.type) {
        case 'Point':
            return [geometry.coordinates];
        case 'MultiPoint':
        case 'LineString':
            return geometry.coordinates;
        case 'MultiLineString':
        case 'Polygon':
            return flatten(geometry.coordinates);
        case 'MultiPolygon':
            return flattenDepth<Position>(geometry.coordinates, 2);
    }
}

export function buildMaskPolygon(hole: Polygon | MultiPolygon, bounds: [Position, Position]): Polygon {
    const [[west, south], [east, north]] = bounds;
    const exteriorRing: Position[] = [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
    ];

    const holeRings = getOuterRings(hole)
        .map(ring => clipRingToBounds(ring, bounds))
        .filter(ring => ring.length >= 4)
        // Holes must wind opposite to the exterior ring (GeoJSON right-hand rule).
        .map(ring => [...ring].reverse());

    return {
        type: 'Polygon',
        coordinates: [exteriorRing, ...holeRings],
    };
}

function getOuterRings(geometry: Polygon | MultiPolygon): Position[][] {
    return geometry.type === 'Polygon'
        ? [geometry.coordinates[0]]
        : geometry.coordinates.map(([outerRing]) => outerRing);
}

interface ClipEdge {
    isInside: (point: Position) => boolean;
    intersect: (from: Position, to: Position) => Position;
}

function buildClipEdges([west, south]: Position, [east, north]: Position): ClipEdge[] {
    return [
        {
            isInside: ([lon]) => lon >= west,
            intersect: ([lon1, lat1], [lon2, lat2]) => [
                west,
                lat1 + ((lat2 - lat1) * (west - lon1)) / (lon2 - lon1),
            ],
        },
        {
            isInside: ([lon]) => lon <= east,
            intersect: ([lon1, lat1], [lon2, lat2]) => [
                east,
                lat1 + ((lat2 - lat1) * (east - lon1)) / (lon2 - lon1),
            ],
        },
        {
            isInside: ([, lat]) => lat >= south,
            intersect: ([lon1, lat1], [lon2, lat2]) => [
                lon1 + ((lon2 - lon1) * (south - lat1)) / (lat2 - lat1),
                south,
            ],
        },
        {
            isInside: ([, lat]) => lat <= north,
            intersect: ([lon1, lat1], [lon2, lat2]) => [
                lon1 + ((lon2 - lon1) * (north - lat1)) / (lat2 - lat1),
                north,
            ],
        },
    ];
}

// Sutherland-Hodgman: clip a (closed, possibly non-convex) ring against the axis-aligned `bounds` rectangle.
function clipRingToBounds(ring: Position[], bounds: [Position, Position]): Position[] {
    const openRing = isClosedRing(ring) ? ring.slice(0, -1) : ring;
    const clipped = buildClipEdges(...bounds).reduce(
        (points, edge) => (points.length ? clipAgainstEdge(points, edge) : points),
        openRing,
    );
    return clipped.length ? [...clipped, clipped[0]] : clipped;
}

function clipAgainstEdge(points: Position[], edge: ClipEdge): Position[] {
    return points.reduce<Position[]>((output, current, index) => {
        const previous = points[(index - 1 + points.length) % points.length];
        const currentInside = edge.isInside(current);
        const previousInside = edge.isInside(previous);

        if (currentInside !== previousInside) {
            output.push(edge.intersect(previous, current));
        }
        if (currentInside) {
            output.push(current);
        }
        return output;
    }, []);
}

function isClosedRing(ring: Position[]): boolean {
    const [firstLon, firstLat] = ring[0];
    const [lastLon, lastLat] = ring[ring.length - 1];
    return firstLon === lastLon && firstLat === lastLat;
}
