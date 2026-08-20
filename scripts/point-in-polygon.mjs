/**
 * Tests whether a point lies inside a linear ring using the ray casting algorithm.
 *
 * @param {[number, number]} point - Position as `[x, y]`.
 * @param {[number, number][]} ring - Ring vertices as `[x, y]` positions.
 * @returns {boolean} `true` if the point is inside the ring.
 */
function pointInRing(point, ring) {
    const [pointX, pointY] = point;
    let inside = false;
    for (let curr = 0, prev = ring.length - 1; curr < ring.length; prev = curr++) {
        const [currX, currY] = ring[curr];
        const [prevX, prevY] = ring[prev];

        const edgeCrossesHorizontal = currY > pointY !== prevY > pointY;

        const verticalRatio = (pointY - currY) / (prevY - currY);
        const horizontalOffset = (prevX - currX) * verticalRatio;
        const intersectX = currX + horizontalOffset;

        const rayIntersectsEdge = edgeCrossesHorizontal && pointX < intersectX;

        if (rayIntersectsEdge) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Tests whether a point lies inside a GeoJSON polygonal geometry, excluding its holes.
 *
 * @param {import('geojson').Position} point - Position as `[x, y]`.
 * @param {import('geojson').Polygon | import('geojson').MultiPolygon} geometry - Geometry to test against.
 * @returns {boolean} `true` if the point is inside the geometry; `false` for any other geometry type.
 */
export function pointInPolygon(point, geometry) {
    if (geometry.type === 'Polygon') {
        const [outerRing, ...holes] = geometry.coordinates;
        return pointInRing(point, outerRing) && holes.every(hole => !pointInRing(point, hole));
    }
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some(
            ([outerRing, ...holes]) =>
                pointInRing(point, outerRing) && holes.every(hole => !pointInRing(point, hole)),
        );
    }
    return false;
}

/**
 * Tests whether a line is mostly contained by a polygonal geometry, i.e. at least half of its
 * vertices lie inside it.
 *
 * @param {import('geojson').LineString | import('geojson').MultiLineString} line - Line to test.
 * @param {import('geojson').Polygon | import('geojson').MultiPolygon} geometry - Geometry to test against.
 * @returns {boolean} `true` if at least half of the line vertices are inside the geometry; `false` for an empty line.
 */
export function lineInPolygon(line, geometry) {
    const points = line.type === 'MultiLineString' ? line.coordinates.flat() : line.coordinates;
    if (points.length === 0) {
        return false;
    }

    const insidePointsCount = points.filter(point => pointInPolygon(point, geometry)).length;
    return insidePointsCount / points.length >= 0.5;
}
