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
 * @param {import('geojson').MultiPoint} geometry
 * @returns {import('geojson').Position}
 */
export function getMiddleMultiPoint(geometry) {
    const sortedByLng = _.sortBy(geometry.coordinates, '0');
    const middleIndex = Math.floor(geometry.coordinates.length / 2);
    return sortedByLng[middleIndex];
}
