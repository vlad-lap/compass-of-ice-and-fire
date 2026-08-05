function pointKey([lng, lat]) {
    return `${lng},${lat}`;
}

function mergeSegmentsIntoLines(edges) {
    const adjacency = new Map();
    edges.forEach(([start, end], index) => {
        const startKey = pointKey(start);
        const endKey = pointKey(end);
        if (!adjacency.has(startKey)) adjacency.set(startKey, []);
        if (!adjacency.has(endKey)) adjacency.set(endKey, []);
        adjacency.get(startKey).push({ point: end, edgeIndex: index });
        adjacency.get(endKey).push({ point: start, edgeIndex: index });
    });

    const used = new Array(edges.length).fill(false);
    const lines = [];

    for (let i = 0; i < edges.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const line = [edges[i][0], edges[i][1]];

        let extended = true;
        while (extended) {
            extended = false;
            const candidates = adjacency.get(pointKey(line[line.length - 1])) || [];
            for (const { point, edgeIndex } of candidates) {
                if (!used[edgeIndex]) {
                    used[edgeIndex] = true;
                    line.push(point);
                    extended = true;
                    break;
                }
            }
        }

        extended = true;
        while (extended) {
            extended = false;
            const candidates = adjacency.get(pointKey(line[0])) || [];
            for (const { point, edgeIndex } of candidates) {
                if (!used[edgeIndex]) {
                    used[edgeIndex] = true;
                    line.unshift(point);
                    extended = true;
                    break;
                }
            }
        }

        lines.push(line);
    }

    return lines;
}

export function buildKingdomBorders(kingdoms, continents, islands) {
    const coastlineVertices = new Set();
    for (const source of [continents, islands]) {
        for (const feature of source.features) {
            const rings =
                feature.geometry.type === 'Polygon'
                    ? feature.geometry.coordinates
                    : feature.geometry.coordinates.flat(1);
            for (const ring of rings) {
                for (const [lng, lat] of ring) {
                    coastlineVertices.add(`${lng},${lat}`);
                }
            }
        }
    }

    const segments = new Map();

    for (const feature of kingdoms.features) {
        const { id, name, name_ru } = feature.properties;
        const rings =
            feature.geometry.type === 'Polygon'
                ? feature.geometry.coordinates
                : feature.geometry.coordinates.flat(1);

        for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i++) {
                const segmentStart = ring[i];
                const segmentEnd = ring[i + 1];
                const segmentStartKey = `${segmentStart[0]},${segmentStart[1]}`;
                const segmentEndKey = `${segmentEnd[0]},${segmentEnd[1]}`;

                if (
                    coastlineVertices.has(segmentStartKey) &&
                    coastlineVertices.has(segmentEndKey)
                ) {
                    continue;
                }

                const segKey =
                    segmentStartKey < segmentEndKey
                        ? `${segmentStartKey}|${segmentEndKey}`
                        : `${segmentEndKey}|${segmentStartKey}`;

                if (!segments.has(segKey)) {
                    segments.set(segKey, {
                        coordinates: [segmentStart, segmentEnd],
                        kingdomNames: [],
                    });
                }
                segments.get(segKey).kingdomNames.push({ id, name, name_ru });
            }
        }
    }

    const borderGroups = new Map();

    for (const { coordinates, kingdomNames } of segments.values()) {
        const [first, second] = kingdomNames;
        const pairKey = second ? `${first.id}::${second.id}` : first.id;

        if (!borderGroups.has(pairKey)) {
            borderGroups.set(pairKey, { first, second, edges: [] });
        }
        borderGroups.get(pairKey).edges.push(coordinates);
    }

    return {
        type: 'FeatureCollection',
        features: Array.from(borderGroups.values()).map(({ first, second, edges }) => {
            const lines = mergeSegmentsIntoLines(edges);
            const geometry =
                lines.length === 1
                    ? { type: 'LineString', coordinates: lines[0] }
                    : { type: 'MultiLineString', coordinates: lines };

            return {
                type: 'Feature',
                properties: {
                    id: second ? `border-${first.id}-${second.id}` : `border-${first.id}`,
                    name: second ? `${first.name} - ${second.name}` : first.name,
                    name_ru: second ? `${first.name_ru} - ${second.name_ru}` : first.name_ru,
                },
                geometry,
            };
        }),
    };
}
