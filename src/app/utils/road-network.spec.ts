import { RoadNetwork } from '../models';
import { findNearestNodesInGroup, findNetworkAnchor, findNetworkPath } from './road-network';

function network(): RoadNetwork {
    return {
        nodes: [[0, 0], [1, 0], [2, 0], [10, 10], [11, 10]],
        edges: [
            { from: 0, to: 1, distance: 1 },
            { from: 1, to: 2, distance: 1 },
            { from: 3, to: 4, distance: 1 },
        ],
        nodeGroups: [0, 0, 0, 1, 1],
    };
}

describe('findNetworkAnchor', () => {
    it('finds the node, group and zero distance for a point exactly on the network', () => {
        expect(findNetworkAnchor([1, 0], network())).toEqual({ node: 1, group: 0, distance: 0 });
    });

    it('finds the nearest node and its distance for a point not on the network', () => {
        expect(findNetworkAnchor([1, 3], network())).toEqual({ node: 1, group: 0, distance: 3 });
    });
});

describe('findNearestNodesInGroup', () => {
    it('ranks nodes within the given group by distance, ignoring other groups', () => {
        expect(findNearestNodesInGroup(network(), 0, [3, 0], 2)).toEqual([
            { node: 2, distance: 1 },
            { node: 1, distance: 2 },
        ]);
    });

    it('returns an empty array when the group has no nodes', () => {
        expect(findNearestNodesInGroup(network(), 5, [0, 0], 2)).toEqual([]);
    });
});

describe('findNetworkPath', () => {
    it('returns the shortest path and total distance between two connected nodes', () => {
        expect(findNetworkPath(network(), 0, 2)).toEqual({ path: [[0, 0], [1, 0], [2, 0]], distance: 2 });
    });

    it('returns a single-point zero-distance path when source equals target', () => {
        expect(findNetworkPath(network(), 1, 1)).toEqual({ path: [[1, 0]], distance: 0 });
    });

    it('returns null when the nodes are in different components', () => {
        expect(findNetworkPath(network(), 0, 3)).toBeNull();
    });
});
