const BLOCKING_RIVER_SIZES = [2, 3];

// The Wall can only be crossed where a castle holds a gate through it. Unlike a river, not every
// location on it counts: 15 of the 18 castles along the Wall are ruins, and only these hold a way
// through. Naming them explicitly is the point - it is a lore decision, not something the geometry
// can tell us.
const WALL_GATE_IDS = [
    'castle-castle-black',
    'castle-eastwatch-by-the-sea',
    'castle-shadow-tower',
    'ruin-nightfort',
];

// How close a location has to sit to a blocking river to count as a crossing on it. The data splits
// cleanly here: 42 locations lie within 0.5 km of such a river and the next one is 2.3 km out, while
// the endpoints that are supposed to route *via* a crossing (Pennytree 17 km, Selhorys 19 km) are far
// beyond it. 3 km leaves room for map imprecision without pulling any of those in.
const LOCATION_ON_RIVER_KM = 3;
const KM_PER_COORD_UNIT = 85.371;

function getLineParts(feature) {
    return feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
}

function getSegmentIntersection(a, b, c, d) {
    const cross = (from, to, point) =>
        (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0]);

    const abc = cross(a, b, c);
    const abd = cross(a, b, d);
    const cda = cross(c, d, a);
    const cdb = cross(c, d, b);

    if (abc * abd >= 0 || cda * cdb >= 0) {
        return null;
    }

    const t = cda / (cda - cdb);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function getClosestPointOnSegment(point, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    if (dx === 0 && dy === 0) {
        return a;
    }

    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return [a[0] + t * dx, a[1] + t * dy];
}

function snapToLine(point, feature) {
    let nearest = null;

    for (const part of getLineParts(feature)) {
        for (let i = 0; i < part.length - 1; i++) {
            const onLine = getClosestPointOnSegment(point, part[i], part[i + 1]);
            const distance = Math.hypot(point[0] - onLine[0], point[1] - onLine[1]);
            if (!nearest || distance < nearest.distance) {
                nearest = { distance, point: onLine };
            }
        }
    }

    return nearest.point;
}

function getFeatureLabel(feature) {
    return feature.properties?.name ?? feature.properties?.id ?? 'unnamed';
}

/**
 * Points where a barrier the routing treats as impassable may be crossed. Barriers are the rivers of
 * size 2 or 3 and the Wall; everywhere other than these points they block movement outright.
 *
 * A river is crossable where a road bridges or fords it and where a location sits on it. The Wall is
 * crossable only at the castles that hold a gate, listed in WALL_GATE_IDS.
 *
 * Derived at build time so the runtime does not have to test every cell against every location, and
 * so the crossings are inspectable data rather than a side effect of a proximity threshold.
 *
 * @param {import('geojson').FeatureCollection} roadsCollection - Road lines.
 * @param {import('geojson').FeatureCollection} riversCollection - River lines, with `properties.size`.
 * @param {import('geojson').FeatureCollection} wallCollection - The Wall.
 * @param {import('geojson').FeatureCollection} locationsCollection - Location points.
 * @returns {{ crossings: { point: [number, number], kind: 'bridge' | 'location' | 'gate', barrier: string, via: string }[] }}
 */
export function buildBarrierCrossings(roadsCollection, riversCollection, wallCollection, locationsCollection) {
    const rivers = riversCollection.features.filter(feature =>
        BLOCKING_RIVER_SIZES.includes(feature.properties?.size),
    );
    const crossings = [];

    for (const road of roadsCollection.features) {
        for (const roadPart of getLineParts(road)) {
            for (let i = 0; i < roadPart.length - 1; i++) {
                for (const river of rivers) {
                    for (const riverPart of getLineParts(river)) {
                        for (let j = 0; j < riverPart.length - 1; j++) {
                            const point = getSegmentIntersection(
                                roadPart[i],
                                roadPart[i + 1],
                                riverPart[j],
                                riverPart[j + 1],
                            );

                            if (point) {
                                crossings.push({
                                    point,
                                    kind: 'bridge',
                                    barrier: getFeatureLabel(river),
                                    via: getFeatureLabel(road),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    const threshold = LOCATION_ON_RIVER_KM / KM_PER_COORD_UNIT;

    for (const location of locationsCollection.features) {
        const point = location.geometry.coordinates;
        let nearest = null;

        for (const river of rivers) {
            for (const riverPart of getLineParts(river)) {
                for (let j = 0; j < riverPart.length - 1; j++) {
                    const onRiver = getClosestPointOnSegment(point, riverPart[j], riverPart[j + 1]);
                    const distance = Math.hypot(point[0] - onRiver[0], point[1] - onRiver[1]);
                    if (distance <= threshold && (!nearest || distance < nearest.distance)) {
                        nearest = { distance, point: onRiver, barrier: getFeatureLabel(river) };
                    }
                }
            }
        }

        if (nearest) {
            // Snapped onto the river rather than kept at the location, so the hole the routing opens
            // is centred on the water it has to get across and can stay small.
            crossings.push({
                point: nearest.point,
                kind: 'location',
                barrier: nearest.barrier,
                via: getFeatureLabel(location),
            });
        }
    }

    for (const wall of wallCollection.features) {
        const label = getFeatureLabel(wall);

        for (const gateId of WALL_GATE_IDS) {
            const castle = locationsCollection.features.find(feature => feature.properties?.id === gateId);
            if (!castle) {
                throw new Error(`${label}: no location with id ${gateId} to place a gate at`);
            }

            crossings.push({
                point: snapToLine(castle.geometry.coordinates, wall),
                kind: 'gate',
                barrier: label,
                via: getFeatureLabel(castle),
            });
        }
    }

    return { crossings };
}
