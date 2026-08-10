import _ from 'lodash';

/**
 * @param {import('geojson').Position[]} ring
 * @returns {import('geojson').Position}
 */
function ringCentroid(ring) {
    const [totalLon, totalLat] = ring.reduce(
        ([lon, lat], [posLon, posLat]) => [lon + posLon, lat + posLat],
        [0, 0],
    );
    return [totalLon / ring.length, totalLat / ring.length];
}

/**
 * @param {import('geojson').Position[]} ring
 * @returns {number}
 */
function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        sum += lon1 * lat2 - lon2 * lat1;
    }
    return Math.abs(sum) / 2;
}

/**
 * @param {import('geojson').Polygon | import('geojson').MultiPolygon} geometry
 * @returns {import('geojson').Position}
 */
export function getCentralPoint(geometry) {
    switch (geometry.type) {
        case 'Polygon':
            return ringCentroid(geometry.coordinates[0]);
        case 'MultiPolygon': {
            const weightedCentroids = geometry.coordinates.map(([outerRing]) => ({
                centroid: ringCentroid(outerRing),
                area: ringArea(outerRing),
            }));
            const totalArea = weightedCentroids.reduce((sum, { area }) => sum + area, 0);
            const [totalLon, totalLat] = weightedCentroids.reduce(
                ([lon, lat], { centroid: [posLon, posLat], area }) => [lon + posLon * area, lat + posLat * area],
                [0, 0],
            );
            return [totalLon / totalArea, totalLat / totalArea];
        }
    }
}
/**
 * @param {import('geojson').Position[]} ring
 * @returns {[number, number]}
 */
function ringYExtent(ring) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of ring) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return [minY, maxY];
}

/**
 * @param {import('geojson').Position[][]} rings
 * @param {number} y
 * @returns {number[]}
 */
function scanlineCrossings(rings, y) {
    const xs = [];
    for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[i + 1];
            if ((y1 > y) === (y2 > y)) {
                continue;
            }
            const t = (y - y1) / (y2 - y1);
            xs.push(x1 + t * (x2 - x1));
        }
    }
    return xs.sort((a, b) => a - b);
}

/**
 * @param {number[]} sortedXs
 * @returns {number | null}
 */
function widestGapMidpoint(sortedXs) {
    let widestGap = -Infinity;
    let midpoint = null;
    for (let i = 0; i + 1 < sortedXs.length; i += 2) {
        const gap = sortedXs[i + 1] - sortedXs[i];
        if (gap > widestGap) {
            widestGap = gap;
            midpoint = (sortedXs[i] + sortedXs[i + 1]) / 2;
        }
    }
    return midpoint;
}

/**
 * Scans a horizontal line through the ring set and takes the midpoint of its widest
 * even-odd interior span, guaranteeing a point strictly inside the polygon (holes included),
 * unlike a plain centroid which can land outside for concave/crescent-shaped polygons.
 * @param {import('geojson').Position[][]} rings
 * @returns {import('geojson').Position | null}
 */
function findInteriorPointOnScanline(rings) {
    const [minY, maxY] = ringYExtent(rings[0]);
    const touchesScanline = y => rings.some(ring => ring.some(([, ringY]) => ringY === y));

    let y = (minY + maxY) / 2;
    for (let attempt = 0; touchesScanline(y) && attempt < 10; attempt++) {
        y = minY + (maxY - minY) * (0.5 + (attempt + 1) * 1e-6);
    }

    const midpoint = widestGapMidpoint(scanlineCrossings(rings, y));
    return midpoint === null ? null : [midpoint, y];
}

/**
 * @param {import('geojson').Polygon | import('geojson').MultiPolygon} geometry
 * @returns {import('geojson').Position}
 */
export function getInteriorPoint(geometry) {
    switch (geometry.type) {
        case 'Polygon':
            return findInteriorPointOnScanline(geometry.coordinates) ?? getCentralPoint(geometry);
        case 'MultiPolygon': {
            const largestPolygon = _.maxBy(geometry.coordinates, ([outerRing]) => ringArea(outerRing));
            return findInteriorPointOnScanline(largestPolygon) ?? getCentralPoint(geometry);
        }
        default:
            return getCentralPoint(geometry);
    }
}

/**
 * @param {import('geojson').MultiPoint} geometry
 * @returns {import('geojson').Position}
 */
export function getMiddleMultiPoint(geometry) {
    const sortedByLng = _.sortBy(geometry.coordinates, '0');
    const middleIndex = Math.floor(geometry.coordinates.length / 2);
    return sortedByLng[middleIndex];
}
