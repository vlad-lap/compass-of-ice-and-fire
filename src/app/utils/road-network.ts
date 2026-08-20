import { Position } from 'geojson';
import { RoadNetwork } from '../models';
import { MinHeap } from './min-heap';

export interface NetworkAnchor {
    node: number;
    group: number;
    distance: number;
}

export interface RoadNetworkPath {
    path: Position[];
    distance: number;
}

export function findNetworkAnchor(point: Position, network: RoadNetwork): NetworkAnchor | null {
    let bestNode = -1;
    let bestDistance = Infinity;

    network.nodes.forEach((node, index) => {
        const distance = Math.hypot(node[0] - point[0], node[1] - point[1]);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestNode = index;
        }
    });

    return bestNode === -1 ? null : { node: bestNode, group: network.nodeGroups[bestNode], distance: bestDistance };
}

export function findNearestNodesInGroup(
    network: RoadNetwork,
    group: number,
    target: Position,
    count: number,
): { node: number; distance: number }[] {
    return network.nodes
        .map((node, index) => ({ node: index, distance: Math.hypot(node[0] - target[0], node[1] - target[1]) }))
        .filter(candidate => network.nodeGroups[candidate.node] === group)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);
}

type Adjacency = { to: number; distance: number }[][];

const adjacencyByNetwork = new WeakMap<RoadNetwork, Adjacency>();

function getAdjacency(network: RoadNetwork): Adjacency {
    const cached = adjacencyByNetwork.get(network);
    if (cached) {
        return cached;
    }

    const adjacency: Adjacency = network.nodes.map(() => []);
    for (const edge of network.edges) {
        adjacency[edge.from].push({ to: edge.to, distance: edge.distance });
        adjacency[edge.to].push({ to: edge.from, distance: edge.distance });
    }

    adjacencyByNetwork.set(network, adjacency);
    return adjacency;
}

const NO_PARENT = -1;

interface NetworkSearch {
    distances: Float64Array;
    cameFrom: Int32Array;
}

// Route planning asks for distances from a handful of candidate nodes and then for the paths of the
// few it settles on, so each source is searched once and reused. Capped rather than unbounded: the
// network object outlives a single request, and one search costs ~8 bytes plus 4 per node.
const MAX_CACHED_SEARCHES = 64;
const searchesByNetwork = new WeakMap<RoadNetwork, Map<number, NetworkSearch>>();

function getNetworkSearch(network: RoadNetwork, source: number): NetworkSearch {
    let searches = searchesByNetwork.get(network);
    if (!searches) {
        searches = new Map();
        searchesByNetwork.set(network, searches);
    }

    const cached = searches.get(source);
    if (cached) {
        return cached;
    }

    const search = runNetworkSearch(network, source);
    if (searches.size >= MAX_CACHED_SEARCHES) {
        searches.clear();
    }
    searches.set(source, search);

    return search;
}

function runNetworkSearch(network: RoadNetwork, source: number): NetworkSearch {
    const adjacency = getAdjacency(network);
    const distances = new Float64Array(network.nodes.length).fill(Infinity);
    const cameFrom = new Int32Array(network.nodes.length).fill(NO_PARENT);
    const visited = new Uint8Array(network.nodes.length);
    const open = new MinHeap<number>();

    distances[source] = 0;
    open.push(0, source);

    while (open.size > 0) {
        const current = open.pop();
        if (visited[current]) {
            continue;
        }
        visited[current] = 1;

        for (const { to, distance } of adjacency[current]) {
            const tentative = distances[current] + distance;
            if (tentative < distances[to]) {
                distances[to] = tentative;
                cameFrom[to] = current;
                open.push(tentative, to);
            }
        }
    }

    return { distances, cameFrom };
}

export function getNetworkDistances(network: RoadNetwork, source: number): Float64Array {
    return getNetworkSearch(network, source).distances;
}

export function findNetworkPath(network: RoadNetwork, source: number, target: number): RoadNetworkPath | null {
    if (source === target) {
        return { path: [network.nodes[source]], distance: 0 };
    }

    const { distances, cameFrom } = getNetworkSearch(network, source);
    if (!isFinite(distances[target])) {
        return null;
    }

    const path: Position[] = [network.nodes[target]];
    let node = target;
    while (node !== source) {
        node = cameFrom[node];
        path.unshift(network.nodes[node]);
    }

    return { path, distance: distances[target] };
}
