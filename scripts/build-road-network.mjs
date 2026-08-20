const NODE_KEY_PRECISION = 9;

function getLineParts(feature) {
    return feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
}

function getNodeKey([lng, lat]) {
    return `${lng.toFixed(NODE_KEY_PRECISION)},${lat.toFixed(NODE_KEY_PRECISION)}`;
}

function getNodeIndex(point, nodeIndexByKey, nodes) {
    const key = getNodeKey(point);
    if (!nodeIndexByKey.has(key)) {
        nodeIndexByKey.set(key, nodes.length);
        nodes.push(point);
    }
    return nodeIndexByKey.get(key);
}

function findRoot(parents, node) {
    while (parents[node] !== node) {
        node = parents[node];
    }
    return node;
}

function union(parents, a, b) {
    const rootA = findRoot(parents, a);
    const rootB = findRoot(parents, b);
    if (rootA !== rootB) {
        parents[rootA] = rootB;
    }
}

export function buildRoadNetwork(roadsCollection) {
    const nodes = [];
    const nodeIndexByKey = new Map();
    const edges = [];

    for (const feature of roadsCollection.features) {
        for (const line of getLineParts(feature)) {
            for (let i = 0; i < line.length - 1; i++) {
                const from = getNodeIndex(line[i], nodeIndexByKey, nodes);
                const to = getNodeIndex(line[i + 1], nodeIndexByKey, nodes);
                if (from === to) {
                    continue;
                }
                const distance = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
                edges.push({ from, to, distance });
            }
        }
    }

    const parents = nodes.map((_, index) => index);
    for (const edge of edges) {
        union(parents, edge.from, edge.to);
    }

    const groupIdByRoot = new Map();
    const nodeGroups = parents.map((_, index) => {
        const root = findRoot(parents, index);
        if (!groupIdByRoot.has(root)) {
            groupIdByRoot.set(root, groupIdByRoot.size);
        }
        return groupIdByRoot.get(root);
    });

    return { nodes, edges, nodeGroups };
}
