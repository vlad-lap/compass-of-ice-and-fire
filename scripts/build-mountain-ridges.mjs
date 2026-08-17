import polygonClipping from 'polygon-clipping';
import { lineInPolygon } from './point-in-polygon.mjs';

const { intersection, union, difference } = polygonClipping;

const BASE_NORMAL_LENGTH = 1;
const TAPER_LENGTH_RATIO = 1.25;
const LIGHT_NORMAL_RATIO = 0.5;
const LIGHT_DIRECTION = normalize([-1, 1]);
const BBOX_MARGIN = 1e-6;
const UNION_OFFSET_RATIO = 0.2;

function getNormalLength(height) {
    return BASE_NORMAL_LENGTH / Math.sqrt(height ?? 1);
}

function roundMultiPolygon(coordinates) {
    const COORDINATE_PRECISION = 1e9;
    
    return coordinates.map(polygon =>
        polygon.map(ring =>
            ring.map(([lon, lat]) => [
                Math.round(lon * COORDINATE_PRECISION) / COORDINATE_PRECISION,
                Math.round(lat * COORDINATE_PRECISION) / COORDINATE_PRECISION,
            ]),
        ),
    );
}

function unionAll(geometries) {
    if (!geometries.length) {
        return [];
    }
    const merged = roundMultiPolygon(union(...geometries));
    return roundMultiPolygon(union(merged));
}

function fillHoles(coordinates) {
    if (!coordinates.length) {
        return [];
    }
    let filled = coordinates;
    do {
        filled = roundMultiPolygon(union(filled.map(([outerRing]) => [outerRing])));
    } while (filled.some(polygon => polygon.length > 1));

    return filled;
}

function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
}

function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
}

function scale(v, amount) {
    return [v[0] * amount, v[1] * amount];
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
}

function normalize(v) {
    const length = Math.hypot(v[0], v[1]);
    return length === 0 ? [0, 0] : [v[0] / length, v[1] / length];
}

function perpendicular(v) {
    return [-v[1], v[0]];
}

function getSignedArea(ring) {
    let doubledArea = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        doubledArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return doubledArea / 2;
}

function buildRingOffsetPolygons(ring, offset) {
    const points = ring.slice(0, -1);
    const outwardSign = getSignedArea(ring) >= 0 ? -1 : 1;
    const edgeNormals = points.map((point, index) =>
        scale(perpendicular(normalize(subtract(points[(index + 1) % points.length], point))), outwardSign * offset),
    );

    return points.flatMap((point, index) => {
        const nextPoint = points[(index + 1) % points.length];
        const edgeNormal = edgeNormals[index];
        const previousEdgeNormal = edgeNormals[(index - 1 + points.length) % points.length];

        return [
            [[point, nextPoint, add(nextPoint, edgeNormal), add(point, edgeNormal), point]],
            [[point, add(point, previousEdgeNormal), add(point, edgeNormal), point]],
        ];
    });
}

function offsetOutward(coordinates, offset) {
    if (!coordinates.length || offset <= 0) {
        return coordinates;
    }
    const offsetPolygons = coordinates.flatMap(polygon =>
        polygon.flatMap(ring => buildRingOffsetPolygons(ring, offset)),
    );
    return roundMultiPolygon(union([...coordinates, ...offsetPolygons]));
}

function getTangent(points, index) {
    const previous = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    return normalize(subtract(next, previous));
}

function getCumulativeDistances(points) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
        distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    return distances;
}

function getTaperFactors(points, taperLength) {
    const cumulativeDistances = getCumulativeDistances(points);
    const totalLength = cumulativeDistances[cumulativeDistances.length - 1];

    return cumulativeDistances.map(distance => {
        const distanceFromNearestEnd = Math.min(distance, totalLength - distance);
        return Math.min(distanceFromNearestEnd / taperLength, 1);
    });
}

function getLightSign(lineString) {
    const overallTangent = normalize(subtract(lineString[lineString.length - 1], lineString[0]));
    const perpendicularVector = perpendicular(overallTangent);
    return dot(perpendicularVector, LIGHT_DIRECTION) >= 0 ? 1 : -1;
}

function segmentIntersection(p1, p2, p3, p4) {
    const d1x = p2[0] - p1[0];
    const d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0];
    const d2y = p4[1] - p3[1];

    const denominator = d1x * d2y - d1y * d2x;
    if (denominator === 0) {
        return null;
    }

    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denominator;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) {
        return null;
    }

    return [p1[0] + t * d1x, p1[1] + t * d1y];
}

function trimFoldedOffsets(points, offsetPoints) {
    const trimmed = [...offsetPoints];

    for (let i = 0; i < points.length - 1; i++) {
        const crossing = segmentIntersection(points[i], trimmed[i], points[i + 1], trimmed[i + 1]);
        if (crossing) {
            trimmed[i] = crossing;
            trimmed[i + 1] = crossing;
        }
    }

    return trimmed;
}

function buildRidgeSide(points, normals, taperFactors, sign, length) {
    const offsetPoints = points.map((point, index) =>
        add(point, scale(normals[index], sign * length * taperFactors[index])),
    );
    const trimmedOffsetPoints = trimFoldedOffsets(points, offsetPoints);
    return [...points, ...trimmedOffsetPoints.reverse(), points[0]];
}

function buildRidgePolygons(lineString, normalLength) {
    const lightSign = getLightSign(lineString);
    const lightNormals = lineString.map((point, index) =>
        scale(perpendicular(getTangent(lineString, index)), lightSign),
    );
    const taperFactors = getTaperFactors(lineString, normalLength * TAPER_LENGTH_RATIO);

    return {
        light: buildRidgeSide(lineString, lightNormals, taperFactors, 1, normalLength * LIGHT_NORMAL_RATIO),
        dark: buildRidgeSide(lineString, lightNormals, taperFactors, -1, normalLength),
    };
}

function findContainingLandmass(lineString, landmasses) {
    const lineGeometry = { type: 'LineString', coordinates: lineString };
    return landmasses.find(landmass => lineInPolygon(lineGeometry, landmass.geometry));
}

function getBoundingBox(points) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of points) {
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
    }
    return {
        minLon: minLon - BBOX_MARGIN,
        minLat: minLat - BBOX_MARGIN,
        maxLon: maxLon + BBOX_MARGIN,
        maxLat: maxLat + BBOX_MARGIN,
    };
}

function intersectVerticalEdge(a, b, lon) {
    const t = (lon - a[0]) / (b[0] - a[0]);
    return [lon, a[1] + t * (b[1] - a[1])];
}

function intersectHorizontalEdge(a, b, lat) {
    const t = (lat - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), lat];
}

function clipPointsAgainstEdge(points, isInside, intersectEdge) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const previous = points[(i - 1 + points.length) % points.length];
        const currentInside = isInside(current);

        if (currentInside !== isInside(previous)) {
            output.push(intersectEdge(previous, current));
        }
        if (currentInside) {
            output.push(current);
        }
    }
    return output;
}

function clipRingToBbox(ring, bbox) {
    let points = ring.slice(0, -1);
    points = clipPointsAgainstEdge(points, ([lon]) => lon >= bbox.minLon, (a, b) => intersectVerticalEdge(a, b, bbox.minLon));
    points = clipPointsAgainstEdge(points, ([lon]) => lon <= bbox.maxLon, (a, b) => intersectVerticalEdge(a, b, bbox.maxLon));
    points = clipPointsAgainstEdge(points, ([, lat]) => lat >= bbox.minLat, (a, b) => intersectHorizontalEdge(a, b, bbox.minLat));
    points = clipPointsAgainstEdge(points, ([, lat]) => lat <= bbox.maxLat, (a, b) => intersectHorizontalEdge(a, b, bbox.maxLat));

    return points.length < 3 ? null : [...points, points[0]];
}

function cropPolygonToBbox(rings, bbox) {
    const croppedRings = rings.map(ring => clipRingToBbox(ring, bbox)).filter(Boolean);
    return croppedRings.length ? croppedRings : null;
}

function cropGeometryToBbox(geometry, bbox) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(rings => cropPolygonToBbox(rings, bbox)).filter(Boolean);
}

function clipPolygonToLandmass(polygon, landmass) {
    if (!landmass) {
        return [polygon];
    }
    const bbox = getBoundingBox(polygon.flat());
    const croppedLandmass = cropGeometryToBbox(landmass.geometry, bbox);
    return roundMultiPolygon(intersection(polygon, croppedLandmass));
}

function buildRidgeFeature(feature, shade, segments) {
    const clippedPolygons = segments.flatMap(({ ring, landmass }) => clipPolygonToLandmass([ring], landmass));
    const coordinates = unionAll(clippedPolygons);

    return {
        type: 'Feature',
        properties: { ...feature.properties, shade },
        geometry: { type: 'MultiPolygon', coordinates },
    };
}

function subtractOverlap(feature, otherFeature) {
    if (!feature.geometry.coordinates.length || !otherFeature.geometry.coordinates.length) {
        return feature;
    }

    return {
        ...feature,
        geometry: {
            ...feature.geometry,
            coordinates: roundMultiPolygon(difference(feature.geometry.coordinates, otherFeature.geometry.coordinates)),
        },
    };
}

function buildRidgeFeatures(feature, landmasses) {
    const normalLength = getNormalLength(feature.properties.height);
    const lineStrings = feature.geometry.coordinates;
    const segments = lineStrings.map(lineString => ({
        ridge: buildRidgePolygons(lineString, normalLength),
        landmass: findContainingLandmass(lineString, landmasses),
    }));

    const light = buildRidgeFeature(feature, 'light', segments.map(({ ridge, landmass }) => ({ ring: ridge.light, landmass })));
    const dark = buildRidgeFeature(feature, 'dark', segments.map(({ ridge, landmass }) => ({ ring: ridge.dark, landmass })));

    return [light, subtractOverlap(dark, light)];
}

export function buildMountainRidges(mountains, continents, islands) {
    const landmasses = [...continents.features, ...islands.features];
    const features = mountains.features.flatMap(feature => buildRidgeFeatures(feature, landmasses));
    return { type: 'FeatureCollection', features };
}

function expandWithinLandmass(polygon, offset, landmasses) {
    const landmass = findContainingLandmass(polygon[0], landmasses);
    return offsetOutward([polygon], offset).flatMap(expandedPolygon =>
        clipPolygonToLandmass(expandedPolygon, landmass),
    );
}

export function buildMountainUnion(mountainRidges, continents, islands) {
    const landmasses = [...continents.features, ...islands.features];
    const groups = new Map();

    for (const feature of mountainRidges.features) {
        const { shade, ...properties } = feature.properties;
        if (!groups.has(properties.id)) {
            groups.set(properties.id, { properties, geometries: [] });
        }
        groups.get(properties.id).geometries.push(feature.geometry.coordinates);
    }

    return {
        type: 'FeatureCollection',
        features: [...groups.values()].map(({ properties, geometries }) => {
            const offset = getNormalLength(properties.height) * UNION_OFFSET_RATIO;
            const expanded = unionAll(geometries).flatMap(polygon => expandWithinLandmass(polygon, offset, landmasses));

            return {
                type: 'Feature',
                properties,
                geometry: { type: 'MultiPolygon', coordinates: fillHoles(expanded) },
            };
        }),
    };
}
